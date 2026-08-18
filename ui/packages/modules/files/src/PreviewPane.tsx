import { Show } from "solid-js";

import { YoFileIcon } from "@yohu/ui";

import { fileTypeLabel, formatSize } from "./model";
import { fileStore } from "./store";

export function PreviewPane() {
  const preview = () => {
    const list = fileStore.selectedEntries();
    return list.length === 1 ? list[0] : undefined;
  };

  return (
    <aside class="yohu-files__preview" classList={{ "yohu-files__preview--open": fileStore.ui.previewOpen }}>
      <div class="yohu-files__preview-head">预览</div>
      <Show when={preview()} fallback={<div class="yohu-files__preview-empty">选择一个项目以预览</div>}>
        {(entry) => (
          <div class="yohu-files__preview-body">
            <YoFileIcon name={entry().name} kind={entry().kind} size={48} />
            <div class="yohu-files__preview-name" title={entry().name}>
              {entry().name}
            </div>
            <dl class="yohu-files__preview-meta">
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
