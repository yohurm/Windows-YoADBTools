/**
 * 终端主视图（UI设计系统-v6.md §4.2）：左侧命令库树（组命令数徽章/命令模板 title）
 * + 右侧结构化结果卡片（设备维度分组 → 头部行：设备徽章 + 命令名 + 通过/失败徽章 + 用时
 * + 折叠输出区，失败项默认展开）。
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
import { terminalStore, type ResultEntry } from "./store";
import "./terminal.css";

/** 用时显示：<1s 毫秒，≥1s 秒（1 位小数）。 */
function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

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
    const live = fieldsRoot
      ? Array.from(fieldsRoot.querySelectorAll("input")).map((el) => (el as HTMLInputElement).value)
      : values();
    props.onSubmit(live.length > 0 ? live : values());
    props.onClose();
  };

  let fieldsRoot: HTMLDivElement | undefined;

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
      <div
        class="yovo-terminal__inputs"
        ref={(el) => {
          fieldsRoot = el;
        }}
      >
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

/** 单条结果卡片：头部行 + 折叠输出区（失败默认展开）。 */
function ResultCard(props: {
  entry: ResultEntry;
  open: boolean;
  showSerial: boolean;
  onToggle: () => void;
}) {
  const onHeadKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onToggle();
    }
  };

  return (
    <div class="yovo-terminal__result" classList={{ "yovo-terminal__result--fail": !props.entry.ok }}>
      <div
        class="yovo-terminal__result-head"
        role="button"
        tabIndex={0}
        aria-expanded={props.open}
        onClick={props.onToggle}
        onKeyDown={onHeadKeyDown}
      >
        <YIconButton
          icon={props.open ? "chevron-down" : "chevron-right"}
          title={props.open ? "收起输出" : "展开输出"}
          onClick={(event) => {
            event.stopPropagation();
            props.onToggle();
          }}
        />
        <Show when={props.showSerial}>
          <YBadge text={props.entry.serial} tone="neutral" />
        </Show>
        <span class="yovo-terminal__result-title">{props.entry.title}</span>
        <Show when={props.entry.message}>
          <span class="yovo-terminal__result-msgline" title={props.entry.message}>
            {props.entry.message}
          </span>
        </Show>
        <span class="yovo-terminal__result-meta">
          <Show when={props.entry.durationMs !== undefined}>
            <span class="yovo-terminal__result-duration">{formatDuration(props.entry.durationMs!)}</span>
          </Show>
          <span class="yovo-terminal__result-time">{props.entry.time}</span>
        </span>
        <YBadge text={props.entry.ok ? "通过" : "失败"} tone={props.entry.ok ? "success" : "error"} />
      </div>
      <Show when={props.open}>
        <Show when={props.entry.stdout}>
          <pre class="yovo-terminal__result-out">{props.entry.stdout}</pre>
        </Show>
        <Show when={!props.entry.stdout}>
          <pre class="yovo-terminal__result-out yovo-terminal__result-out--empty">
            {props.entry.message || "（无输出）"}
          </pre>
        </Show>
      </Show>
    </div>
  );
}

export function TerminalView() {
  const [running, setRunning] = createSignal(false);
  const [managerOpen, setManagerOpen] = createSignal(false);
  const [inputCommand, setInputCommand] = createSignal<CommandDto | null>(null);
  const [inputOpen, setInputOpen] = createSignal(false);
  const [selectedKey, setSelectedKey] = createSignal<string | null>(null);
  /** 显式展开状态（缺省 = 失败项展开） */
  const [expanded, setExpanded] = createSignal<Map<number, boolean>>(new Map());

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
      badge: String(group.commands.length),
      children: group.commands.map((command) => ({
        key: `c:${command.id}`,
        label: command.name,
        icon: "terminal" as const,
        data: command,
        title: command.template,
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

  /** 设备维度分组（保持到达顺序）。 */
  const grouped = createMemo<{ serial: string; entries: ResultEntry[] }[]>(() => {
    const map = new Map<string, ResultEntry[]>();
    for (const entry of terminalStore.results) {
      const list = map.get(entry.serial);
      if (list) list.push(entry);
      else map.set(entry.serial, [entry]);
    }
    return [...map.entries()].map(([serial, entries]) => ({ serial, entries }));
  });

  const multiDevice = (): boolean => grouped().length > 1;

  const isOpen = (entry: ResultEntry): boolean => expanded().get(entry.id) ?? !entry.ok;

  const toggle = (entry: ResultEntry): void => {
    setExpanded((prev) => new Map(prev).set(entry.id, !isOpen(entry)));
  };

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
        <span class="yovo-module-title">ADB 命令终端</span>
        <YButton onClick={run} loading={running()} disabled={!selection()}>
          执行
        </YButton>
        <YButton variant="secondary" onClick={() => setManagerOpen(true)}>
          命令管理
        </YButton>
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
            <Show
              when={grouped().length > 0}
              fallback={
                <YEmptyState icon="terminal" title="暂无执行结果" description="选择命令库中的命令或命令组后点击「执行」" />
              }
            >
              <For each={grouped()}>
                {({ serial, entries }) => {
                  const pass = () => entries.filter((e) => e.ok).length;
                  const fail = () => entries.length - pass();
                  return (
                    <div class="yovo-terminal__group">
                      <Show when={multiDevice()}>
                        <div class="yovo-terminal__group-head">
                          <YBadge text={serial === "-" ? "无设备" : serial} tone="neutral" />
                          <Show when={pass() > 0}>
                            <YBadge text={`${pass()} 通过`} tone="success" />
                          </Show>
                          <Show when={fail() > 0}>
                            <YBadge text={`${fail()} 失败`} tone="error" />
                          </Show>
                        </div>
                      </Show>
                      <For each={entries}>
                        {(entry) => (
                          <ResultCard
                            entry={entry}
                            open={isOpen(entry)}
                            showSerial={!multiDevice()}
                            onToggle={() => toggle(entry)}
                          />
                        )}
                      </For>
                    </div>
                  );
                }}
              </For>
            </Show>
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
