/**
 * 日志分析主视图：绑定壳注入的 DeviceSession（设备 + 设置）；对话框与本机选路留在视图层。
 * 显示列 / 导出走注入的 settings；禁止本页 settings.get。
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";

import type { DeviceSession, LogWriteMode, SessionLogFile } from "@yohu/api";
import { dialogSaveFile, logSessionFileLatest, logSessionFileList, systemOpenPath } from "@yohu/api";
import {
  Icon,
  YoBadge,
  YoButton,
  YoCheckbox,
  YoChrome,
  YoDialog,
  YoEmptyState,
  YoLoading,
  YoPage,
  YoPanel,
  YoSelect,
  YoTabs,
  YoTextField,
  YoToaster,
  YoVirtualList,
  allKeys,
  attachPanelKeys,
  closeContextMenu,
  createToaster,
  nextKeys,
  openContextMenu,
  pointerSelectMode,
} from "@yohu/ui";

import { LEVELS, type ViewRow } from "./pipeline";
import { ExportDialog } from "./ExportDialog";
import { NewSessionDialog } from "./NewSessionDialog";
import { copyLogText, LOGS_KEY_BINDINGS, LOGS_LIST_SELECTOR, type LogsKeyAction } from "./keys";
import { DEFAULT_LOG_DISPLAY_COLUMNS, logColTemplate, visibleLogColumns, type LogColumnSpec } from "./layout";
import { logsRowMenu, logsTabMenu } from "./menu";
import { logStore } from "./store";
import type { LogSessionState } from "./workspace";
import "./logs.css";

const toaster = createToaster();

function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const message = (e as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return String(e);
}

function isCancelled(e: unknown): boolean {
  if (e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "cancelled") {
    return true;
  }
  return errorMessage(e).includes("采集已取消");
}

const beginCapture = (mode?: LogWriteMode): void => {
  void logStore.startCapture(mode).catch((e) => {
    if (isCancelled(e)) return;
    toaster.show(errorMessage(e), "error");
  });
};

const LEVEL_OPTIONS = [
  { value: "", label: "全部" },
  ...LEVELS.map((l) => ({ value: l, label: l })),
];

const LEVEL_SUFFIX: Record<string, string> = { V: "v", D: "d", I: "i", W: "w", E: "e", F: "f" };

const levelClass = (level: string): string => `yohu-logs__level--${LEVEL_SUFFIX[level] ?? "dim"}`;
const barClass = (level: string): string => `yohu-logs__row--bar-${LEVEL_SUFFIX[level] ?? "dim"}`;

const rowKey = (row: ViewRow): string => `${row.line.seq}-${row.line.pid}`;

function highlight(msg: string, keyword: string): (string | { mark: string })[] {
  if (!keyword) return [msg];
  const lower = msg.toLowerCase();
  const needle = keyword.toLowerCase();
  const parts: (string | { mark: string })[] = [];
  let cursor = 0;
  let index = lower.indexOf(needle, cursor);
  while (index >= 0) {
    if (index > cursor) parts.push(msg.slice(cursor, index));
    parts.push({ mark: msg.slice(index, index + needle.length) });
    cursor = index + needle.length;
    index = lower.indexOf(needle, cursor);
  }
  if (cursor < msg.length) parts.push(msg.slice(cursor));
  return parts;
}

function LogCell(props: { col: LogColumnSpec; row: ViewRow; keyword: string }) {
  const line = (): ViewRow["line"] => props.row.line;
  switch (props.col.key) {
    case "ts":
      return <span class="yohu-logs__row-ts">{line().ts}</span>;
    case "uid":
      return <span class="yohu-logs__row-uid">{line().uid ?? ""}</span>;
    case "pid":
      return <span class="yohu-logs__row-pid">{line().pid}</span>;
    case "tid":
      return <span class="yohu-logs__row-tid">{line().tid}</span>;
    case "level":
      return <span class={`yohu-logs__row-level yohu-tone ${levelClass(line().level)}`}>{line().level}</span>;
    case "tag":
      return (
        <span class="yohu-logs__row-tag" title={line().tag}>
          {line().tag}
        </span>
      );
    case "msg":
      return (
        <span class="yohu-logs__row-msg">
          <For each={highlight(line().msg, props.keyword)}>
            {(part) => (typeof part === "string" ? part : <mark class="yohu-logs__mark yohu-tone">{part.mark}</mark>)}
          </For>
          <Show when={props.row.collapsedAfter}>
            <span class="yohu-logs__row-fold">…{props.row.collapsedAfter} 帧折叠</span>
          </Show>
        </span>
      );
  }
}

function sessionPending(session: { id: number }): boolean {
  return logStore.state.startPendingId === session.id;
}

function shortSerial(serial: string | null): string {
  if (!serial) return "";
  return serial.length > 6 ? serial.slice(-4) : serial;
}

function tabTitle(session: LogSessionState): string {
  const short = shortSerial(session.serial);
  return short ? `${session.title} · ${short}` : session.title;
}

function SessionEmpty(props: { session: LogSessionState; writeMode: LogWriteMode }) {
  const filterActive = (): boolean =>
    props.session.minLevel !== null || props.session.tagContains.length > 0 || props.session.keyword.length > 0;
  const idle = (): boolean =>
    !props.session.capturing && !sessionPending(props.session) && !filterActive();
  return (
    <div class="yohu-logs__empty">
      <Show
        when={!idle()}
        fallback={
          <>
            <YoEmptyState icon="log" title="未采集" description="点击「开始采集」拉取设备日志" />
            <YoButton onClick={() => beginCapture(props.writeMode)}>开始采集</YoButton>
          </>
        }
      >
        <Show
          when={filterActive() && !sessionPending(props.session)}
          fallback={
            <YoLoading
              title={sessionPending(props.session) ? "正在启动采集…" : "等待设备输出…"}
              description={
                sessionPending(props.session) ? "正在连接设备 logcat" : "logcat 采集中，暂未收到行"
              }
            />
          }
        >
          <YoEmptyState icon="log" title="无匹配日志" description="调整过滤条件（级别/Tag/关键字）后重试" />
        </Show>
      </Show>
    </div>
  );
}

function scopeLabel(session: { scope: { kind: string; pkg?: string; pid?: number } }): string {
  if (session.scope.kind === "package") return `包名: ${session.scope.pkg}`;
  if (session.scope.kind === "pid") return `PID: ${session.scope.pid}`;
  return "System";
}

export function LogAnalyzerView(props: DeviceSession) {
  const [newOpen, setNewOpen] = createSignal(false);
  const [selectedKeys, setSelectedKeys] = createSignal<Set<string>>(new Set());
  const [pivotKey, setPivotKey] = createSignal<string | null>(null);
  const [renameTarget, setRenameTarget] = createSignal<number | null>(null);
  const [renameText, setRenameText] = createSignal("");
  const [exportOpen, setExportOpen] = createSignal(false);
  const [exportFiles, setExportFiles] = createSignal<SessionLogFile[]>([]);

  let keywordRef: HTMLInputElement | undefined;

  createEffect(() => {
    const serial = props.selectedSerials[0] ?? null;
    void logStore.bindSerial(serial);
    untrack(() => logStore.ensureSession());
  });

  createEffect(() => {
    logStore.setBufferCapacity(props.settings.buffer_capacity);
  });

  createEffect(() => {
    void logStore.state.activeSessionId;
    setSelectedKeys(new Set<string>());
    setPivotKey(null);
    closeContextMenu();
  });

  const active = createMemo(() => {
    const id = logStore.state.activeSessionId;
    return logStore.state.sessions.find((s) => s.id === id) ?? null;
  });

  const tabs = createMemo(() =>
    logStore.state.sessions.map((s) => ({
      id: String(s.id),
      title: tabTitle(s),
      dot:
        s.signalCount > 0
          ? ({ tone: "error" as const })
          : s.capturing
            ? ({ tone: "success" as const })
            : undefined,
    })),
  );

  const windowLive = (): boolean => {
    const session = active();
    return Boolean(session && (session.capturing || sessionPending(session)));
  };

  const windowSerial = (): string | null => active()?.serial ?? props.selectedSerials[0] ?? null;

  const visibleKeys = (): string[] => (active()?.visible ?? []).map(rowKey);

  const displayColumns = () => ({
    ...DEFAULT_LOG_DISPLAY_COLUMNS,
    ...props.settings.log_display_columns,
  });

  const colStyle = (): { "grid-template-columns": string } => ({
    "grid-template-columns": logColTemplate(displayColumns()),
  });

  const togglePause = (): void => {
    const id = logStore.state.activeSessionId;
    if (id === null) return;
    const session = logStore.state.sessions.find((s) => s.id === id);
    if (session?.capturing) logStore.patchFilter(id, { paused: !session.paused });
  };

  const copySelected = (): void => {
    const session = active();
    if (!session) return;
    const text = copyLogText(session.visible, selectedKeys(), rowKey);
    if (!text) return;
    void navigator.clipboard.writeText(text).catch((e) => toaster.show(`复制失败: ${errorMessage(e)}`, "error"));
  };

  const onKeyAction = (action: LogsKeyAction): void => {
    const id = logStore.state.activeSessionId;
    if (action === "pause") {
      togglePause();
      return;
    }
    if (action === "clear") {
      if (id !== null) void logStore.clearVisible(id);
      return;
    }
    if (action === "find") {
      keywordRef?.focus();
      keywordRef?.select();
      return;
    }
    if (action === "new-tab") {
      setNewOpen(true);
      return;
    }
    if (action === "close-tab") {
      if (id !== null) logStore.closeSession(id);
      return;
    }
    if (action === "next-tab") {
      const ids = logStore.state.sessions.map((s) => s.id);
      if (id !== null) {
        const next = ids[(ids.indexOf(id) + 1) % ids.length];
        if (next !== undefined) logStore.setActive(next);
      }
      return;
    }
    if (action === "select-all") {
      setSelectedKeys(allKeys(visibleKeys()));
      return;
    }
    if (action === "copy") copySelected();
  };

  onMount(() => {
    const stop = attachPanelKeys(window, {
      ownership: "host",
      listSelector: LOGS_LIST_SELECTOR,
      bindings: LOGS_KEY_BINDINGS,
      onAction: onKeyAction,
    });
    onCleanup(() => {
      stop();
      closeContextMenu();
    });
  });

  const doExport = async (): Promise<void> => {
    const id = logStore.state.activeSessionId;
    const active = id !== null ? logStore.state.sessions.find((s) => s.id === id) : null;
    const serial = active?.serial ?? logStore.state.serial;
    if (id === null || !serial) {
      toaster.show("请先选择设备并采集日志", "info");
      return;
    }
    try {
      // 导出方式：选择窗口文件 | 最新（默认）
      if (props.settings.export_mode === "select") {
        const files = await logSessionFileList();
        if (files.length === 0) {
          toaster.show("没有可导出的窗口日志文件", "info");
          return;
        }
        setExportFiles(files);
        setExportOpen(true);
        return;
      }
      const latest = await logSessionFileLatest(serial, id);
      if (!latest) {
        toaster.show("当前窗口尚无日志文件（请先采集）", "info");
        return;
      }
      await exportWithAsk([latest]);
    } catch (e) {
      toaster.show(`导出失败: ${errorMessage(e)}`, "error");
    }
  };

  /** 每次询问保存位置（默认开，可在设置关闭）；取消则中止导出。 */
  const exportWithAsk = async (sources: string[]): Promise<void> => {
    if (props.settings.export_ask_every_time) {
      const defaultPath = props.settings.export_default_path;
      const picked = await dialogSaveFile({
        title: "导出日志",
        defaultPath: defaultPath ? `${defaultPath}\\logcat-export.txt` : "logcat-export.txt",
        filters: [{ name: "文本", extensions: ["txt"] }],
      });
      if (typeof picked !== "string") return;
      await runExport(sources, picked);
      return;
    }
    await runExport(sources);
  };

  const runExport = async (sources: string[], dest?: string): Promise<void> => {
    if (sources.length === 0) return;
    try {
      const path = await logStore.exportSession(sources, dest);
      if (path) {
        toaster.show(`已导出: ${path}`, "success");
        void systemOpenPath(path);
      }
    } catch (e) {
      toaster.show(`导出失败: ${errorMessage(e)}`, "error");
    }
  };

  const confirmExport = async (paths: string[]): Promise<void> => {
    setExportOpen(false);
    await exportWithAsk(paths);
  };

  return (
    <YoPage class="yohu-logs">
      <YoChrome title="日志分析" deviceLabel={props.selectedLabel ?? undefined}>
        <YoButton
          variant={windowLive() ? "danger" : "primary"}
          disabled={!windowLive() && windowSerial() === null}
          onClick={() => {
            if (windowLive()) {
              void logStore.stopCapture().catch((e) => toaster.show(errorMessage(e), "error"));
              return;
            }
            beginCapture(props.settings.log_write_mode);
          }}
        >
          {windowLive()
            ? sessionPending(active() ?? { id: -1 }) && !active()?.capturing
              ? "取消启动"
              : "停止"
            : "开始"}
        </YoButton>
        <Show when={active()?.capturing}>
          <YoButton
            variant="secondary"
            onClick={() => {
              const id = logStore.state.activeSessionId;
              const session = id !== null ? logStore.state.sessions.find((s) => s.id === id) : null;
              if (session) logStore.patchFilter(id!, { paused: !session.paused });
            }}
          >
            {active()?.paused ? "继续" : "暂停"}
          </YoButton>
        </Show>
        <YoButton
          variant="secondary"
          onClick={() => {
            const id = logStore.state.activeSessionId;
            if (id !== null) void logStore.clearVisible(id);
          }}
        >
          清空
        </YoButton>
        <YoButton variant="secondary" onClick={() => void logStore.clearDevice()} disabled={windowSerial() === null}>
          清设备缓冲
        </YoButton>
        <YoButton variant="secondary" onClick={() => void doExport()}>
          导出
        </YoButton>
        <Show when={logStore.state.overflowed}>
          <YoBadge text="缓冲滞后（已回补）" tone="warn" />
        </Show>
      </YoChrome>

      <Show
        when={logStore.state.sessions.length > 0}
        fallback={
          <YoPanel variant="pane">
            <YoEmptyState icon="log" title="未选择设备" description="请在左侧设备栏选择在线设备，或新建日志窗口" />
          </YoPanel>
        }
      >
        <div class="yohu-logs__tabs">
          <YoTabs
            tabs={tabs()}
            activeId={logStore.state.activeSessionId !== null ? String(logStore.state.activeSessionId) : null}
            onActivate={(id) => logStore.setActive(Number(id))}
            onClose={(id) => logStore.closeSession(Number(id))}
            onNew={() => setNewOpen(true)}
            onContextMenu={(id, event) => {
              event.preventDefault();
              const target = Number(id);
              openContextMenu(logsTabMenu, {
                x: event.clientX,
                y: event.clientY,
                ctx: {
                  rename: () => {
                    const session = logStore.state.sessions.find((s) => s.id === target);
                    setRenameTarget(target);
                    setRenameText(session?.title ?? "");
                  },
                  duplicate: () => {
                    logStore.duplicateSession(target);
                  },
                  closeOthers: () => {
                    logStore.closeOthers(target);
                  },
                },
              });
            }}
          />
        </div>

        <Show when={active()} keyed>
          {(session) => (
            <YoPanel variant="pane">
              <div class="yohu-logs__filter">
                <YoSelect
                  options={LEVEL_OPTIONS}
                  value={session.minLevel ?? ""}
                  onChange={(v) => logStore.patchFilter(session.id, { minLevel: v === "" ? null : v })}
                />
                <YoTextField
                  ariaLabel="Tag"
                  placeholder="Tag"
                  value={session.tagContains}
                  clearable
                  onInput={(v) => logStore.patchFilter(session.id, { tagContains: v })}
                />
                <span
                  class="yohu-logs__search"
                  classList={{ "yohu-logs__search--active": session.keyword.length > 0 }}
                  ref={(el) => {
                    keywordRef = el.querySelector("input") ?? undefined;
                  }}
                >
                  <span class="yohu-logs__search-icon" aria-hidden="true">
                    <Icon name="search" size={13} />
                  </span>
                  <YoTextField
                    ariaLabel="关键字"
                    placeholder="检索消息"
                    value={session.keyword}
                    clearable
                    onInput={(v) => logStore.patchFilter(session.id, { keyword: v })}
                  />
                </span>
                <span class="yohu-logs__scope">
                  <YoBadge text={scopeLabel(session)} tone="accent" />
                </span>
              </div>

              <div class="yohu-logs__list">
                <div class="yohu-logs__cols yohu-logs__cols--head" role="row" style={colStyle()}>
                  <For each={visibleLogColumns(displayColumns())}>
                    {(col) => (
                      <span
                        class="yohu-logs__head-cell"
                        classList={{
                          "yohu-logs__head-cell--end": col.align === "end",
                          "yohu-logs__head-cell--center": col.align === "center",
                        }}
                        role="columnheader"
                      >
                        {col.header}
                      </span>
                    )}
                  </For>
                </div>
                <div class="yohu-logs__list-body">
                  <Show when={session.visible.length > 0} fallback={<SessionEmpty session={session} writeMode={props.settings.log_write_mode} />}>
                    <YoVirtualList<ViewRow>
                      items={() => logStore.state.sessions.find((s) => s.id === session.id)?.visible ?? []}
                      itemHeight={22}
                      getItemKey={rowKey}
                      autoScrollToBottom={() => session.following && !session.paused}
                      onAtBottomChange={(atBottom) => {
                        if (atBottom) logStore.resumeFollow(session.id);
                        else logStore.detachFollow(session.id);
                      }}
                      ariaLabel="日志列表"
                      selectedKeys={selectedKeys}
                      selectedKey={pivotKey}
                      onSelectRow={(row, _key, event) => {
                        const key = rowKey(row);
                        const next = nextKeys(visibleKeys(), selectedKeys(), pivotKey(), key, pointerSelectMode(event));
                        setSelectedKeys(next.keys);
                        setPivotKey(next.pivot);
                      }}
                      onRowContextMenu={(row, _key, event) => {
                        const key = rowKey(row);
                        if (!selectedKeys().has(key)) {
                          setSelectedKeys(new Set([key]));
                          setPivotKey(key);
                        }
                        openContextMenu(logsRowMenu, {
                          x: event.clientX,
                          y: event.clientY,
                          ctx: { canCopy: selectedKeys().size > 0, copy: copySelected },
                        });
                      }}
                      renderRow={(row) => (
                        <div
                          class="yohu-logs__cols yohu-logs__row"
                          classList={{
                            [barClass(row.line.level)]: true,
                            "yohu-logs__row--signal": row.signal !== undefined,
                            "yohu-logs__row--raw": row.line.level === "?",
                          }}
                          style={
                            row.line.level === "?"
                              ? { "grid-template-columns": "minmax(0, 1fr)" }
                              : colStyle()
                          }
                        >
                          <Show
                            when={row.line.level !== "?"}
                            fallback={<span class="yohu-logs__row-msg">{row.line.msg}</span>}
                          >
                            <For each={visibleLogColumns(displayColumns())}>
                              {(col) => <LogCell col={col} row={row} keyword={session.keyword} />}
                            </For>
                          </Show>
                        </div>
                      )}
                    />
                  </Show>
                </div>
                <Show when={session.pendingCount > 0}>
                  <div class="yohu-logs__pending">
                    <YoButton variant="secondary" onClick={() => logStore.resumeFollow(session.id)}>
                      {session.pendingCount} 条新日志
                    </YoButton>
                  </div>
                </Show>
              </div>

              <div class="yohu-logs__status">
                <span class="yohu-logs__status-capture">
                  <span
                    class="yohu-logs__status-dot"
                    classList={{ "yohu-logs__status-dot--on": session.capturing }}
                  />
                  {session.capturing
                    ? "采集中"
                    : sessionPending(session)
                      ? "启动中"
                      : "已停止"}
                </span>
                <span>设备 {session.serial ?? "—"}</span>
                <span>行数 {session.visible.length}</span>
                <Show when={selectedKeys().size > 0}>
                  <span>已选 {selectedKeys().size}</span>
                </Show>
                <span classList={{ "yohu-logs__status-signal": session.signalCount > 0 }}>
                  信号 {session.signalCount}
                </span>
                <Show when={logStore.state.overflowed}>
                  <span class="yohu-logs__status-lag">缓冲滞后（已回补）</span>
                </Show>
              </div>
            </YoPanel>
          )}
        </Show>
      </Show>

      <NewSessionDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        devices={props.devices}
        focusSerial={props.focusSerial}
      />

      <YoDialog
        open={() => renameTarget() !== null}
        title="重命名会话"
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <YoButton variant="ghost" onClick={() => setRenameTarget(null)}>
              取消
            </YoButton>
            <YoButton
              onClick={() => {
                const id = renameTarget();
                if (id !== null) logStore.renameSession(id, renameText());
                setRenameTarget(null);
              }}
            >
              确定
            </YoButton>
          </>
        }
      >
        <YoTextField label="会话标题" value={renameText()} onInput={setRenameText} />
      </YoDialog>

      <ExportDialog
        open={exportOpen}
        files={exportFiles()}
        onClose={() => setExportOpen(false)}
        onConfirm={confirmExport}
      />

      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
