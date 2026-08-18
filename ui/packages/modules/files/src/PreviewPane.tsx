import { Show } from "solid-js";

import { YFileIcon } from "@yovo/ui";

import { fileTypeLabel, formatSize } from "./model";
import { fileStore } from "./store";

export function PreviewPane() {
  const preview = () => {
    const list = fileStore.selectedEntries();
    return list.length === 1 ? list[0] : undefined;
  };

  return (
    <aside class="yovo-files__preview" classList={{ "yovo-files__preview--open": fileStore.ui.previewOpen }}>
      <div class="yovo-files__preview-head">预览</div>
      <Show when={preview()} fallback={<div class="yovo-files__preview-empty">选择一个项目以预览</div>}>
        {(entry) => (
          <div class="yovo-files__preview-body">
            <YFileIcon name={entry().name} kind={entry().kind} size={48} />
            <div class="yovo-files__preview-name" title={entry().name}>
              {entry().name}
            </div>
            <dl class="yovo-files__preview-meta">
              <dt>类型</dt>
              <dd>{fileTypeLabel(entry())}</dd>
              <dt>大小</dt>
              <dd>{entry().kind === "file" ? formatSize(entry().size) : "—"}</dd>
              <dt>修改时间</dt>
              <dd>{entry().mtime ?? "—"}</dd>
              <dt>权限</dt>
              <dd>{entry().permission}</dd>
            </dl>
          </div>
        )}
      </Show>
    </aside>
  );
}
