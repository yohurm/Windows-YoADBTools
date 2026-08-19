/**
 * 日志分析主视图：绑定壳注入的 DeviceSession；对话框与本机选路留在视图层。
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";

import { save } from "@tauri-apps/plugin-dialog";
import type { DeviceSession } from "@yohu/api";
import { settingsGet, systemOpenPath } from "@yohu/api";
import {
  Icon,
  YoBadge,
  YoButton,
  YoContextMenu,
  YoDialog,
  YoEmptyState,
  YoSelect,
  YoTabs,
  YoTextField,
  YoToaster,
  YoToolbar,
  YoVirtualList,
  createToaster,
  type YoMenuItem,
} from "@yohu/ui";

import { LEVELS, type ViewRow } from "./pipeline";
import { NewSessionDialog } from "./NewSessionDialog";
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

const beginCapture = (): void => {
  void logStore.startCapture().catch((e) => {
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

function SessionEmpty(props: { session: LogSessionState }) {
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
            <YoButton onClick={beginCapture}>开始采集</YoButton>
          </>
        }
      >
        <YoEmptyState
          icon="log"
          title={
            sessionPending(props.session)
              ? "正在启动采集…"
              : filterActive()
                ? "无匹配日志"
                : "等待设备输出…"
          }
          description={
            sessionPending(props.session)
              ? "正在连接设备 logcat"
              : filterActive()
                ? "调整过滤条件（级别/Tag/关键字）后重试"
                : "logcat 采集中，暂未收到行"
          }
        />
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
  const [selectedKey, setSelectedKey] = createSignal<string | number | null>(null);
  const [menu, setMenu] = createSignal<{ x: number; y: number; id: number } | null>(null);
  const [renameTarget, setRenameTarget] = createSignal<number | null>(null);
  const [renameText, setRenameText] = createSignal("");

  let keywordRef: HTMLInputElement | undefined;

  createEffect(() => {
    const serial = props.focusSerial;
    void logStore.bindSerial(serial);
    untrack(() => logStore.ensureSession());
  });

  createEffect(() => {
    void logStore.state.activeSessionId;
    setSelectedKey(null);
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

  const windowSerial = (): string | null => active()?.serial ?? props.focusSerial;

  const onKeydown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    const inInput = target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
    if (e.key === " " && !inInput && active()?.capturing) {
      e.preventDefault();
      const id = logStore.state.activeSessionId;
      if (id !== null) {
        const session = logStore.state.sessions.find((s) => s.id === id);
        if (session) logStore.patchFilter(id, { paused: !session.paused });
      }
      return;
    }
    if (!e.ctrlKey) return;
    const key = e.key.toLowerCase();
    const id = logStore.state.activeSessionId;
    if (key === "l") {
      e.preventDefault();
      if (id !== null) void logStore.clearVisible(id);
    } else if (key === "f") {
      e.preventDefault();
      keywordRef?.focus();
    } else if (key === "t") {
      e.preventDefault();
      setNewOpen(true);
    } else if (key === "w") {
      e.preventDefault();
      if (id !== null) logStore.closeSession(id);
    } else if (key === "tab") {
      e.preventDefault();
      const ids = logStore.state.sessions.map((s) => s.id);
      if (id !== null) {
        const next = ids[(ids.indexOf(id) + 1) % ids.length];
        if (next !== undefined) logStore.setActive(next);
      }
    }
  };

  onMount(() => window.addEventListener("keydown", onKeydown));
  onCleanup(() => window.removeEventListener("keydown", onKeydown));

  const doExport = async (): Promise<void> => {
    const id = logStore.state.activeSessionId;
    if (id === null) return;
    try {
      let dest: string | undefined;
      const askEvery = Boolean(await settingsGet("export_ask_every_time"));
      const defaultPath = String((await settingsGet("export_default_path")) ?? "");
      const writeMode = (await settingsGet("export_write_mode")) === "append" ? "append" : "overwrite";
      if (askEvery) {
        const picked = await save({
          title: "导出日志",
          defaultPath: defaultPath ? `${defaultPath}\\logcat.txt` : "logcat.txt",
          filters: [{ name: "文本", extensions: ["txt"] }],
        });
        if (typeof picked !== "string") return;
        dest = picked;
      }
      const path = await logStore.exportSession(id, dest, writeMode);
      if (path) {
        toaster.show(`已导出: ${path}`, "success");
        void systemOpenPath(path);
      }
    } catch (e) {
      toaster.show(`导出失败: ${errorMessage(e)}`, "error");
    }
  };

  const menuItems = (): YoMenuItem[] => [
    { id: "rename", label: "重命名" },
    { id: "duplicate", label: "复制会话" },
    { id: "close-others", label: "关闭其他" },
  ];

  return (
    <div class="yohu-logs">
      <YoToolbar>
        <span class="yohu-module-title">日志分析</span>
        <Show
          when={windowLive()}
          fallback={
            <YoButton onClick={beginCapture} disabled={windowSerial() === null}>
              开始
            </YoButton>
          }
        >
          <YoButton
            variant="secondary"
            onClick={() => void logStore.stopCapture().catch((e) => toaster.show(errorMessage(e), "error"))}
          >
            {sessionPending(active() ?? { id: -1 }) && !active()?.capturing ? "取消启动" : "停止"}
          </YoButton>
        </Show>
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
      </YoToolbar>

      <Show
        when={logStore.state.sessions.length > 0}
        fallback={<YoEmptyState icon="log" title="未选择设备" description="请在左侧设备栏选择在线设备，或新建日志窗口" />}
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
              setMenu({ x: event.clientX, y: event.clientY, id: Number(id) });
            }}
          />
        </div>

        <Show when={active()} keyed>
          {(session) => (
            <div class="yohu-logs__session">
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
                <Show when={session.visible.length > 0} fallback={<SessionEmpty session={session} />}>
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
                    selectedKey={selectedKey}
                    onSelectRow={(row) => setSelectedKey(rowKey(row))}
                    renderRow={(row) => (
                      <div
                        class="yohu-logs__row"
                        classList={{
                          [barClass(row.line.level)]: true,
                          "yohu-logs__row--signal": row.signal !== undefined,
                        }}
                      >
                        <span class="yohu-logs__row-ts">{row.line.ts}</span>
                        <span class="yohu-logs__row-pid">{row.line.pid}</span>
                        <span class={`yohu-logs__row-level yohu-tone ${levelClass(row.line.level)}`}>{row.line.level}</span>
                        <span class="yohu-logs__row-tag">{row.line.tag}</span>
                        <span class="yohu-logs__row-msg">
                          <For each={highlight(row.line.msg, session.keyword)}>
                            {(part) => (typeof part === "string" ? part : <mark class="yohu-logs__mark yohu-tone">{part.mark}</mark>)}
                          </For>
                        </span>
                        <Show when={row.collapsedAfter}>
                          <span class="yohu-logs__row-fold">…{row.collapsedAfter} 帧折叠</span>
                        </Show>
                      </div>
                    )}
                  />
                </Show>
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
                <span classList={{ "yohu-logs__status-signal": session.signalCount > 0 }}>
                  信号 {session.signalCount}
                </span>
                <Show when={logStore.state.overflowed}>
                  <span class="yohu-logs__status-lag">缓冲滞后（已回补）</span>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </Show>

      <NewSessionDialog open={newOpen} onClose={() => setNewOpen(false)} />

      <YoContextMenu
        open={menu() !== null}
        x={menu()?.x ?? 0}
        y={menu()?.y ?? 0}
        items={menuItems()}
        onClose={() => setMenu(null)}
        onSelect={(id) => {
          const target = menu()?.id;
          if (target === undefined) return;
          if (id === "rename") {
            const session = logStore.state.sessions.find((s) => s.id === target);
            setRenameTarget(target);
            setRenameText(session?.title ?? "");
          } else if (id === "duplicate") {
            logStore.duplicateSession(target);
          } else if (id === "close-others") {
            logStore.closeOthers(target);
          }
          setMenu(null);
        }}
      />

      <YoDialog
        open={() => renameTarget() !== null}
        title="重命名会话"
        width={400}
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

      <YoToaster toaster={toaster} />
    </div>
  );
}
