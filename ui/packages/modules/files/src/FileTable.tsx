/**
 * 文件表（View）：列规格来自 model.FILE_COLUMNS，状态全在 fileStore。
 * 表头轨道走 YoColHeader（悬浮片铺满列宽；文案边距在 .yohu-col-header__label）；本文件只提供排序文案与单元格。
 */

import { For, Show } from "solid-js";

import { Icon, YoColHeader, YoEmptyState, YoFileIcon, YoVirtualList, pointerSelectMode } from "@yohu/ui";
import type { RemoteEntry } from "@yohu/api";

import {
  FILE_COLUMNS,
  fileColTemplate,
  fileTypeLabel,
  formatMtime,
  formatSize,
  type FileColumnSpec,
} from "./model";
import { fileStore } from "./store";

function ColHead(props: { col: FileColumnSpec; index: number }) {
  const ariaSort = (): "ascending" | "descending" | "none" => {
    if (fileStore.sort.key !== props.col.key) return "none";
    return fileStore.sort.dir === "asc" ? "ascending" : "descending";
  };
  return (
    <YoColHeader
      align={props.col.align}
      ariaSort={ariaSort()}
      resizable={!props.col.flex}
      resizeLabel={props.col.resizeLabel}
      onResize={(dx) => fileStore.resizeCol(props.index, dx)}
    >
      <button
        type="button"
        class="yohu-files__sort yohu-interactive yohu-focus-ring--inset"
        onClick={() => fileStore.setSort(props.col.key)}
        title={props.col.sortTitle}
      >
        <span class="yohu-col-header__label">
          <span class="yohu-files__sort-label">{props.col.header}</span>
          <Show when={ariaSort() !== "none"}>
            <span class="yohu-files__sort-icon" aria-hidden="true">
              <Icon name={ariaSort() === "ascending" ? "chevron-up" : "chevron-down"} size={12} />
            </span>
          </Show>
        </span>
      </button>
    </YoColHeader>
  );
}

function FileCell(props: { entry: RemoteEntry; col: FileColumnSpec }) {
  const type = (): string => fileTypeLabel(props.entry);
  const size = (): string => (props.entry.kind === "file" ? formatSize(props.entry.size) : "");
  const mtime = (): string => formatMtime(props.entry.mtime);
  switch (props.col.key) {
    case "name":
      return (
        <span class="yohu-files__name">
          <YoFileIcon name={props.entry.name} kind={props.entry.kind} size={16} />
          <span class="yohu-files__name-text" title={props.entry.name}>
            {props.entry.name}
          </span>
        </span>
      );
    case "type":
      return (
        <span class="yohu-files__cell" title={type()}>
          {type()}
        </span>
      );
    case "size":
      return (
        <span class="yohu-files__cell yohu-files__num" title={size()}>
          {size()}
        </span>
      );
    case "mtime":
      return (
        <span class="yohu-files__cell yohu-files__mtime" title={props.entry.mtime ?? ""}>
          {mtime()}
        </span>
      );
  }
}

export function FileTable(props: { onContextMenu: (x: number, y: number) => void; dropDirName?: string | null }) {
  const colStyle = (): { "grid-template-columns": string } => ({
    "grid-template-columns": fileColTemplate(fileStore.ui.colWidths),
  });
  const entries = (): RemoteEntry[] => fileStore.entries;

  return (
    <section class="yohu-files__table">
      <div class="yohu-files__cols yohu-files__cols--head" style={colStyle()} role="row">
        <For each={[...FILE_COLUMNS]}>{(col, index) => <ColHead col={col} index={index()} />}</For>
      </div>
      <div
        class="yohu-files__table-list"
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest(".yohu-virtual-list__row")) return;
          event.preventDefault();
          fileStore.clearSelection();
          props.onContextMenu(event.clientX, event.clientY);
        }}
      >
        <Show when={entries().length > 0} fallback={<YoEmptyState icon="folder" title="此文件夹为空" />}>
          <YoVirtualList<RemoteEntry>
            items={entries}
            itemHeight={28}
            getItemKey={(entry) => entry.name}
            ariaLabel="文件列表"
            selectedKeys={fileStore.selectedSet}
            onSelectRow={(entry, _key, event) => {
              fileStore.select(entry.name, pointerSelectMode(event));
            }}
            onRowContextMenu={(entry, _key, event) => {
              if (!fileStore.selectedSet().has(entry.name)) fileStore.select(entry.name, "replace");
              props.onContextMenu(event.clientX, event.clientY);
            }}
            renderRow={(entry) => (
              <div
                class="yohu-files__cols yohu-files__row"
                classList={{ "yohu-files__row--drop": props.dropDirName === entry.name }}
                data-kind={entry.kind}
                draggable="true"
                style={colStyle()}
                onDragStart={(event) => {
                  event.preventDefault();
                  if (!fileStore.selectedSet().has(entry.name)) fileStore.select(entry.name, "replace");
                  void fileStore.dragOut(entry.name);
                }}
                onDblClick={() => {
                  if (entry.kind === "dir" || entry.kind === "symlink") void fileStore.enterDirectory(entry.name);
                }}
              >
                <For each={[...FILE_COLUMNS]}>{(col) => <FileCell entry={entry} col={col} />}</For>
              </div>
            )}
          />
        </Show>
      </div>
    </section>
  );
}
