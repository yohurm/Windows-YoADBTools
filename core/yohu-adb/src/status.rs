//! 在线设备运行时状态枢纽：每台 Online 设备一路周期采样，变更才推 `device/status`。
//!
//! 目录（`adb devices -l`）仍是存在性唯一源；本枢纽不改 `DeviceInfo`，只跟 Online serial 集合。

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::client::AdbClient;
use crate::parse::status::DeviceStatusFields;
use yohu_protocol::{AppEvent, DeviceStatus};

const SAMPLE_INTERVAL: Duration = Duration::from_secs(2);

struct Slot {
    cancel: CancellationToken,
    status: Option<DeviceStatus>,
}

/// 设备运行时状态服务（每 Online serial 一路）。
pub struct DeviceStatusHub {
    client: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    parent: CancellationToken,
    slots: Mutex<HashMap<String, Slot>>,
}

impl DeviceStatusHub {
    pub fn new(
        client: Arc<AdbClient>,
        sink: mpsc::Sender<AppEvent>,
        parent: CancellationToken,
    ) -> Arc<Self> {
        Arc::new(Self {
            client,
            sink,
            parent,
            slots: Mutex::new(HashMap::new()),
        })
    }

    /// 与当前 Online serial 对齐：新设备开采样，离开集合的停任务并丢缓存。
    pub fn sync_online(self: &Arc<Self>, serials: &[String]) {
        let wanted: HashSet<&str> = serials.iter().map(String::as_str).collect();
        let mut slots = self.slots.lock().expect("status slots lock poisoned");
        let stale: Vec<String> = slots
            .keys()
            .filter(|s| !wanted.contains(s.as_str()))
            .cloned()
            .collect();
        for serial in stale {
            if let Some(slot) = slots.remove(&serial) {
                slot.cancel.cancel();
            }
        }
        let mut to_start = Vec::new();
        for serial in serials {
            if slots.contains_key(serial) {
                continue;
            }
            let cancel = self.parent.child_token();
            slots.insert(
                serial.clone(),
                Slot {
                    cancel: cancel.clone(),
                    status: None,
                },
            );
            to_start.push((serial.clone(), cancel));
        }
        drop(slots);
        for (serial, cancel) in to_start {
            let hub = Arc::clone(self);
            tokio::spawn(async move {
                poll_loop(hub, serial, cancel).await;
            });
        }
    }

    pub fn snapshot(&self, serial: &str) -> Option<DeviceStatus> {
        self.slots
            .lock()
            .expect("status slots lock poisoned")
            .get(serial)
            .and_then(|s| s.status.clone())
    }

    pub fn snapshot_all(&self) -> Vec<DeviceStatus> {
        let mut out: Vec<DeviceStatus> = self
            .slots
            .lock()
            .expect("status slots lock poisoned")
            .values()
            .filter_map(|s| s.status.clone())
            .collect();
        out.sort_by(|a, b| a.serial.cmp(&b.serial));
        out
    }

    /// 写设备深浅色后再采一次，更新缓存并推事件。读只信 [`AdbClient::sample_status`]。
    pub async fn set_night(
        &self,
        serial: &str,
        night: bool,
        cancel: CancellationToken,
    ) -> Result<DeviceStatus, crate::AdbError> {
        self.client
            .set_night_mode(serial, night, cancel.clone())
            .await?;
        let mut fields = match self.client.sample_status(serial, cancel).await {
            Ok(fields) => fields,
            Err(_) => DeviceStatusFields {
                night: Some(night),
                ..DeviceStatusFields::default()
            },
        };
        if fields.night.is_none() {
            fields.night = Some(night);
        }
        Ok(self.publish(serial, fields))
    }

    fn publish(&self, serial: &str, fields: DeviceStatusFields) -> DeviceStatus {
        let mut slots = self.slots.lock().expect("status slots lock poisoned");
        let generation = slots
            .get(serial)
            .and_then(|s| s.status.as_ref())
            .map(|s| s.generation.saturating_add(1))
            .unwrap_or(1);
        let next = DeviceStatus {
            serial: serial.to_string(),
            generation,
            night: fields.night,
            battery_pct: fields.battery_pct,
            charging: fields.charging,
            sdk: fields.sdk,
            release: fields.release,
            screen_on: fields.screen_on,
            brand: fields.brand,
        };
        if let Some(slot) = slots.get_mut(serial) {
            if let Some(prev) = slot.status.as_ref() {
                if prev.same_runtime(&next) {
                    return prev.clone();
                }
            }
            slot.status = Some(next.clone());
        }
        drop(slots);
        let _ = self.sink.try_send(AppEvent::DeviceStatus { status: next.clone() });
        next
    }
}

async fn poll_loop(hub: Arc<DeviceStatusHub>, serial: String, cancel: CancellationToken) {
    let mut ticker = tokio::time::interval(SAMPLE_INTERVAL);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            _ = ticker.tick() => {}
        }
        if cancel.is_cancelled() {
            break;
        }
        match hub.client.sample_status(&serial, cancel.clone()).await {
            Ok(fields) => {
                hub.publish(&serial, fields);
            }
            Err(e) => {
                tracing::debug!(serial = %serial, error = %e, "设备状态采样失败，保留上次快照");
            }
        }
    }
}
