/**
 * 终端主视图：命令库树（组/命令）+ 工具栏 + 结果日志区。
 */

import { For, Show, createEffect, createMemo, createSignal, onMount } from "solid-js";

import {
  YBadge,
  YButton,
  YDialog,
  YEmptyState,
  YIconButton,
  YTextField,
  YToolbar,
  YTree,
} from "@yovo/ui";
import type { TreeNode } from "@yovo/ui";
import type { CommandDto, CommandGroupDto } from "@yovo/api";

import { CommandManager } from "./CommandManager";
import { terminalStore } from "./store";
import "./terminal.css";

/** 输入框填值对话框（占位符填充）。 */
function InputDialog(props: {
  command: CommandDto;
  open: () => boolean;
  onClose: () => void;
  onSubmit: (values: string[]) => void;
}) {
  const [values, setValues] = createSignal<string[]>([]);

  createEffect(() => {
    if (props.open()) {
      setValues(props.command.inputs.map(() => ""));
    }
  });

  const submit = (): void => {
    props.onSubmit(values());
    props.onClose();
  };

  return (
    <YDialog
      open={props.open}
      title={`执行: ${props.command.name}`}
      width={520}
      onClose={props.onClose}
      footer={
        <>
          <YButton variant="ghost" onClick={props.onClose}>
            取消
          </YButton>
          <YButton onClick={submit}>执行</YButton>
        </>
      }
    >
      <div class="yovo-terminal__inputs">
        <For each={props.command.inputs}>
          {(input, index) => (
            <YTextField
              label={input.placeholder || `参数 ${index() + 1}`}
              value={values()[index()] ?? ""}
              onInput={(v) => setValues((vs) => vs.map((old, i) => (i === index() ? v : old)))}
            />
          )}
        </For>
      </div>
    </YDialog>
  );
}

export function TerminalView() {
  const [running, setRunning] = createSignal(false);
  const [managerOpen, setManagerOpen] = createSignal(false);
  const [inputCommand, setInputCommand] = createSignal<CommandDto | null>(null);
  const [inputOpen, setInputOpen] = createSignal(false);
  const [selectedKey, setSelectedKey] = createSignal<string | null>(null);

  let resultBox: HTMLDivElement | undefined;

  onMount(() => {
    void terminalStore.load();
  });

  // 新结果自动滚底
  createEffect(() => {
    const count = terminalStore.results.length;
    void count;
    if (resultBox) {
      resultBox.scrollTop = resultBox.scrollHeight;
    }
  });

  const treeData = createMemo<TreeNode<CommandDto | CommandGroupDto>[]>(() =>
    terminalStore.library.groups.map((group) => ({
      key: `g:${group.id}`,
      label: group.name,
      icon: "folder" as const,
      data: group,
      children: group.commands.map((command) => ({
        key: `c:${command.id}`,
        label: command.name,
        icon: "terminal" as const,
        data: command,
      })),
    })),
  );

  const selection = createMemo(() => {
    const key = selectedKey();
    if (!key) return null;
    if (key.startsWith("c:")) {
      const id = key.slice(2);
      for (const group of terminalStore.library.groups) {
        const command = group.commands.find((c) => c.id === id);
        if (command) return { type: "command" as const, command };
      }
    }
    if (key.startsWith("g:")) {
      const id = key.slice(2);
      const group = terminalStore.library.groups.find((g) => g.id === id);
      if (group) return { type: "group" as const, group };
    }
    return null;
  });

  const run = (): void => {
    const sel = selection();
    if (!sel) return;
    if (sel.type === "command") {
      if (sel.command.inputs.length > 0) {
        setInputCommand(sel.command);
        setInputOpen(true);
        return;
      }
      setRunning(true);
      void terminalStore.runCommand(sel.command, []).finally(() => setRunning(false));
    } else {
      setRunning(true);
      void terminalStore.runGroup(sel.group).finally(() => setRunning(false));
    }
  };

  return (
    <div class="yovo-terminal">
      <YToolbar>
        <span class="yovo-terminal__title">ADB 命令终端</span>
        <YButton onClick={run} loading={running()} disabled={!selection()}>
          执行
        </YButton>
        <YButton variant="secondary" onClick={() => setManagerOpen(true)}>
          命令管理
        </YButton>
        <YIconButton icon="refresh" title="重新加载命令库" onClick={() => void terminalStore.load()} />
        <span class="yovo-terminal__devices">在线设备: {terminalStore.onlineCount()}</span>
      </YToolbar>

      <div class="yovo-terminal__body">
        <div class="yovo-terminal__library">
          <Show
            when={treeData().length > 0}
            fallback={
              <YEmptyState icon="terminal" title="命令库为空" description="点击「命令管理」添加命令" />
            }
          >
            <YTree
              data={treeData()}
              defaultExpandedKeys={terminalStore.library.groups.map((g) => `g:${g.id}`)}
              onSelect={(key) => setSelectedKey(key)}
            />
          </Show>
        </div>

        <div class="yovo-terminal__results">
          <div class="yovo-terminal__results-head">
            <span>执行结果</span>
            <Show when={running()}>
              <YBadge text="执行中" tone="warn" />
            </Show>
          </div>
          <div
            class="yovo-terminal__results-list"
            ref={(el) => {
              resultBox = el;
            }}
          >
            <For each={terminalStore.results}>
              {(entry) => (
                <div
                  class="yovo-terminal__result"
                  classList={{ "yovo-terminal__result--fail": !entry.ok }}
                >
                  <div class="yovo-terminal__result-head">
                    <span class="yovo-terminal__result-time">{entry.time}</span>
                    <span class="yovo-terminal__result-serial">{entry.serial}</span>
                    <span class="yovo-terminal__result-title">{entry.title}</span>
                    <YBadge text={entry.ok ? "通过" : "失败"} tone={entry.ok ? "success" : "error"} />
                  </div>
                  <Show when={entry.message}>
                    <pre class="yovo-terminal__result-msg">{entry.message}</pre>
                  </Show>
                  <Show when={entry.stdout}>
                    <pre class="yovo-terminal__result-out">{entry.stdout}</pre>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      <CommandManager open={managerOpen} onClose={() => setManagerOpen(false)} />

      <Show when={inputCommand()}>
        <InputDialog
          command={inputCommand()!}
          open={inputOpen}
          onClose={() => {
            setInputOpen(false);
            setInputCommand(null);
          }}
          onSubmit={(values) => {
            const command = inputCommand();
            if (command) void terminalStore.runCommand(command, values);
            setInputCommand(null);
          }}
        />
      </Show>
    </div>
  );
}
