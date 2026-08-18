/**
 * 文件表（View）：列规格来自 model.FILE_COLUMNS，状态全在 fileStore。
 */

import { For, Show } from "solid-js";

import { Icon, YColResizer, YEmptyState, YFileIcon, YVirtualList } from "@yovo/ui";
import type { RemoteEntry } from "@yovo/api";

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
    <span
      class="yovo-files__col"
      classList={{ "yovo-files__col--end": props.col.align === "end" }}
      role="columnheader"
      aria-sort={ariaSort()}
    >
      <button
        type="button"
        class="yovo-files__sort"
        onClick={() => fileStore.setSort(props.col.key)}
        title={props.col.sortTitle}
      >
        <span class="yovo-files__sort-label">{props.col.header}</span>
        <span class="yovo-files__sort-icon" aria-hidden="true">
          <Show when={ariaSort() !== "none"}>
            <Icon name={ariaSort() === "ascending" ? "chevron-up" : "chevron-down"} size={12} />
          </Show>
        </span>
      </button>
      <Show when={!props.col.flex}>
        <YColResizer label={props.col.resizeLabel} onResize={(dx) => fileStore.resizeCol(props.index, dx)} />
      </Show>
    </span>
  );
}

function FileCell(props: { entry: RemoteEntry; col: FileColumnSpec }) {
  const type = (): string => fileTypeLabel(props.entry);
  const size = (): string => (props.entry.kind === "file" ? formatSize(props.entry.size) : "");
  const mtime = (): string => formatMtime(props.entry.mtime);
  switch (props.col.key) {
    case "name":
      return (
        <span class="yovo-files__name">
          <YFileIcon name={props.entry.name} kind={props.entry.kind} size={16} />
          <span class="yovo-files__name-text" title={props.entry.name}>
            {props.entry.name}
          </span>
        </span>
      );
    case "type":
      return (
        <span class="yovo-files__cell" title={type()}>
          {type()}
        </span>
      );
    case "size":
      return (
        <span class="yovo-files__cell yovo-files__num" title={size()}>
          {size()}
        </span>
      );
    case "mtime":
      return (
        <span class="yovo-files__cell yovo-files__mtime" title={props.entry.mtime ?? ""}>
          {mtime()}
        </span>
      );
  }
}

export function FileTable(props: { onContextMenu: (x: number, y: number) => void }) {
  const colStyle = (): { "grid-template-columns": string } => ({
    "grid-template-columns": fileColTemplate(fileStore.ui.colWidths),
  });
  const entries = (): RemoteEntry[] => fileStore.entries;

  return (
    <section class="yovo-files__table">
      <div class="yovo-files__cols yovo-files__cols--head" style={colStyle()} role="row">
        <For each={[...FILE_COLUMNS]}>{(col, index) => <ColHead col={col} index={index()} />}</For>
      </div>
      <div
        class="yovo-files__table-list"
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest(".yovo-virtual-list__row")) return;
          event.preventDefault();
          fileStore.clearSelection();
          props.onContextMenu(event.clientX, event.clientY);
        }}
      >
        <Show when={entries().length > 0} fallback={<YEmptyState icon="folder" title="此文件夹为空" />}>
          <YVirtualList<RemoteEntry>
            items={entries}
            itemHeight={28}
            getItemKey={(entry) => entry.name}
            ariaLabel="文件列表"
            selectedKeys={fileStore.selectedSet}
            onSelectRow={(entry, _key, event) => {
              if (event && "shiftKey" in event && event.shiftKey) fileStore.select(entry.name, "range");
              else if (event && "ctrlKey" in event && (event.ctrlKey || event.metaKey)) {
                fileStore.select(entry.name, "toggle");
              } else fileStore.select(entry.name, "replace");
            }}
            onRowContextMenu={(entry, _key, event) => {
              if (!fileStore.selectedSet().has(entry.name)) fileStore.select(entry.name, "replace");
              props.onContextMenu(event.clientX, event.clientY);
            }}
            renderRow={(entry) => (
              <div
                class="yovo-files__cols yovo-files__row"
                style={colStyle()}
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
