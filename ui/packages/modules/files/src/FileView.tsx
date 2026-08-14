/**
 * 文件管理主视图：路径栏 + 目录列表（虚拟化）+ 传输面板 + 危险操作确认。
 */

import { For, Show, createEffect, createSignal } from "solid-js";

import { open, save } from "@tauri-apps/plugin-dialog";

import {
  YBadge,
  YButton,
  YDialog,
  YEmptyState,
  YIconButton,
  YProgressBar,
  YTextField,
  YToolbar,
  YVirtualList,
} from "@yovo/ui";
import type { RemoteEntry } from "@yovo/api";

import { fileStore, formatSize } from "./store";
import "./files.css";

export function FileView() {
  const [newDirName, setNewDirName] = createSignal("");
  const [deleteTarget, setDeleteTarget] = createSignal<RemoteEntry | null>(null);

  // 模块进入/焦点变化时刷新（设备未就绪时清空）
  createEffect(() => {
    const serial = fileStore.focusSerial();
    void serial;
    void fileStore.refresh();
  });

  const onUpload = async (): Promise<void> => {
    const selected = await open({ multiple: false, title: "选择要上传的文件" });
    if (typeof selected === "string") {
      const name = selected.split(/[\\/]/).pop() ?? "upload.bin";
      void fileStore.push(selected, name);
    }
  };

  const onDownload = async (entry: RemoteEntry): Promise<void> => {
    if (entry.kind !== "file") return;
    const target = await save({ defaultPath: entry.name, title: "保存到" });
    if (typeof target === "string") {
      void fileStore.pull(entry.name, target);
    }
  };

  const onDelete = (entry: RemoteEntry): void => {
    setDeleteTarget(entry);
  };

  const confirmDelete = (): void => {
    const target = deleteTarget();
    if (target) void fileStore.remove(target.name);
    setDeleteTarget(null);
  };

  const mkdir = (): void => {
    const name = newDirName().trim();
    if (!name) return;
    void fileStore.mkdir(name);
    setNewDirName("");
  };

  return (
    <div class="yovo-files">
      <YToolbar>
        <span class="yovo-files__title">文件管理</span>
        <YButton onClick={() => void onUpload()}>上传</YButton>
        <YIconButton icon="refresh" title="刷新" onClick={() => void fileStore.refresh()} />
      </YToolbar>

      <div class="yovo-files__path">
        <YIconButton icon="chevron-right" title="上级目录" onClick={() => void fileStore.goUp()} />
        <span class="yovo-files__path-text">{fileStore.path.value}</span>
        <span class="yovo-files__path-input">
          <YTextField
            placeholder="新目录名"
            value={newDirName()}
            onInput={setNewDirName}
          />
          <YButton variant="secondary" onClick={mkdir}>
            新建目录
          </YButton>
        </span>
      </div>

      <div class="yovo-files__body">
        <div class="yovo-files__list">
          <Show when={fileStore.focusSerial() !== null} fallback={<YEmptyState icon="folder" title="未选择设备" description="请在左侧设备栏选择在线设备" />}>
            <Show when={fileStore.entries.length > 0} fallback={<YEmptyState icon="folder" title="空目录" />}>
              <YVirtualList
                items={() => fileStore.entries}
                itemHeight={30}
                getItemKey={(item) => item.name}
                renderRow={(entry) => (
                  <div
                    class="yovo-files__row"
                    onClick={() => {
                      if (entry.kind === "dir") void fileStore.enterDirectory(entry.name);
                    }}
                  >
                    <span class="yovo-files__row-name">
                      {entry.kind === "dir" ? "📁" : entry.kind === "symlink" ? "🔗" : "📄"} {entry.name}
                    </span>
                    <span class="yovo-files__row-kind">{entry.kind}</span>
                    <span class="yovo-files__row-size">
                      {entry.kind === "file" ? formatSize(entry.size) : ""}
                    </span>
                    <span class="yovo-files__row-actions">
                      <Show when={entry.kind === "file"}>
                        <YIconButton icon="export" title="下载" onClick={() => void onDownload(entry)} />
                      </Show>
                      <YIconButton icon="trash" title="删除" onClick={() => onDelete(entry)} />
                    </span>
                  </div>
                )}
              />
            </Show>
          </Show>
        </div>

        <div class="yovo-files__transfers">
          <div class="yovo-files__transfers-head">传输</div>
          <Show when={fileStore.transfers.length > 0} fallback={<div class="yovo-files__transfers-empty">无进行中的传输</div>}>
            <For each={fileStore.transfers}>
              {(transfer) => (
                <div class="yovo-files__transfer">
                  <div class="yovo-files__transfer-head">
                    <span class="yovo-files__transfer-name">{transfer.name}</span>
                    <YBadge
                      text={transfer.state === "running" ? "传输中" : transfer.state === "done" ? "完成" : transfer.state === "cancelled" ? "已取消" : "失败"}
                      tone={transfer.state === "done" ? "success" : transfer.state === "failed" ? "error" : transfer.state === "running" ? "accent" : "neutral"}
                    />
                    <Show when={transfer.state === "running"}>
                      <YIconButton icon="close" title="取消传输" onClick={() => void fileStore.cancel(transfer.id)} />
                    </Show>
                  </div>
                  <YProgressBar
                    value={transfer.total ? (transfer.bytes / transfer.total) * 100 : undefined}
                    indeterminate={transfer.state === "running" && transfer.total === undefined}
                  />
                  <div class="yovo-files__transfer-meta">
                    {formatSize(transfer.bytes)}
                    {transfer.total ? ` / ${formatSize(transfer.total)}` : ""}
                  </div>
                  <Show when={transfer.message}>
                    <div class="yovo-files__transfer-msg">{transfer.message}</div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>

      <YDialog
        open={() => deleteTarget() !== null}
        title="确认删除"
        width={420}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <YButton variant="ghost" onClick={() => setDeleteTarget(null)}>
              取消
            </YButton>
            <YButton variant="danger" onClick={confirmDelete}>
              删除
            </YButton>
          </>
        }
      >
        <p class="yovo-files__confirm">
          确定删除 <strong>{deleteTarget()?.name}</strong> 吗？
          <br />
          该操作不可恢复（core 侧已做安全根校验）。
        </p>
      </YDialog>
    </div>
  );
}
