/**
 * 文件管理 View：绑定壳注入的 DeviceSession，对话框与本机选路留在视图层。
 */

import { For, Show, createEffect, createSignal } from "solid-js";

import { open, save } from "@tauri-apps/plugin-dialog";
import type { DeviceSession } from "@yovo/api";
import { YButton, YContextMenu, YDialog, YEmptyState, YIconButton, YTextField, YToolbar, type YMenuItem } from "@yovo/ui";

import { FileTable } from "./FileTable";
import { PreviewPane } from "./PreviewPane";
import { TransferPanel } from "./TransferPanel";
import { splitPath, parentWithinSafety, validateEntryName } from "./model";
import { fileStore } from "./store";
import "./files.css";

function Breadcrumb() {
  const segments = () => splitPath(fileStore.session.path);
  return (
    <div class="yovo-files__crumbs">
      <For each={segments()}>
        {(segment, index) => {
          const target = (): string => `/${segments().slice(0, index() + 1).join("/")}`;
          return (
            <>
              <Show when={index() > 0}>
                <span class="yovo-files__crumb-sep" aria-hidden="true">
                  ▸
                </span>
              </Show>
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

export function FileView(props: DeviceSession) {
  const [menu, setMenu] = createSignal<{ x: number; y: number } | null>(null);
  const [deleteNames, setDeleteNames] = createSignal<string[]>([]);
  const [createKind, setCreateKind] = createSignal<CreateKind | null>(null);
  const [createName, setCreateName] = createSignal("");
  const [createError, setCreateError] = createSignal("");

  createEffect(() => {
    fileStore.bindSerial(props.focusSerial);
  });

  const onUpload = async (): Promise<void> => {
    const selectedPath = await open({ multiple: false, title: "选择要上传的文件" });
    if (typeof selectedPath === "string") {
      const name = selectedPath.split(/[\\/]/).pop() ?? "upload.bin";
      void fileStore.push(selectedPath, name);
    }
  };

  const onDownload = async (): Promise<void> => {
    const file = fileStore.singleFile();
    if (!file) return;
    const dest = await save({ defaultPath: file.name, title: "保存到本机" });
    if (typeof dest === "string") void fileStore.pull(file.name, dest);
  };

  const askDelete = (names: string[]): void => {
    if (names.length === 0) return;
    setDeleteNames(names);
    setMenu(null);
  };

  const confirmDelete = (): void => {
    const names = deleteNames();
    setDeleteNames([]);
    void fileStore.removeMany(names);
  };

  const openCreate = (kind: CreateKind): void => {
    setCreateKind(kind);
    setCreateName(kind === "dir" ? "新建文件夹" : "新建文件.txt");
    setCreateError("");
    setMenu(null);
  };

  const confirmCreate = (): void => {
    const name = createName().trim();
    const kind = createKind();
    const invalid = validateEntryName(name);
    if (invalid) {
      setCreateError(invalid);
      return;
    }
    setCreateKind(null);
    if (!kind) return;
    if (kind === "dir") void fileStore.mkdir(name);
    else void fileStore.createFile(name);
  };

  const menuItems = (): YMenuItem[] => [
    { id: "new-file", label: "新建文件" },
    { id: "new-dir", label: "新建目录" },
    { id: "download", label: "下载", disabled: fileStore.singleFile() === undefined },
    { id: "delete", label: "删除", danger: true, disabled: fileStore.selection.names.length === 0 },
  ];

  return (
    <div class="yovo-files">
      <YToolbar>
        <span class="yovo-module-title">文件管理</span>
        <YButton onClick={() => void onUpload()}>上传</YButton>
        <YButton variant="secondary" disabled={fileStore.singleFile() === undefined} onClick={() => void onDownload()}>
          下载
        </YButton>
        <YIconButton
          icon="refresh"
          title="刷新"
          loading={fileStore.session.loading}
          onClick={() => void fileStore.refresh()}
        />
        <YButton variant="ghost" onClick={() => fileStore.togglePreview()}>
          {fileStore.ui.previewOpen ? "收起预览" : "预览"}
        </YButton>
      </YToolbar>

      <Show when={fileStore.session.error}>
        <div class="yovo-files__error" role="alert">
          {fileStore.session.error}
        </div>
      </Show>

      <div class="yovo-files__path">
        <YIconButton
          icon="chevron-up"
          title="上级目录"
          disabled={parentWithinSafety(fileStore.session.path) === null}
          onClick={() => void fileStore.goUp()}
        />
        <Breadcrumb />
      </div>

      <div class="yovo-files__body">
        <Show
          when={props.focusSerial !== null}
          fallback={<YEmptyState icon="folder" title="未选择设备" description="请在左侧设备栏选择在线设备" />}
        >
          <div class="yovo-files__explorer">
            <FileTable onContextMenu={(x, y) => setMenu({ x, y })} />
            <PreviewPane />
          </div>
        </Show>
        <TransferPanel />
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
          else if (id === "download") void onDownload();
          else if (id === "delete") askDelete([...fileStore.selection.names]);
          setMenu(null);
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
            <YButton onClick={confirmCreate} disabled={fileStore.session.mutating}>
              创建
            </YButton>
          </>
        }
      >
        <YTextField
          label="名称"
          value={createName()}
          onInput={(v) => {
            setCreateName(v);
            setCreateError(validateEntryName(v) ?? "");
          }}
          ariaLabel={createKind() === "dir" ? "新目录名" : "新文件名"}
        />
        <Show when={createError()}>
          <div class="yovo-files__error">{createError()}</div>
        </Show>
      </YDialog>
    </div>
  );
}
