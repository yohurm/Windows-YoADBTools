/**
 * 日志分析主视图：工具栏 + 多会话 Tab（Xshell 式）+ AS 风格过滤栏 + 虚拟化列表。
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import {
  YBadge,
  YButton,
  YDialog,
  YEmptyState,
  YIconButton,
  YSelect,
  YTabs,
  YTextField,
  YToolbar,
  YVirtualList,
} from "@yovo/ui";
import type { LogLine } from "@yovo/api";

import { LEVELS, levelRank, type SessionScope } from "./pipeline";
import { logStore } from "./store";
import "./logs.css";

const LEVEL_OPTIONS = [
  { value: "", label: "全部" },
  ...LEVELS.map((l) => ({ value: l, label: l })),
];

/** 行级别着色。 */
const levelClass = (level: string): string => {
  const rank = levelRank(level);
  if (level === "W") return "yovo-logs__level--warn";
  if (level === "E" || level === "F") return "yovo-logs__level--error";
  if (rank <= 1) return "yovo-logs__level--dim";
  return "";
};

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

export function LogAnalyzerView() {
  const [newOpen, setNewOpen] = createSignal(false);

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
    await logStore.exportSession(id);
  };

  return (
    <div class="yovo-logs">
      <YToolbar>
        <span class="yovo-logs__title">日志分析</span>
        <Show
          when={!logStore.state.capturing}
          fallback={
            <YButton variant="secondary" onClick={() => void logStore.stopCapture()}>
              停止
            </YButton>
          }
        >
          <YButton onClick={() => void logStore.startCapture()}>开始</YButton>
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
                label="Tag"
                placeholder="包含"
                value={session.tagContains}
                clearable
                onInput={(v) => logStore.patchFilter(session.id, { tagContains: v })}
              />
              <span
                class="yovo-logs__kw"
                ref={(el) => {
                  keywordRef = el.querySelector("input") ?? undefined;
                }}
              >
                <YTextField
                  label="关键字"
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
              <Show
                when={session.visible.length > 0}
                fallback={<YEmptyState icon="log" title="暂无日志" description={logStore.state.capturing ? "等待设备输出…" : "点击「开始」采集"} />}
              >
                <YVirtualList<ViewRow>
                  items={() => session.visible}
                  itemHeight={22}
                  getItemKey={(row) => `${row.line.seq}-${row.line.pid}`}
                  autoScrollToBottom={() => session.autoScroll}
                  renderRow={(row) => (
                    <div class="yovo-logs__row">
                      <span class="yovo-logs__row-ts">{row.line.ts}</span>
                      <span class="yovo-logs__row-pid">{row.line.pid}</span>
                      <span class={`yovo-logs__row-level ${levelClass(row.line.level)}`}>{row.line.level}</span>
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
              <span>缓冲 {logStore.state.bufferLines}</span>
              <span>可见 {session.visible.length}</span>
              <span classList={{ "yovo-logs__status-signal": session.signalCount > 0 }}>
                信号 {session.signalCount}
              </span>
              <Show when={logStore.state.indexUpdatedAt !== null}>
                <span>进程索引 {Math.round((Date.now() - (logStore.state.indexUpdatedAt ?? 0)) / 1000)}s 前</span>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <NewSessionDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

/** ViewRow 轻量别名（行渲染）。 */
interface ViewRow {
  line: LogLine;
  collapsedAfter?: number;
}
