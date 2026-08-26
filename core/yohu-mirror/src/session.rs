//! 单设备投屏会话：push → 隧道 → app_process → 解复用 → 事件。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Child;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use yohu_adb::{kill_tree, AdbClient};
use yohu_protocol::{
    scrcpy, AppEvent, MirrorControlMessage, MirrorPacket, MirrorSessionState, MirrorStartRequest,
};

use crate::b64;
use crate::control;
use crate::demux::{codec_name, parse_header, HeaderKind};
use crate::error::MirrorError;
use crate::tunnel;

const ACCEPT_TIMEOUT: Duration = Duration::from_secs(15);
const KILL_WAIT: Duration = Duration::from_secs(3);

pub enum ControlCmd {
    Send(Vec<u8>),
    Close,
}

pub struct SessionOpts {
    pub req: MirrorStartRequest,
    pub server_path: PathBuf,
}

struct TunnelCleanup {
    adb: Arc<AdbClient>,
    serial: String,
    scid: u32,
    port: u16,
    used_forward: bool,
}

impl TunnelCleanup {
    async fn run(self) {
        if self.used_forward {
            tunnel::remove_forward(&self.adb, &self.serial, self.port).await;
        } else {
            tunnel::remove_reverse(&self.adb, &self.serial, self.scid).await;
        }
    }
}

enum ListenerHolder {
    Reverse(TcpListener),
    Forward,
}

fn random_scid() -> u32 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u32)
        .unwrap_or(1);
    (nanos ^ std::process::id()).max(1) & 0x7FFF_FFFF
}

fn server_argv(req: &MirrorStartRequest, scid: u32, forward: bool) -> Vec<String> {
    let mut kv = vec![
        format!("scid={scid:08x}"),
        "log_level=info".into(),
        "audio=false".into(),
        "video=true".into(),
        format!("control={}", req.control),
        format!("max_size={}", req.max_size),
        format!("video_bit_rate={}", req.video_bit_rate),
        format!("max_fps={}", req.max_fps),
        "cleanup=true".into(),
    ];
    if forward {
        kv.push("tunnel_forward=true".into());
    }
    let joined = kv.join(" ");
    vec![
        "shell".into(),
        format!(
            "CLASSPATH={} app_process / com.genymobile.scrcpy.Server {} {joined}",
            scrcpy::DEVICE_SERVER_PATH,
            scrcpy::SERVER_VERSION
        ),
    ]
}

fn drain_child_logs(child: &mut Child, serial: String, logs: Arc<Mutex<String>>) {
    if let Some(out) = child.stdout.take() {
        let logs = Arc::clone(&logs);
        let serial = serial.clone();
        tokio::spawn(async move {
            pump_text(out, serial, logs).await;
        });
    }
    if let Some(err) = child.stderr.take() {
        let logs = Arc::clone(&logs);
        tokio::spawn(async move {
            pump_text(err, serial, logs).await;
        });
    }
}

async fn pump_text<R>(reader: R, serial: String, logs: Arc<Mutex<String>>)
where
    R: tokio::io::AsyncRead + Unpin,
{
    use tokio::io::AsyncBufReadExt;
    let mut lines = tokio::io::BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        tracing::info!(serial = %serial, "scrcpy-server {line}");
        let mut buf = logs.lock().expect("mirror log lock poisoned");
        if buf.len() > 32 * 1024 {
            continue;
        }
        buf.push_str(&line);
        buf.push('\n');
    }
}

fn snapshot_logs(logs: &Arc<Mutex<String>>) -> String {
    logs.lock()
        .expect("mirror log lock poisoned")
        .trim()
        .to_string()
}

async fn wait_kill(child: &mut Child) {
    tokio::select! {
        _ = child.wait() => {}
        _ = tokio::time::sleep(KILL_WAIT) => {
            kill_tree(child);
            let _ = child.wait().await;
        }
    }
}

/// 跑完一条投屏直到取消或流结束。成功进入 Live 后通过 `on_live` 登记尺寸/编码。
pub async fn run_session(
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    cancel: CancellationToken,
    generation: u64,
    opts: SessionOpts,
    control_rx: mpsc::Receiver<ControlCmd>,
    on_live: impl FnOnce(u32, u32, String),
) -> Result<(), MirrorError> {
    let serial = opts.req.serial.clone();
    tracing::info!(
        serial = %serial,
        generation,
        control = opts.req.control,
        force_forward = opts.req.force_forward,
        max_size = opts.req.max_size,
        bit_rate = opts.req.video_bit_rate,
        max_fps = opts.req.max_fps,
        server = %opts.server_path.display(),
        "投屏会话开始"
    );
    if !opts.server_path.is_file() {
        tracing::error!(
            serial = %serial,
            path = %opts.server_path.display(),
            "缺少 scrcpy-server"
        );
        return Err(MirrorError::ServerMissing(
            opts.server_path.display().to_string(),
        ));
    }

    let scid = random_scid();
    let (listener, port) = tunnel::bind_local().await?;

    tracing::info!(serial = %serial, port, "本机监听已绑定");
    tunnel::push_server(&adb, &serial, &opts.server_path, cancel.clone()).await?;
    tracing::info!(serial = %serial, "scrcpy-server 已 push");
    if cancel.is_cancelled() {
        return Err(MirrorError::Cancelled);
    }

    let mut used_forward = opts.req.force_forward;
    let mut listener = Some(listener);
    if !used_forward {
        match tunnel::setup_reverse(&adb, &serial, scid, port, cancel.clone()).await {
            Ok(()) => tracing::info!(serial = %serial, scid, port, "adb reverse 已建立"),
            Err(e) => {
                tracing::warn!(serial = %serial, "adb reverse 失败，回退 forward: {e}");
                used_forward = true;
            }
        }
    }
    if used_forward {
        listener.take();
        tunnel::setup_forward(&adb, &serial, scid, port, cancel.clone()).await?;
        tracing::info!(serial = %serial, scid, port, "adb forward 已建立");
    }

    let holder = match listener {
        Some(l) => ListenerHolder::Reverse(l),
        None => ListenerHolder::Forward,
    };

    let cleanup = TunnelCleanup {
        adb: Arc::clone(&adb),
        serial: serial.clone(),
        scid,
        port,
        used_forward,
    };

    let argv = server_argv(&opts.req, scid, used_forward);
    tracing::info!(serial = %serial, forward = used_forward, "启动 app_process");
    let mut child = match adb.spawn_long_lived(&serial, &argv) {
        Ok(c) => c,
        Err(e) => {
            cleanup.run().await;
            return Err(e.into());
        }
    };
    let logs = Arc::new(Mutex::new(String::new()));
    drain_child_logs(&mut child, serial.clone(), Arc::clone(&logs));
    let alive = Arc::new(AtomicBool::new(true));

    let wait_alive = Arc::clone(&alive);
    let wait_cancel = cancel.clone();
    tokio::spawn(async move {
        tokio::select! {
            _ = wait_cancel.cancelled() => {}
            _ = child.wait() => {
                wait_alive.store(false, Ordering::Relaxed);
            }
        }
        if wait_cancel.is_cancelled() {
            kill_tree(&mut child);
            wait_kill(&mut child).await;
        }
        wait_alive.store(false, Ordering::Relaxed);
    });

    let result = run_connected(
        &holder,
        used_forward,
        port,
        &cancel,
        Arc::clone(&alive),
        &opts,
        generation,
        sink,
        control_rx,
        on_live,
    )
    .await;

    cancel.cancel();
    cleanup.run().await;
    let server_logs = snapshot_logs(&logs);
    if !server_logs.is_empty() {
        tracing::info!(serial = %serial, generation, "scrcpy-server 输出:\n{server_logs}");
    }

    match &result {
        Ok(()) => tracing::info!(serial = %serial, generation, "投屏会话正常结束"),
        Err(MirrorError::Cancelled) => {
            tracing::info!(serial = %serial, generation, "投屏会话取消")
        }
        Err(e) => tracing::error!(serial = %serial, generation, error = %e, "投屏会话失败"),
    }

    if matches!(result, Err(MirrorError::Cancelled)) {
        return result;
    }
    if !alive.load(Ordering::Relaxed) && !server_logs.is_empty() {
        return Err(MirrorError::ServerFailed(server_logs));
    }
    result
}

#[allow(clippy::too_many_arguments)]
async fn run_connected(
    listener: &ListenerHolder,
    used_forward: bool,
    port: u16,
    cancel: &CancellationToken,
    alive: Arc<AtomicBool>,
    opts: &SessionOpts,
    generation: u64,
    sink: mpsc::Sender<AppEvent>,
    mut control_rx: mpsc::Receiver<ControlCmd>,
    on_live: impl FnOnce(u32, u32, String),
) -> Result<(), MirrorError> {
    let serial = opts.req.serial.clone();
    let control_wanted = opts.req.control;

    let mut video = if used_forward {
        tracing::info!(serial = %serial, port, "forward 连接视频通道");
        tunnel::connect_forward(port, cancel, alive).await?
    } else {
        tracing::info!(serial = %serial, "等待 reverse 视频连接（最多 15s）");
        let ListenerHolder::Reverse(l) = listener else {
            return Err(MirrorError::Protocol("reverse 缺少监听套接字".into()));
        };
        tunnel::accept_one(l, cancel, ACCEPT_TIMEOUT).await?
    };
    tracing::info!(serial = %serial, "视频通道已接通");

    let mut name_buf = [0u8; scrcpy::DEVICE_NAME_FIELD_LENGTH];
    read_exact_cancel(&mut video, &mut name_buf, cancel).await?;

    let mut codec_buf = [0u8; 4];
    read_exact_cancel(&mut video, &mut codec_buf, cancel).await?;
    let codec_id = u32::from_be_bytes(codec_buf);
    let codec = codec_name(codec_id)
        .map_err(MirrorError::Protocol)?
        .to_string();

    let mut header = [0u8; 12];
    read_exact_cancel(&mut video, &mut header, cancel).await?;
    let (mut width, mut height) = match parse_header(&header).map_err(MirrorError::Protocol)? {
        HeaderKind::Session { width, height, .. } => (width, height),
        HeaderKind::Media { .. } => {
            return Err(MirrorError::Protocol("首包不是 session 头".into()));
        }
    };

    let control_stream = if control_wanted {
        let stream = if used_forward {
            tunnel::connect_tcp(port, cancel).await?
        } else {
            let ListenerHolder::Reverse(l) = listener else {
                return Err(MirrorError::Protocol("reverse 缺少监听套接字".into()));
            };
            tunnel::accept_one(l, cancel, ACCEPT_TIMEOUT).await?
        };
        Some(stream)
    } else {
        None
    };

    tracing::info!(
        serial = %serial,
        codec = %codec,
        width,
        height,
        control = control_wanted,
        "投屏 Live"
    );
    on_live(width, height, codec.clone());
    emit_state(
        &sink,
        &serial,
        generation,
        MirrorSessionState::Live,
        width,
        height,
        &codec,
        control_wanted,
        None,
    )
    .await;

    let mut control_write = None;
    if let Some(stream) = control_stream {
        let (mut read_half, write_half) = stream.into_split();
        let drain_cancel = cancel.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 256];
            loop {
                tokio::select! {
                    _ = drain_cancel.cancelled() => break,
                    r = read_half.read(&mut buf) => {
                        if r.ok().filter(|n| *n > 0).is_none() {
                            break;
                        }
                    }
                }
            }
        });
        control_write = Some(write_half);
    }

    let mut packets: u64 = 0;
    let mut dropped: u64 = 0;
    let mut saw_config = false;
    let mut saw_key = false;
    // 只读模式会 drop control_tx，通道立即关闭。若不禁用本分支，
    // recv() 恒就绪（None）会饿死视频读。
    let mut control_open = control_wanted;
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(MirrorError::Cancelled),
            cmd = control_rx.recv(), if control_open => {
                match cmd {
                    Some(ControlCmd::Send(bytes)) => {
                        if let Some(stream) = control_write.as_mut() {
                            if stream.write_all(&bytes).await.is_err() {
                                control_write = None;
                            }
                        }
                    }
                    Some(ControlCmd::Close) | None => {
                        control_write = None;
                        control_open = false;
                    }
                }
            }
            read = read_header(&mut video, &mut header) => {
                read?;
                match parse_header(&header).map_err(MirrorError::Protocol)? {
                    HeaderKind::Session { width: w, height: h, .. } => {
                        width = w;
                        height = h;
                        emit_state(
                            &sink,
                            &serial,
                            generation,
                            MirrorSessionState::Live,
                            width,
                            height,
                            &codec,
                            control_write.is_some(),
                            None,
                        )
                        .await;
                    }
                    HeaderKind::Media { config, keyframe, pts, size } => {
                        let mut payload = vec![0u8; size as usize];
                        read_exact_cancel(&mut video, &mut payload, cancel).await?;
                        if config && !saw_config {
                            saw_config = true;
                            tracing::info!(serial = %serial, size, "收到 codec config");
                        }
                        if keyframe && !saw_key {
                            saw_key = true;
                            tracing::info!(serial = %serial, size, "收到关键帧");
                        }
                        let packet = MirrorPacket {
                            serial: serial.clone(),
                            generation,
                            codec: codec.clone(),
                            width,
                            height,
                            config,
                            keyframe,
                            pts,
                            data_b64: b64::encode(&payload),
                        };
                        packets += 1;
                        if sink.try_send(AppEvent::MirrorPacket(packet)).is_err() {
                            dropped += 1;
                            if dropped == 1 || dropped % 50 == 0 {
                                tracing::warn!(
                                    serial = %serial,
                                    dropped,
                                    packets,
                                    "投屏包通道满，丢弃编码包"
                                );
                            }
                        } else if packets == 1 || packets % 120 == 0 {
                            tracing::info!(
                                serial = %serial,
                                packets,
                                dropped,
                                width,
                                height,
                                "投屏出包"
                            );
                        }
                    }
                }
            }
        }
    }
}

async fn read_header(stream: &mut TcpStream, header: &mut [u8; 12]) -> Result<(), MirrorError> {
    stream.read_exact(header).await?;
    Ok(())
}

async fn read_exact_cancel(
    stream: &mut TcpStream,
    buf: &mut [u8],
    cancel: &CancellationToken,
) -> Result<(), MirrorError> {
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(MirrorError::Cancelled),
        r = stream.read_exact(buf) => {
            r?;
            Ok(())
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn emit_state(
    sink: &mpsc::Sender<AppEvent>,
    serial: &str,
    generation: u64,
    state: MirrorSessionState,
    width: u32,
    height: u32,
    codec: &str,
    control: bool,
    error: Option<String>,
) {
    let _ = sink
        .send(AppEvent::MirrorState {
            serial: serial.to_string(),
            generation,
            state,
            width,
            height,
            codec: codec.to_string(),
            control,
            error,
        })
        .await;
}

pub async fn emit_terminal_state(
    sink: &mpsc::Sender<AppEvent>,
    serial: &str,
    generation: u64,
    state: MirrorSessionState,
    error: Option<String>,
) {
    emit_state(sink, serial, generation, state, 0, 0, "", false, error).await;
}

pub fn encode_control(message: &MirrorControlMessage) -> Vec<u8> {
    control::encode(message)
}

/// 把 PNG Base64 写入本地路径。
pub fn save_png(path: &str, data_b64: &str) -> Result<(), MirrorError> {
    let bytes = b64::decode(data_b64).map_err(MirrorError::Protocol)?;
    std::fs::write(path, bytes)?;
    Ok(())
}
