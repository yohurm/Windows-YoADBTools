/**
 * 文件管理主视图（UI设计系统-v6.md §4.3）：
 * 面包屑路径栏（逐级可点）→ 双栏（目录列表 | 文件列表：名称/大小/修改时间）
 * → 传输面板（卡片式：方向图标 + 文件名 + 进度 + 速度 + 取消，终态 3s 淡出）。
 */

import { For, Show, createEffect, createSignal } from "solid-js";

import { open, save } from "@tauri-apps/plugin-dialog";

import {
  Icon,
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

import { fileCategory, fileStore, formatSize, splitPath } from "./store";
import "./files.css";

/** 面包屑（根 + 逐级段）。 */
function Breadcrumb(props: { path: string }) {
  const segments = () => splitPath(props.path);
  return (
    <div class="yovo-files__crumbs">
      <button
        type="button"
        class="yovo-files__crumb yovo-files__crumb--root"
        title="根目录"
        onClick={() => void fileStore.goTo("/")}
      >
        /
      </button>
      <For each={segments()}>
        {(segment, index) => {
          const target = (): string => `/${segments().slice(0, index() + 1).join("/")}`;
          return (
            <>
              <span class="yovo-files__crumb-sep" aria-hidden="true">
                ▸
              </span>
              <button
                type="button"
                class="yovo-files__crumb"
                title={target()}
                onClick={() => void fileStore.goTo(target())}
              >
                {segment}
              </button>
            </>
          );
        }}
      </For>
    </div>
  );
}

export function FileView() {
  const [newDirName, setNewDirName] = createSignal("");
  const [deleteTarget, setDeleteTarget] = createSignal<RemoteEntry | null>(null);

  // 模块进入/焦点变化时刷新（设备未就绪时清空）
  createEffect(() => {
    const serial = fileStore.focusSerial();
    void serial;
    void fileStore.refresh();
  });

  const dirs = (): RemoteEntry[] =>
    fileStore.entries.filter((e) => e.kind === "dir" || e.kind === "symlink");
  const files = (): RemoteEntry[] =>
    fileStore.entries.filter((e) => e.kind === "file" || e.kind === "other");

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
        <Breadcrumb path={fileStore.path.value} />
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
        <Show
          when={fileStore.focusSerial() !== null}
          fallback={<YEmptyState icon="folder" title="未选择设备" description="请在左侧设备栏选择在线设备" />}
        >
          <div class="yovo-files__panes">
            <section class="yovo-files__pane">
              <div class="yovo-files__pane-head">目录</div>
              <div class="yovo-files__pane-list">
                <Show
                  when={dirs().length > 0}
                  fallback={<div class="yovo-files__pane-empty">无子目录</div>}
                >
                  <YVirtualList<RemoteEntry>
                    items={dirs}
                    itemHeight={26}
                    getItemKey={(entry) => entry.name}
                    renderRow={(entry) => (
                      <div
                        class="yovo-files__dir-row"
                        onClick={() => void fileStore.enterDirectory(entry.name)}
                      >
                        <Icon name="folder" size={14} />
                        <span class="yovo-files__dir-name" title={entry.name}>
                          {entry.name}
                        </span>
                        <Show when={entry.kind === "symlink"}>
                          <span class="yovo-files__dir-link">链接</span>
                        </Show>
                      </div>
                    )}
                  />
                </Show>
              </div>
            </section>

            <section class="yovo-files__pane yovo-files__pane--files">
              <div class="yovo-files__pane-head">文件</div>
              <div class="yovo-files__pane-list">
                <Show
                  when={files().length > 0}
                  fallback={<div class="yovo-files__pane-empty">无文件</div>}
                >
                  <YVirtualList<RemoteEntry>
                    items={files}
                    itemHeight={26}
                    getItemKey={(entry) => entry.name}
                    renderRow={(entry) => (
                      <div class="yovo-files__row">
                        <span
                          class={`yovo-files__icon yovo-files__icon--${fileCategory(entry.name)}`}
                          aria-hidden="true"
                        />
                        <span class="yovo-files__row-name" title={entry.name}>
                          {entry.name}
                        </span>
                        <span class="yovo-files__row-size">{formatSize(entry.size)}</span>
                        <span class="yovo-files__row-mtime">{entry.mtime ?? ""}</span>
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
              </div>
            </section>
          </div>
        </Show>

        <div class="yovo-files__transfers">
          <div class="yovo-files__transfers-head">传输</div>
          <Show when={fileStore.transfers.length > 0} fallback={<div class="yovo-files__transfers-empty">无进行中的传输</div>}>
            <For each={fileStore.transfers}>
              {(transfer) => (
                <div
                  class="yovo-files__transfer"
                  classList={{
                    "yovo-files__transfer--terminal": transfer.state !== "running",
                    "yovo-files__transfer--failed": transfer.state === "failed",
                  }}
                >
                  <span class="yovo-files__transfer-dir" title={transfer.direction === "push" ? "上传" : "下载"}>
                    <Icon name={transfer.direction === "push" ? "arrow-up" : "arrow-down"} size={14} />
                  </span>
                  <div class="yovo-files__transfer-body">
                    <div class="yovo-files__transfer-head">
                      <span class="yovo-files__transfer-name" title={transfer.name}>
                        {transfer.name}
                      </span>
                      <YBadge
                        text={
                          transfer.state === "running"
                            ? "传输中"
                            : transfer.state === "done"
                              ? "完成"
                              : transfer.state === "cancelled"
                                ? "已取消"
                                : "失败"
                        }
                        tone={
                          transfer.state === "done"
                            ? "success"
                            : transfer.state === "failed"
                              ? "error"
                              : transfer.state === "running"
                                ? "accent"
                                : "neutral"
                        }
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
                      <Show when={transfer.speed !== undefined && transfer.state === "running"}>
                        <span class="yovo-files__transfer-speed">· {formatSize(transfer.speed!)}/s</span>
                      </Show>
                    </div>
                    <Show when={transfer.message}>
                      <div class="yovo-files__transfer-msg">{transfer.message}</div>
                    </Show>
                  </div>
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
