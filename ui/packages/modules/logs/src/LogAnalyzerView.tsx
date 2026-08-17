/**
 * 日志分析主视图（UI设计系统-v6.md §4.1）：
 * 工具栏 + 多会话 Tab（右键菜单：关闭其他/重命名/复制）+ 过滤栏（检索框放大镜/清除/accent 边框）
 * + 虚拟化列表（行选中/级别左条/Fatal 反色块/信号行底色）+ 会话状态行（采集指示·设备·缓冲·信号·滞后回补）。
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import { systemOpenPath } from "@yovo/api";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Icon,
  YBadge,
  YButton,
  YDialog,
  YEmptyState,
  YSelect,
  YTabs,
  YTextField,
  YToaster,
  YToolbar,
  YVirtualList,
  createToaster,
} from "@yovo/ui";
import { settingsStore } from "@yovo/app";

import { LEVELS, levelRank, type SessionScope, type ViewRow } from "./pipeline";
import { logStore } from "./store";
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

const beginCapture = (): void => {
  void logStore.startCapture().catch((e) => toaster.show(errorMessage(e), "error"));
};

const LEVEL_OPTIONS = [
  { value: "", label: "全部" },
  ...LEVELS.map((l) => ({ value: l, label: l })),
];

/** 级别 → 类名后缀（未知级别归入 dim）。 */
const LEVEL_SUFFIX: Record<string, string> = { V: "v", D: "d", I: "i", W: "w", E: "e", F: "f" };

const levelClass = (level: string): string => `yovo-logs__level--${LEVEL_SUFFIX[level] ?? "dim"}`;
const barClass = (level: string): string => `yovo-logs__row--bar-${LEVEL_SUFFIX[level] ?? "dim"}`;

/** 行 key（稳定定位 + 选中态）。 */
const rowKey = (row: ViewRow): string => `${row.line.seq}-${row.line.pid}`;

/** 关键字高亮（忽略大小写）；始终返回数组。 */
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

function NewSessionDialog(props: { open: () => boolean; onClose: () => void }) {
  const [mode, setMode] = createSignal<"all" | "package" | "pid">("all");
  const [pkg, setPkg] = createSignal("");
  const [pidText, setPidText] = createSignal("");
  const [includeChild, setIncludeChild] = createSignal(true);

  const packageOptions = createMemo(() => {
    const names = [...new Set(logStore.state.processEntries.map((e) => e.name))].sort();
    return names.map((n) => ({ value: n, label: n }));
  });

  const create = (): void => {
    let scope: SessionScope;
    let title: string;
    if (mode() === "package") {
      scope = { kind: "package", pkg: pkg(), includeChild: includeChild() };
      title = pkg() || "包名会话";
    } else if (mode() === "pid") {
      const pid = Number.parseInt(pidText(), 10);
      if (Number.isNaN(pid)) return;
      scope = { kind: "pid", pid };
      title = `PID ${pid}`;
    } else {
      scope = { kind: "all" };
      title = "全部日志";
    }
    logStore.createSession(scope, title);
    props.onClose();
  };

  return (
    <YDialog open={props.open} title="新建日志会话" width={480} onClose={props.onClose}
      footer={
        <>
          <YButton variant="ghost" onClick={props.onClose}>取消</YButton>
          <YButton onClick={create}>创建</YButton>
        </>
      }
    >
      <div class="yovo-logs__new">
        <YSelect
          options={[
            { value: "all", label: "全部日志" },
            { value: "package", label: "按包名" },
            { value: "pid", label: "按 PID" },
          ]}
          value={mode()}
          onChange={(v) => setMode(v as "all" | "package" | "pid")}
        />
        <Show when={mode() === "package"}>
          <YSelect options={packageOptions()} value={pkg() || null} onChange={setPkg} placeholder="选择包名（进程索引）" />
        </Show>
        <Show when={mode() === "pid"}>
          <YTextField label="PID（精确）" value={pidText()} onInput={setPidText} />
        </Show>
      </div>
    </YDialog>
  );
}

/** 会话右键菜单（关闭其他/重命名/复制会话）。 */
function SessionMenu(props: {
  menu: () => { x: number; y: number; id: number } | null;
  onClose: () => void;
  onRename: (id: number) => void;
}) {
  onMount(() => {
    const close = (): void => props.onClose();
    document.addEventListener("mousedown", close);
    onCleanup(() => document.removeEventListener("mousedown", close));
  });
  return (
    <Show when={props.menu()} keyed>
      {(m) => (
        <div class="yovo-logs__menu" style={{ left: `${m.x}px`, top: `${m.y}px` }} role="menu">
          <button
            type="button"
            class="yovo-logs__menu-item"
            role="menuitem"
            onClick={() => props.onRename(m.id)}
          >
            重命名
          </button>
          <button
            type="button"
            class="yovo-logs__menu-item"
            role="menuitem"
            onClick={() => {
              logStore.duplicateSession(m.id);
              props.onClose();
            }}
          >
            复制会话
          </button>
          <button
            type="button"
            class="yovo-logs__menu-item"
            role="menuitem"
            onClick={() => {
              logStore.closeOthers(m.id);
              props.onClose();
            }}
          >
            关闭其他
          </button>
        </div>
      )}
    </Show>
  );
}

/** 会话空态：未采集（引导开始）/ 等待输出 / 过滤无命中 三态。 */
function SessionEmpty(props: { session: { minLevel: string | null; tagContains: string; keyword: string } }) {
  const filterActive = (): boolean =>
    props.session.minLevel !== null || props.session.tagContains.length > 0 || props.session.keyword.length > 0;
  return (
    <div class="yovo-logs__empty">
      <Show
        when={!logStore.state.capturing && !filterActive()}
        fallback={
          <YEmptyState
            icon="log"
            title={filterActive() ? "无匹配日志" : "等待设备输出…"}
            description={
              filterActive()
                ? "调整过滤条件（级别/Tag/关键字）后重试"
                : "logcat 采集中，暂未收到行"
            }
          />
        }
      >
        <YEmptyState icon="log" title="未采集" description="点击「开始采集」拉取设备日志" />
        <YButton onClick={beginCapture}>开始采集</YButton>
      </Show>
    </div>
  );
}

export function LogAnalyzerView() {
  const [newOpen, setNewOpen] = createSignal(false);
  const [selectedKey, setSelectedKey] = createSignal<string | number | null>(null);
  const [menu, setMenu] = createSignal<{ x: number; y: number; id: number } | null>(null);
  const [renameTarget, setRenameTarget] = createSignal<number | null>(null);
  const [renameText, setRenameText] = createSignal("");

  let keywordRef: HTMLInputElement | undefined;

  onMount(() => {
    void logStore.ensureSession();
  });

  // 焦点设备变化：停采由 core 事件驱动；此处仅保证会话存在
  createEffect(() => {
    const serial = logStore.focusSerial();
    void serial;
    logStore.ensureSession();
  });

  // 会话切换重置行选中
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
      title: s.title,
      dot:
        s.signalCount > 0
          ? ({ tone: "error" as const })
          : logStore.state.capturing
            ? ({ tone: "success" as const })
            : undefined,
    })),
  );

  // ===== 快捷键：Space 暂停 / Ctrl+L 清空 / Ctrl+F 聚焦检索 / Ctrl+T 新建 / Ctrl+W 关闭 =====
  const onKeydown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    const inInput = target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
    if (e.key === " " && !inInput && logStore.state.capturing) {
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
      if (settingsStore.state.export_ask_every_time) {
        const picked = await save({
          title: "导出日志",
          defaultPath: settingsStore.state.export_default_path
            ? `${settingsStore.state.export_default_path}\\logcat.txt`
            : "logcat.txt",
          filters: [{ name: "文本", extensions: ["txt"] }],
        });
        if (typeof picked !== "string") return;
        dest = picked;
      }
      const path = await logStore.exportSession(id, dest);
      if (path) {
        toaster.show(`已导出: ${path}`, "success");
        void systemOpenPath(path);
      }
    } catch (e) {
      toaster.show(`导出失败: ${errorMessage(e)}`, "error");
    }
  };

  const openMenu = (id: string, event: MouseEvent): void => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, id: Number(id) });
  };

  const startRename = (id: number): void => {
    const session = logStore.state.sessions.find((s) => s.id === id);
    setRenameTarget(id);
    setRenameText(session?.title ?? "");
    setMenu(null);
  };

  return (
    <div class="yovo-logs">
      <YToolbar>
        <span class="yovo-module-title">日志分析</span>
        <Show
          when={!logStore.state.capturing}
          fallback={
            <YButton variant="secondary" onClick={() => void logStore.stopCapture()}>
              停止
            </YButton>
          }
        >
          <YButton onClick={beginCapture}>开始</YButton>
        </Show>
        <Show when={logStore.state.capturing}>
          <YButton
            variant="secondary"
            onClick={() => {
              const id = logStore.state.activeSessionId;
              const session = id !== null ? logStore.state.sessions.find((s) => s.id === id) : null;
              if (session) logStore.patchFilter(id!, { paused: !session.paused });
            }}
          >
            {active()?.paused ? "继续" : "暂停"}
          </YButton>
        </Show>
        <YButton
          variant="secondary"
          onClick={() => {
            const id = logStore.state.activeSessionId;
            if (id !== null) void logStore.clearVisible(id);
          }}
        >
          清空
        </YButton>
        <YButton variant="secondary" onClick={() => void logStore.clearDevice()}>
          清设备缓冲
        </YButton>
        <YButton variant="secondary" onClick={() => void doExport()}>
          导出
        </YButton>
        <Show when={logStore.state.overflowed}>
          <YBadge text="缓冲滞后（已回补）" tone="warn" />
        </Show>
      </YToolbar>

      <div class="yovo-logs__tabs">
        <YTabs
          tabs={tabs()}
          activeId={logStore.state.activeSessionId !== null ? String(logStore.state.activeSessionId) : null}
          onActivate={(id) => logStore.setActive(Number(id))}
          onClose={(id) => logStore.closeSession(Number(id))}
          onNew={() => setNewOpen(true)}
          onContextMenu={openMenu}
        />
      </div>

      <Show when={active()} keyed>
        {(session) => (
          <div class="yovo-logs__session">
            <div class="yovo-logs__filter">
              <YSelect
                options={LEVEL_OPTIONS}
                value={session.minLevel ?? ""}
                onChange={(v) => logStore.patchFilter(session.id, { minLevel: v === "" ? null : v })}
              />
              <YTextField
                ariaLabel="Tag"
                placeholder="Tag"
                value={session.tagContains}
                clearable
                onInput={(v) => logStore.patchFilter(session.id, { tagContains: v })}
              />
              <span
                class="yovo-logs__search"
                classList={{ "yovo-logs__search--active": session.keyword.length > 0 }}
                ref={(el) => {
                  keywordRef = el.querySelector("input") ?? undefined;
                }}
              >
                <span class="yovo-logs__search-icon" aria-hidden="true">
                  <Icon name="search" size={13} />
                </span>
                <YTextField
                  ariaLabel="关键字"
                  placeholder="检索消息"
                  value={session.keyword}
                  clearable
                  onInput={(v) => logStore.patchFilter(session.id, { keyword: v })}
                />
              </span>
              <span class="yovo-logs__scope">
                {session.scope.kind === "all"
                  ? "全部"
                  : session.scope.kind === "package"
                    ? `包名: ${session.scope.pkg}`
                    : `PID: ${session.scope.pid}`}
              </span>
            </div>

            <div class="yovo-logs__list">
              <Show when={session.visible.length > 0} fallback={<SessionEmpty session={session} />}>
                <YVirtualList<ViewRow>
                  items={() => logStore.state.sessions.find((s) => s.id === session.id)?.visible ?? []}
                  itemHeight={22}
                  getItemKey={rowKey}
                  autoScrollToBottom={() => session.autoScroll}
                  ariaLabel="日志列表"
                  selectedKey={selectedKey}
                  onSelectRow={(row) => setSelectedKey(rowKey(row))}
                  renderRow={(row) => (
                    <div
                      class="yovo-logs__row"
                      classList={{
                        [barClass(row.line.level)]: true,
                        "yovo-logs__row--signal": row.signal !== undefined,
                      }}
                    >
                      <span class="yovo-logs__row-ts">{row.line.ts}</span>
                      <span class="yovo-logs__row-pid">{row.line.pid}</span>
                      <span class={`yovo-logs__row-level ${levelClass(row.line.level)}`}>
                        {row.line.level}
                      </span>
                      <span class="yovo-logs__row-tag">{row.line.tag}</span>
                      <span class="yovo-logs__row-msg">
                        <For each={highlight(row.line.msg, session.keyword)}>
                          {(part) => (typeof part === "string" ? part : <mark class="yovo-logs__mark">{part.mark}</mark>)}
                        </For>
                      </span>
                      <Show when={row.collapsedAfter}>
                        <span class="yovo-logs__row-fold">…{row.collapsedAfter} 帧折叠</span>
                      </Show>
                    </div>
                  )}
                />
              </Show>
            </div>

            <div class="yovo-logs__status">
              <span class="yovo-logs__status-capture">
                <span
                  class="yovo-logs__status-dot"
                  classList={{ "yovo-logs__status-dot--on": logStore.state.capturing }}
                />
                {logStore.state.capturing ? "采集中" : "已停止"}
              </span>
              <span>设备 {logStore.focusSerial() ?? "—"}</span>
              <span>缓冲 {logStore.state.bufferLines}</span>
              <span>可见 {session.visible.length}</span>
              <span classList={{ "yovo-logs__status-signal": session.signalCount > 0 }}>
                信号 {session.signalCount}
              </span>
              <Show when={logStore.state.indexUpdatedAt !== null}>
                <span>进程索引 {Math.round((Date.now() - (logStore.state.indexUpdatedAt ?? 0)) / 1000)}s 前</span>
              </Show>
              <Show when={logStore.state.overflowed}>
                <span class="yovo-logs__status-lag">缓冲滞后（已回补）</span>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <NewSessionDialog open={newOpen} onClose={() => setNewOpen(false)} />

      <SessionMenu menu={menu} onClose={() => setMenu(null)} onRename={startRename} />

      <YDialog
        open={() => renameTarget() !== null}
        title="重命名会话"
        width={400}
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <YButton variant="ghost" onClick={() => setRenameTarget(null)}>
              取消
            </YButton>
            <YButton
              onClick={() => {
                const id = renameTarget();
                if (id !== null) logStore.renameSession(id, renameText());
                setRenameTarget(null);
              }}
            >
              确定
            </YButton>
          </>
        }
      >
        <YTextField label="会话标题" value={renameText()} onInput={setRenameText} />
      </YDialog>

      <YToaster toaster={toaster} />
    </div>
  );
}
