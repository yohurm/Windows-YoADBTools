/**
 * 导出对话框（导出方式=选择窗口文件）：多选列表 + 全选/取消全选。
 * 选中即合并导出；行数以 core 记录的为准。
 */

import { For, Show, createEffect, createSignal } from "solid-js";

import type { SessionLogFile } from "@yohu/api";
import { YoButton, YoCheckbox, YoDialog } from "@yohu/ui";

export function ExportDialog(props: {
  open: () => boolean;
  files: SessionLogFile[];
  onClose: () => void;
  onConfirm: (paths: string[]) => void;
}) {
  const [selected, setSelected] = createSignal<string[]>([]);

  // 打开时默认全选
  createEffect(() => {
    if (props.open()) {
      setSelected(props.files.map((f) => f.path));
    }
  });

  const toggle = (path: string, checked: boolean): void => {
    const next = selected().filter((p) => p !== path);
    if (checked) next.push(path);
    setSelected(next);
  };

  const selectAll = (): void => {
    setSelected(props.files.map((f) => f.path));
  };
  const clearAll = (): void => {
    setSelected([]);
  };

  const canConfirm = (): boolean => selected().length > 0;

  return (
    <YoDialog
      open={props.open}
      title="导出日志（选择窗口文件）"
      onClose={() => props.onClose()}
      footer={
        <>
          <YoButton variant="ghost" onClick={() => props.onClose()}>
            取消
          </YoButton>
          <YoButton disabled={!canConfirm()} onClick={() => props.onConfirm([...selected()])}>
            导出
          </YoButton>
        </>
      }
    >
      <div class="yohu-logs-export">
        <div class="yohu-logs-export__tools">
          <YoButton variant="secondary" onClick={selectAll}>
            全选
          </YoButton>
          <YoButton variant="secondary" onClick={clearAll}>
            取消全选
          </YoButton>
          <span class="yohu-logs-export__count">已选 {selected().length} 个</span>
        </div>
        <Show
          when={props.files.length > 0}
          fallback={<div class="yohu-logs-export__empty">没有可导出的窗口日志文件</div>}
        >
          <div class="yohu-logs-export__list" role="listbox" aria-label="窗口日志文件">
            <For each={props.files}>
              {(f) => (
                <YoCheckbox
                  label={`${f.serial} · ${f.name || `窗口${f.window_id}`}（${f.lines} 行）`}
                  checked={selected().includes(f.path)}
                  onChange={(v) => toggle(f.path, v)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </YoDialog>
  );
}
