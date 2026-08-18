/**
 * 新建日志会话：按包名或 PID 划分（默认 All Tab 已存在，不再提供「全部」）。
 */

import { Show, createEffect, createMemo, createSignal } from "solid-js";

import { YButton, YCheckbox, YDialog, YSelect, YTextField } from "@yovo/ui";

import type { SessionScope } from "./pipeline";
import { logStore } from "./store";

export function NewSessionDialog(props: { open: () => boolean; onClose: () => void }) {
  const [mode, setMode] = createSignal<"package" | "pid">("package");
  const [pkg, setPkg] = createSignal("");
  const [pidText, setPidText] = createSignal("");
  const [includeChild, setIncludeChild] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (!props.open()) return;
    setMode("package");
    setPkg("");
    setPidText("");
    setIncludeChild(false);
    setError("");
    if (!logStore.serial()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void logStore.refreshProcesses().finally(() => setLoading(false));
  });

  const packageOptions = createMemo(() => {
    const names = [...new Set(logStore.state.processEntries.map((e) => e.name))].sort();
    return names.map((n) => ({ value: n, label: n }));
  });

  const pidOptions = createMemo(() =>
    [...logStore.state.processEntries]
      .sort((a, b) => a.name.localeCompare(b.name) || a.pid - b.pid)
      .map((e) => ({ value: String(e.pid), label: `${e.name}  ·  ${e.pid}` })),
  );

  const canCreate = (): boolean => {
    if (!logStore.serial()) return false;
    if (mode() === "package") return pkg().trim().length > 0;
    const pid = Number.parseInt(pidText(), 10);
    return Number.isInteger(pid) && pid > 0;
  };

  const create = (): void => {
    let scope: SessionScope;
    let title: string;
    if (mode() === "package") {
      const name = pkg().trim();
      if (!name) {
        setError("请选择或输入包名");
        return;
      }
      scope = { kind: "package", pkg: name, includeChild: includeChild() };
      title = name;
    } else {
      const pid = Number.parseInt(pidText(), 10);
      if (!Number.isInteger(pid) || pid <= 0) {
        setError("请输入有效 PID");
        return;
      }
      scope = { kind: "pid", pid };
      title = `PID ${pid}`;
    }
    logStore.createSession(scope, title);
    props.onClose();
  };

  return (
    <YDialog
      open={props.open}
      title="新建日志会话"
      width={480}
      onClose={props.onClose}
      footer={
        <>
          <YButton variant="ghost" onClick={props.onClose}>
            取消
          </YButton>
          <YButton onClick={create} disabled={!canCreate()}>
            创建
          </YButton>
        </>
      }
    >
      <div class="yovo-logs__new">
        <Show when={!logStore.serial()}>
          <p class="yovo-logs__new-hint">请先在左侧选择在线设备。</p>
        </Show>
        <div class="yovo-logs__field">
          <span class="yovo-logs__label">划分方式</span>
          <YSelect
            options={[
              { value: "package", label: "按包名" },
              { value: "pid", label: "按 PID" },
            ]}
            value={mode()}
            onChange={(v) => {
              setMode(v as "package" | "pid");
              setError("");
            }}
          />
        </div>

        <Show when={mode() === "package"}>
          <div class="yovo-logs__field">
            <span class="yovo-logs__label">包名</span>
            <YSelect
              options={packageOptions()}
              value={pkg() || null}
              onChange={setPkg}
              placeholder={loading() ? "正在读取进程…" : "从进程列表选择"}
            />
            <YTextField
              label="或手动输入"
              value={pkg()}
              onInput={(v) => {
                setPkg(v);
                setError("");
              }}
              placeholder="com.example.app"
            />
            <YCheckbox label="包含子进程（pkg:xxx）" checked={includeChild()} onChange={setIncludeChild} />
          </div>
        </Show>

        <Show when={mode() === "pid"}>
          <div class="yovo-logs__field">
            <span class="yovo-logs__label">进程</span>
            <YSelect
              options={pidOptions()}
              value={pidText() || null}
              onChange={(v) => {
                setPidText(v);
                setError("");
              }}
              placeholder={loading() ? "正在读取进程…" : "从进程列表选择"}
            />
            <YTextField
              label="或输入 PID"
              value={pidText()}
              onInput={(v) => {
                setPidText(v);
                setError("");
              }}
              placeholder="例如 12345"
            />
          </div>
        </Show>

        <Show when={logStore.state.indexDegraded}>
          <p class="yovo-logs__new-hint">进程列表读取失败，可手动输入包名或 PID。</p>
        </Show>
        <Show when={error()}>
          <p class="yovo-logs__new-error">{error()}</p>
        </Show>
      </div>
    </YDialog>
  );
}
