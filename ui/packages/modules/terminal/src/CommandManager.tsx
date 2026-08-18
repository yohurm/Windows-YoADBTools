/**
 * 命令管理窗口：快照编辑（深拷贝 draft）、全量提交、取消零污染。
 */

import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";
import { createStore } from "solid-js/store";

import { YoBadge, YoButton, YoCheckbox, YoDialog, YoIconButton, YoPanel, YoTextField, YoToolbar } from "@yovo/ui";

import type { CommandLibraryDto } from "@yovo/api";
import { terminalStore } from "./store";
import "./command-manager.css";

/** 编辑器使用的草稿命令（inputs 以文本行编辑，提交时拆分）。 */
interface DraftCommand {
  id: string;
  name: string;
  template: string;
  inputsText: string;
  failure_regex: string;
  success_regex: string;
  delay_ms: number;
  abort_on_fail: boolean;
}

interface DraftGroup {
  id: string;
  name: string;
  tagsText: string;
  commands: DraftCommand[];
}

interface DraftState {
  groups: DraftGroup[];
}

const emptyCommand = (id: string): DraftCommand => ({
  id,
  name: "",
  template: "",
  inputsText: "",
  failure_regex: "",
  success_regex: "",
  delay_ms: 0,
  abort_on_fail: true,
});

const emptyGroup = (id: string): DraftGroup => ({ id, name: "", tagsText: "", commands: [] });

let draftId = 0;
const nextDraftId = (prefix: string): string => `${prefix}-draft-${++draftId}`;

/** 命令库 DTO → 编辑器草稿。 */
export function toDraft(library: CommandLibraryDto): DraftState {
  return {
    groups: library.groups.map((g) => ({
      id: g.id,
      name: g.name,
      tagsText: g.tags.join(", "),
      commands: g.commands.map((c) => ({
        id: c.id,
        name: c.name,
        template: c.template,
        inputsText: c.inputs.map((i) => i.placeholder).join("\n"),
        failure_regex: c.failure_regex,
        success_regex: c.success_regex,
        delay_ms: c.delay_ms,
        abort_on_fail: c.abort_on_fail,
      })),
    })),
  };
}

/** 编辑器草稿 → 命令库 DTO（提交前转换；校验在 core）。 */
export function fromDraft(draft: DraftState): CommandLibraryDto {
  return {
    schema_version: 2,
    groups: draft.groups.map((g) => ({
      id: g.id,
      name: g.name,
      tags: g.tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      commands: g.commands.map((c) => ({
        id: c.id,
        name: c.name,
        template: c.template,
        inputs: c.inputsText.split("\n").map((line) => line.trim()).filter(Boolean).map((placeholder) => ({ placeholder })),
        failure_regex: c.failure_regex,
        success_regex: c.success_regex,
        delay_ms: c.delay_ms,
        abort_on_fail: c.abort_on_fail,
      })),
    })),
  };
}

export function CommandManager(props: { open: () => boolean; onClose: () => void }) {
  const [draft, setDraft] = createStore<DraftState>({ groups: [] });
  const [selectedGroupId, setSelectedGroupId] = createSignal<string | null>(null);
  const [selectedCommandId, setSelectedCommandId] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  const selectedGroup = createMemo<DraftGroup | undefined>(() =>
    draft.groups.find((g) => g.id === selectedGroupId()),
  );
  const selectedCommand = createMemo<DraftCommand | undefined>(() =>
    selectedGroup()?.commands.find((c) => c.id === selectedCommandId()),
  );

  /** 打开时深拷贝快照（编辑即快照：取消零污染）。 */
  const openDraft = (): void => {
    const snapshot = structuredClone(toDraft(terminalStore.library));
    setDraft({ groups: snapshot.groups });
    setSelectedGroupId(snapshot.groups[0]?.id ?? null);
    setSelectedCommandId(null);
    setError("");
  };

  createEffect((wasOpen?: boolean) => {
    const open = props.open();
    if (open && !wasOpen) {
      untrack(openDraft);
    }
    return open;
  }, false);

  const updateCommand = (patch: Partial<DraftCommand>): void => {
    const gid = selectedGroupId();
    const cid = selectedCommandId();
    if (!gid || !cid) return;
    setDraft("groups", (g) => g.id === gid, "commands", (c) => c.id === cid, patch);
  };

  const addGroup = (): void => {
    const id = nextDraftId("g");
    setDraft("groups", (g) => [...g, emptyGroup(id)]);
    setSelectedGroupId(id);
    setSelectedCommandId(null);
  };

  const removeGroup = (): void => {
    const gid = selectedGroupId();
    if (!gid) return;
    setDraft("groups", (groups) => groups.filter((g) => g.id !== gid));
    const remaining = draft.groups.filter((g) => g.id !== gid);
    setSelectedGroupId(remaining[0]?.id ?? null);
    setSelectedCommandId(remaining[0]?.commands[0]?.id ?? null);
  };

  const addCommand = (): void => {
    const gid = selectedGroupId();
    if (!gid) return;
    const id = nextDraftId("c");
    setDraft("groups", (g) => g.id === gid, "commands", (cs) => [...cs, emptyCommand(id)]);
    setSelectedCommandId(id);
  };

  const removeCommand = (): void => {
    const gid = selectedGroupId();
    const cid = selectedCommandId();
    if (!gid || !cid) return;
    setDraft("groups", (g) => g.id === gid, "commands", (cs) => cs.filter((c) => c.id !== cid));
    const remaining = selectedGroup()?.commands.filter((c) => c.id !== cid) ?? [];
    setSelectedCommandId(remaining[0]?.id ?? null);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError("");
    try {
      await terminalStore.save(fromDraft({ groups: draft.groups }));
      props.onClose();
    } catch (e) {
      setError(typeof e === "string" ? e : JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <YoDialog
      open={props.open}
      title="命令管理"
      width={960}
      height={560}
      onClose={props.onClose}
      footer={
        <>
          <Show when={error()}>
            <span class="yovo-cm__error">{error()}</span>
          </Show>
          <YoButton variant="ghost" onClick={props.onClose} disabled={saving()}>
            取消
          </YoButton>
          <YoButton onClick={() => void save()} loading={saving()}>
            保存
          </YoButton>
        </>
      }
    >
      <div class="yovo-cm">
        <div class="yovo-cm__groups">
          <YoToolbar>
            <span class="yovo-cm__caption">命令组</span>
            <YoIconButton icon="plus" title="新增组" onClick={addGroup} />
            <YoIconButton icon="trash" title="删除组" onClick={removeGroup} />
          </YoToolbar>
          <ul class="yovo-cm__list">
            <For each={draft.groups}>
              {(group) => (
                <li
                  class="yovo-cm__item yovo-interactive"
                  classList={{
                    "yovo-cm__item--active": group.id === selectedGroupId(),
                    "yovo-interactive--selected": group.id === selectedGroupId(),
                  }}
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setSelectedCommandId(null);
                  }}
                >
                  <span class="yovo-cm__item-name">{group.name || "（未命名）"}</span>
                  <YoBadge text={String(group.commands.length)} tone="neutral" />
                </li>
              )}
            </For>
          </ul>
        </div>

        <div class="yovo-cm__commands">
          <YoToolbar>
            <span class="yovo-cm__caption">命令</span>
            <YoIconButton icon="plus" title="新增命令" onClick={addCommand} />
            <YoIconButton icon="trash" title="删除命令" onClick={removeCommand} />
          </YoToolbar>
          <ul class="yovo-cm__list">
            <For each={selectedGroup()?.commands ?? []}>
              {(command) => (
                <li
                  class="yovo-cm__item yovo-interactive"
                  classList={{
                    "yovo-cm__item--active": command.id === selectedCommandId(),
                    "yovo-interactive--selected": command.id === selectedCommandId(),
                  }}
                  onClick={() => setSelectedCommandId(command.id)}
                >
                  <span class="yovo-cm__item-name">{command.name || "（未命名）"}</span>
                </li>
              )}
            </For>
          </ul>
        </div>

        <div class="yovo-cm__editor">
          <Show
            when={selectedCommand()}
            keyed
            fallback={
              <Show
                when={selectedGroup()}
                fallback={<p class="yovo-cm__empty">选择左侧命令组，或新建一组</p>}
              >
                {(group) => (
                  <YoPanel title="组属性">
                    <YoTextField
                      label="组名称"
                      value={group().name}
                      onInput={(v) => setDraft("groups", (g) => g.id === group().id, "name", v)}
                    />
                    <YoTextField
                      label="标签（逗号分隔）"
                      value={group().tagsText}
                      onInput={(v) => setDraft("groups", (g) => g.id === group().id, "tagsText", v)}
                    />
                  </YoPanel>
                )}
              </Show>
            }
          >
            {(command) => (
              <YoPanel title={`命令属性 · ${selectedGroup()?.name || "未命名组"}`}>
                <YoTextField label="命令名称" value={command.name} onInput={(v) => updateCommand({ name: v })} />
                <YoTextField
                  label="命令行（占位符 {0} {1}…）"
                  value={command.template}
                  onInput={(v) => updateCommand({ template: v })}
                />
                <YoTextField
                  label="输入框提示（每行一个，与占位符数量一致）"
                  value={command.inputsText}
                  onInput={(v) => updateCommand({ inputsText: v })}
                />
                <YoTextField
                  label="失败正则（命中即失败，留空不启用）"
                  value={command.failure_regex}
                  onInput={(v) => updateCommand({ failure_regex: v })}
                />
                <YoTextField
                  label="成功正则（命中即成功，留空看退出码）"
                  value={command.success_regex}
                  onInput={(v) => updateCommand({ success_regex: v })}
                />
                <YoTextField
                  label="组内延时（毫秒）"
                  type="number"
                  value={String(command.delay_ms)}
                  onInput={(v) => {
                    const n = Number.parseInt(v, 10);
                    if (!Number.isNaN(n) && n >= 0) updateCommand({ delay_ms: n });
                  }}
                />
                <YoCheckbox
                  label="失败中断组执行"
                  checked={command.abort_on_fail}
                  onChange={(v) => updateCommand({ abort_on_fail: v })}
                />
              </YoPanel>
            )}
          </Show>
        </div>
      </div>
    </YoDialog>
  );
}
