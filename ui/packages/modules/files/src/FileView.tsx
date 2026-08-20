/**
 * 文件管理 View：绑定壳注入的 DeviceSession，对话框与本机选路留在视图层。
 */

import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";

import { open, save } from "@tauri-apps/plugin-dialog";
import { onNativeDragDrop, type DeviceSession } from "@yohu/api";
import {
  YoButton,
  YoChrome,
  YoDialog,
  YoEmptyState,
  YoIconButton,
  YoPage,
  YoPanel,
  YoTextField,
  attachPanelKeys,
  closeContextMenu,
  openContextMenu,
} from "@yohu/ui";

import { FileTable } from "./FileTable";
import { PreviewPane } from "./PreviewPane";
import { TransferPanel } from "./TransferPanel";
import { type DropHit, resolveDropHit } from "./drop";
import { copyRemotePaths, FILES_KEY_BINDINGS, FILES_LIST_SELECTOR, type FilesKeyAction } from "./keys";
import { filesListMenu } from "./menu";
import { childPath, splitPath, parentWithinSafety, validateEntryName, errorText } from "./model";
import { fileStore } from "./store";
import "./files.css";

function Breadcrumb() {
  const segments = () => splitPath(fileStore.session.path);
  return (
    <div class="yohu-files__crumbs">
      <For each={segments()}>
        {(segment, index) => {
          const target = (): string => `/${segments().slice(0, index() + 1).join("/")}`;
          return (
            <>
              <Show when={index() > 0}>
                <span class="yohu-files__crumb-sep" aria-hidden="true">
                  ▸
                </span>
              </Show>
              <button
                type="button"
                class="yohu-files__crumb yohu-interactive yohu-focus-ring"
                classList={{ "yohu-files__crumb--current": index() === segments().length - 1 }}
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

type CreateKind = "file" | "dir";

export function FileView(props: DeviceSession) {
  const [deleteNames, setDeleteNames] = createSignal<string[]>([]);
  const [createKind, setCreateKind] = createSignal<CreateKind | null>(null);
  const [createName, setCreateName] = createSignal("");
  const [createError, setCreateError] = createSignal("");
  const [dropHit, setDropHit] = createSignal<DropHit>({ accept: false });

  let pageEl: HTMLDivElement | undefined;

  createEffect(() => {
    fileStore.bindSerial(props.selectedSerials[0] ?? null);
  });

  const dropCurrent = (): boolean => {
    const hit = dropHit();
    return hit.accept && hit.dirName === null;
  };

  const dropDirName = (): string | null | undefined => {
    const hit = dropHit();
    return hit.accept ? hit.dirName : undefined;
  };

  const applyDropHit = (x: number, y: number): DropHit => {
    if (!props.selectedSerials[0] || !pageEl) return { accept: false };
    return resolveDropHit(document.elementFromPoint(x, y), pageEl);
  };

  const onNativeDrop = (paths: string[], hit: DropHit): void => {
    if (!hit.accept || paths.length === 0) return;
    try {
      const dest = hit.dirName ? childPath(fileStore.session.path, hit.dirName) : fileStore.session.path;
      void fileStore.pushLocals(paths, dest);
    } catch (e) {
      fileStore.notifyError(errorText(e));
    }
  };

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
    closeContextMenu();
    setDeleteNames(names);
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
    closeContextMenu();
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

  const copySelected = (): void => {
    const names = fileStore.selection.names;
    if (names.length === 0) return;
    const text = copyRemotePaths(fileStore.session.path, names);
    void navigator.clipboard.writeText(text).catch((e) => fileStore.notifyError(errorText(e)));
  };

  const openSelected = (event: KeyboardEvent): void => {
    const names = fileStore.selection.names;
    const focused =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-key]")?.dataset.key : undefined;
    const name = names.length === 1 ? names[0] : names.length === 0 ? focused : undefined;
    if (!name) return;
    const entry = fileStore.entries.find((item) => item.name === name);
    if (entry && (entry.kind === "dir" || entry.kind === "symlink")) {
      void fileStore.enterDirectory(name);
    }
  };

  const onKeyAction = (action: FilesKeyAction, event: KeyboardEvent): void => {
    if (action === "select-all") {
      fileStore.selectAll();
      return;
    }
    if (action === "copy") {
      copySelected();
      return;
    }
    if (action === "delete") {
      askDelete([...fileStore.selection.names]);
      return;
    }
    if (action === "refresh") {
      void fileStore.refresh();
      return;
    }
    if (action === "go-up") {
      void fileStore.goUp();
      return;
    }
    if (action === "open") openSelected(event);
  };

  onMount(() => {
    if (!pageEl) return;
    const stopKeys = attachPanelKeys(pageEl, {
      listSelector: FILES_LIST_SELECTOR,
      bindings: FILES_KEY_BINDINGS,
      onAction: onKeyAction,
    });
    let stopDrag: (() => void) | undefined;
    let cancelled = false;
    void Promise.resolve(onNativeDragDrop((event) => {
      if (event.type === "leave") {
        setDropHit({ accept: false });
        return;
      }
      const hit = applyDropHit(event.x, event.y);
      if (event.type === "drop") {
        setDropHit({ accept: false });
        onNativeDrop(event.paths, hit);
        return;
      }
      setDropHit(hit);
    })).then((unlisten) => {
      if (typeof unlisten !== "function") return;
      if (cancelled) unlisten();
      else stopDrag = unlisten;
    });
    onCleanup(() => {
      cancelled = true;
      stopKeys();
      stopDrag?.();
      closeContextMenu();
    });
  });

  const openListMenu = (x: number, y: number): void => {
    const selected = fileStore.selection.names.length > 0;
    openContextMenu(filesListMenu, {
      x,
      y,
      ctx: {
        canDownload: fileStore.singleFile() !== undefined,
        canDelete: selected,
        canCopy: selected,
        newFile: () => openCreate("file"),
        newDir: () => openCreate("dir"),
        download: () => void onDownload(),
        copy: copySelected,
        remove: () => askDelete([...fileStore.selection.names]),
      },
    });
  };

  return (
    <YoPage class="yohu-files" ref={(el) => { pageEl = el; }}>
      <div data-drop="ignore">
        <YoChrome title="文件管理">
          <YoButton onClick={() => void onUpload()}>上传</YoButton>
          <YoButton variant="secondary" disabled={fileStore.singleFile() === undefined} onClick={() => void onDownload()}>
            下载
          </YoButton>
          <YoIconButton
            icon="refresh"
            title="刷新"
            loading={fileStore.session.loading}
            onClick={() => void fileStore.refresh()}
          />
          <YoButton
            variant="ghost"
            aria-expanded={fileStore.ui.previewOpen}
            onClick={() => fileStore.togglePreview()}
          >
            {fileStore.ui.previewOpen ? "收起预览" : "预览"}
          </YoButton>
        </YoChrome>
      </div>

      <Show when={fileStore.session.error}>
        <div class="yohu-files__error" role="alert">
          {fileStore.session.error}
        </div>
      </Show>

      <div
        class="yohu-files__stage yohu-recipe-rail"
        classList={{ "yohu-files__stage--preview-collapsed": !fileStore.ui.previewOpen }}
      >
        <div
          class="yohu-files__explorer"
          classList={{ "yohu-files__explorer--drop": dropCurrent() }}
          data-drop="files"
        >
          <YoPanel
            variant="pane"
            header={
              <div class="yohu-files__path">
                <YoIconButton
                  icon="chevron-up"
                  title="上级目录"
                  disabled={parentWithinSafety(fileStore.session.path) === null}
                  onClick={() => void fileStore.goUp()}
                />
                <Breadcrumb />
              </div>
            }
          >
            <Show
              when={props.selectedSerials[0]}
              fallback={<YoEmptyState icon="folder" title="未选择设备" description="请在左侧设备栏选择在线设备" />}
            >
              <FileTable dropDirName={dropDirName()} onContextMenu={openListMenu} />
            </Show>
          </YoPanel>
        </div>
        <div class="yohu-files__preview-slot" data-drop="ignore" attr:inert={!fileStore.ui.previewOpen ? true : undefined}>
          <PreviewPane />
        </div>
      </div>
      <div data-drop="ignore">
        <TransferPanel />
      </div>

      <div data-drop="ignore">
        <YoDialog
          open={() => deleteNames().length > 0}
          title="确认删除"
          onClose={() => setDeleteNames([])}
          footer={
            <>
              <YoButton variant="ghost" onClick={() => setDeleteNames([])}>
                取消
              </YoButton>
              <YoButton variant="danger" onClick={confirmDelete}>
                删除
              </YoButton>
            </>
          }
        >
          <p class="yohu-files__confirm">
            确定删除 <strong>{deleteNames().join("、")}</strong> 吗？该操作不可恢复。
          </p>
        </YoDialog>

        <YoDialog
          open={() => createKind() !== null}
          title={createKind() === "dir" ? "新建目录" : "新建文件"}
          onClose={() => setCreateKind(null)}
          footer={
            <>
              <YoButton variant="ghost" onClick={() => setCreateKind(null)}>
                取消
              </YoButton>
              <YoButton onClick={confirmCreate} disabled={fileStore.session.mutating}>
                创建
              </YoButton>
            </>
          }
        >
          <YoTextField
            label="名称"
            value={createName()}
            onInput={(v) => {
              setCreateName(v);
              setCreateError(validateEntryName(v) ?? "");
            }}
            ariaLabel={createKind() === "dir" ? "新目录名" : "新文件名"}
          />
          <Show when={createError()}>
            <div class="yohu-files__error">{createError()}</div>
          </Show>
        </YoDialog>
      </div>
    </YoPage>
  );
}
