/**
 * 文件管理（UI设计系统-v6.md §4.3）：
 * 资源管理器式四列清单 + 可收起预览 + 右键（新建文件/目录/删除）+ 多选。
 */

import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { open, save } from "@tauri-apps/plugin-dialog";

import {
  Icon,
  YBadge,
  YButton,
  YContextMenu,
  YDialog,
  YEmptyState,
  YFileIcon,
  YIconButton,
  YProgressBar,
  YColResizer,
  YTextField,
  YToolbar,
  YVirtualList,
  type YMenuItem,
} from "@yovo/ui";
import type { RemoteEntry } from "@yovo/api";

import { fileStore, fileTypeLabel, formatSize, splitPath } from "./store";
import "./files.css";

function Breadcrumb(props: { path: string }) {
  const segments = () => splitPath(props.path);
  return (
    <div class="yovo-files__crumbs">
      <button type="button" class="yovo-files__crumb yovo-files__crumb--root" title="根目录" onClick={() => void fileStore.goTo("/")}>
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
              <button type="button" class="yovo-files__crumb" title={target()} onClick={() => void fileStore.goTo(target())}>
                {segment}
              </button>
            </>
          );
        }}
      </For>
    </div>
  );
}

type CreateKind = "file" | "dir";

const COL_MIN = [96, 56, 64, 96];
const COL_DEFAULT = [168, 72, 80, 128];

export function FileView() {
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [pivot, setPivot] = createSignal<string | null>(null);
  const [previewOpen, setPreviewOpen] = createSignal(false);
  const [menu, setMenu] = createSignal<{ x: number; y: number } | null>(null);
  const [deleteNames, setDeleteNames] = createSignal<string[]>([]);
  const [createKind, setCreateKind] = createSignal<CreateKind | null>(null);
  const [createName, setCreateName] = createSignal("");
  const [colWidths, setColWidths] = createSignal<number[]>([...COL_DEFAULT]);

  createEffect(() => {
    const serial = fileStore.focusSerial();
    void serial;
    void fileStore.refresh();
    setSelected(new Set<string>());
    setPivot(null);
  });

  const entries = (): RemoteEntry[] => fileStore.entries;

  const selectedEntries = createMemo(() => entries().filter((e) => selected().has(e.name)));

  const previewEntry = createMemo(() => {
    const list = selectedEntries();
    return list.length === 1 ? list[0] : undefined;
  });

  const applySelect = (entry: RemoteEntry, event?: MouseEvent | KeyboardEvent): void => {
    const key = entry.name;
    const list = entries();
    if (event && "shiftKey" in event && event.shiftKey && pivot()) {
      const from = list.findIndex((e) => e.name === pivot());
      const to = list.findIndex((e) => e.name === key);
      if (from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        setSelected(new Set(list.slice(a, b + 1).map((e) => e.name)));
        return;
      }
    }
    if (event && "ctrlKey" in event && (event.ctrlKey || event.metaKey)) {
      const next = new Set(selected());
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setSelected(next);
      setPivot(key);
      return;
    }
    setSelected(new Set([key]));
    setPivot(key);
  };

  const openEntry = (entry: RemoteEntry): void => {
    if (entry.kind === "dir" || entry.kind === "symlink") void fileStore.enterDirectory(entry.name);
  };

  const onUpload = async (): Promise<void> => {
    const selectedPath = await open({ multiple: false, title: "选择要上传的文件" });
    if (typeof selectedPath === "string") {
      const name = selectedPath.split(/[\\/]/).pop() ?? "upload.bin";
      void fileStore.push(selectedPath, name);
    }
  };

  const askDelete = (names: string[]): void => {
    if (names.length === 0) return;
    setDeleteNames(names);
    setMenu(null);
  };

  const confirmDelete = (): void => {
    const names = deleteNames();
    setDeleteNames([]);
    void fileStore.removeMany(names).then(() => setSelected(new Set<string>()));
  };

  const openCreate = (kind: CreateKind): void => {
    setCreateKind(kind);
    setCreateName(kind === "dir" ? "新建文件夹" : "新建文件.txt");
    setMenu(null);
  };

  const confirmCreate = (): void => {
    const name = createName().trim();
    const kind = createKind();
    setCreateKind(null);
    if (!name || !kind) return;
    if (kind === "dir") void fileStore.mkdir(name);
    else void fileStore.createFile(name);
  };

  const menuItems = (): YMenuItem[] => [
    { id: "new-file", label: "新建文件" },
    { id: "new-dir", label: "新建目录" },
    { id: "delete", label: "删除", danger: true, disabled: selected().size === 0 },
  ];

  const colTemplate = (): string => {
    const w = colWidths();
    return `${w[0]}px ${w[1]}px ${w[2]}px minmax(${w[3]}px, 1fr)`;
  };

  const resizeCol = (index: number, delta: number): void => {
    setColWidths((prev) => {
      const next = [...prev];
      next[index] = Math.max(COL_MIN[index] ?? 48, (next[index] ?? 80) + delta);
      return next;
    });
  };

  const colStyle = (): { "grid-template-columns": string } => ({
    "grid-template-columns": colTemplate(),
  });

  return (
    <div class="yovo-files">
      <YToolbar>
        <span class="yovo-module-title">文件管理</span>
        <YButton onClick={() => void onUpload()}>上传</YButton>
        <YIconButton
          icon="refresh"
          title="刷新"
          loading={fileStore.loading.value}
          onClick={() => void fileStore.refresh()}
        />
        <YButton variant="ghost" onClick={() => setPreviewOpen((v) => !v)}>
          {previewOpen() ? "收起预览" : "预览"}
        </YButton>
      </YToolbar>

      <div class="yovo-files__path">
        <YIconButton icon="chevron-up" title="上级目录" onClick={() => void fileStore.goUp()} />
        <Breadcrumb path={fileStore.path.value} />
      </div>

      <div class="yovo-files__body">
        <Show
          when={fileStore.focusSerial() !== null}
          fallback={<YEmptyState icon="folder" title="未选择设备" description="请在左侧设备栏选择在线设备" />}
        >
          <div class="yovo-files__explorer">
            <section class="yovo-files__table">
              <div class="yovo-files__cols yovo-files__cols--head" style={colStyle()}>
                <span>
                  名称
                  <YColResizer label="调节名称列宽" onResize={(dx) => resizeCol(0, dx)} />
                </span>
                <span>
                  类型
                  <YColResizer label="调节类型列宽" onResize={(dx) => resizeCol(1, dx)} />
                </span>
                <span>
                  大小
                  <YColResizer label="调节大小列宽" onResize={(dx) => resizeCol(2, dx)} />
                </span>
                <span>修改时间</span>
              </div>
              <div
                class="yovo-files__table-list"
                onContextMenu={(event) => {
                  if ((event.target as HTMLElement).closest(".yovo-virtual-list__row")) return;
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY });
                }}
              >
                <Show when={entries().length > 0} fallback={<YEmptyState icon="folder" title="此文件夹为空" />}>
                  <YVirtualList<RemoteEntry>
                    items={entries}
                    itemHeight={28}
                    getItemKey={(entry) => entry.name}
                    ariaLabel="文件列表"
                    selectedKeys={selected}
                    onSelectRow={(entry, _key, event) => applySelect(entry, event)}
                    onRowContextMenu={(entry, _key, event) => {
                      if (!selected().has(entry.name)) {
                        setSelected(new Set([entry.name]));
                        setPivot(entry.name);
                      }
                      setMenu({ x: event.clientX, y: event.clientY });
                    }}
                    renderRow={(entry) => (
                      <div
                        class="yovo-files__cols yovo-files__row"
                        style={colStyle()}
                        onDblClick={() => openEntry(entry)}
                      >
                        <span class="yovo-files__name">
                          <YFileIcon name={entry.name} kind={entry.kind} size={16} />
                          <span title={entry.name}>{entry.name}</span>
                        </span>
                        <span>{fileTypeLabel(entry)}</span>
                        <span class="yovo-files__num">{entry.kind === "file" ? formatSize(entry.size) : ""}</span>
                        <span class="yovo-files__num">{entry.mtime ?? ""}</span>
                      </div>
                    )}
                  />
                </Show>
              </div>
            </section>
            <aside class="yovo-files__preview" classList={{ "yovo-files__preview--open": previewOpen() }}>
              <div class="yovo-files__preview-head">预览</div>
              <Show
                when={previewEntry()}
                fallback={<div class="yovo-files__preview-empty">选择一个项目以预览</div>}
              >
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
          </div>
        </Show>

        <Show when={fileStore.transfers.length > 0}>
          <div class="yovo-files__transfers">
            <div class="yovo-files__transfers-head">传输</div>
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
          </div>
        </Show>
      </div>

      <YContextMenu
        open={menu() !== null}
        x={menu()?.x ?? 0}
        y={menu()?.y ?? 0}
        items={menuItems()}
        onClose={() => setMenu(null)}
        onSelect={(id) => {
          if (id === "new-file") openCreate("file");
          else if (id === "new-dir") openCreate("dir");
          else if (id === "delete") askDelete([...selected()]);
        }}
      />

      <YDialog
        open={() => deleteNames().length > 0}
        title="确认删除"
        width={420}
        onClose={() => setDeleteNames([])}
        footer={
          <>
            <YButton variant="ghost" onClick={() => setDeleteNames([])}>
              取消
            </YButton>
            <YButton variant="danger" onClick={confirmDelete}>
              删除
            </YButton>
          </>
        }
      >
        <p class="yovo-files__confirm">
          确定删除 <strong>{deleteNames().join("、")}</strong> 吗？该操作不可恢复。
        </p>
      </YDialog>

      <YDialog
        open={() => createKind() !== null}
        title={createKind() === "dir" ? "新建目录" : "新建文件"}
        width={420}
        onClose={() => setCreateKind(null)}
        footer={
          <>
            <YButton variant="ghost" onClick={() => setCreateKind(null)}>
              取消
            </YButton>
            <YButton onClick={confirmCreate}>创建</YButton>
          </>
        }
      >
        <YTextField
          label="名称"
          value={createName()}
          onInput={setCreateName}
          ariaLabel={createKind() === "dir" ? "新目录名" : "新文件名"}
        />
      </YDialog>
    </div>
  );
}
