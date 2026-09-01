/**
 * 底部传输进度：有任务时 Presence `rise` 从下方升起；
 * 列表走 YoCollapse `panel`（高度 + 内容淡入上移，禁止再叠一层 collapse）。
 * 箭头挂 yohu-recipe-tree-chevron；终态卡只挂 yohu-recipe-dismiss-fade。
 */
import { For, Show } from "solid-js";

import {
  Icon,
  Layout,
  YoBadge,
  YoCollapse,
  YoIconButton,
  YoPanel,
  YoPresence,
  YoProgressBar,
} from "@yohu/ui";

import { formatSize } from "./model";
import { fileStore, type UiTransfer } from "./store";

function runningCount(): number {
  return fileStore.transfers.filter((transfer) => transfer.state === "running").length;
}

function collapsedSummary(): string {
  const running = fileStore.transfers.find((transfer) => transfer.state === "running");
  return running?.name ?? fileStore.transfers[0]?.name ?? "";
}

function transferTone(transfer: UiTransfer): "success" | "error" | "accent" | "neutral" {
  if (transfer.state === "done") return "success";
  if (transfer.state === "failed") return "error";
  if (transfer.state === "running") return "accent";
  return "neutral";
}

function transferLabel(transfer: UiTransfer): string {
  if (transfer.state === "running") return "传输中";
  if (transfer.state === "done") return "完成";
  if (transfer.state === "cancelled") return "已取消";
  return "失败";
}

export function TransferPanel() {
  const hasTransfers = () => fileStore.transfers.length > 0;
  const listOpen = () => fileStore.ui.transfersOpen;

  return (
    <YoPresence when={hasTransfers()} recipe="rise">
      <YoPanel
        class="yohu-files__transfers"
        padding="none"
        header={
          <button
            type="button"
            class="yohu-files__transfer-bar yohu-interactive yohu-focus-ring"
            aria-expanded={listOpen()}
            aria-controls="yohu-files-transfer-list"
            title={listOpen() ? "收起传输" : "展开传输"}
            onClick={() => fileStore.toggleTransfers()}
          >
            <span
              classList={{
                "yohu-recipe-tree-chevron": true,
                "yohu-recipe-tree-chevron--open": listOpen(),
              }}
            >
              <Icon name="chevron-down" size={Layout.IconInline} />
            </span>
            <span class="yohu-files__transfer-title">传输</span>
            <YoBadge
              text={String(fileStore.transfers.length)}
              tone={runningCount() > 0 ? "accent" : "neutral"}
            />
            <Show when={!listOpen() && collapsedSummary()}>
              <span class="yohu-files__transfer-summary" title={collapsedSummary()}>
                {collapsedSummary()}
              </span>
            </Show>
          </button>
        }
      >
        <YoCollapse open={listOpen()} recipe="panel">
          <div id="yohu-files-transfer-list" class="yohu-files__transfer-list">
            <For each={fileStore.transfers}>
              {(transfer) => (
                <div
                  class="yohu-files__transfer"
                  classList={{
                    "yohu-recipe-dismiss-fade": transfer.state !== "running",
                    "yohu-files__transfer--failed": transfer.state === "failed",
                  }}
                >
                  <span class="yohu-files__transfer-dir" title={transfer.direction === "push" ? "上传" : "下载"}>
                    <Icon name={transfer.direction === "push" ? "arrow-up" : "arrow-down"} size={Layout.IconInline} />
                  </span>
                  <div class="yohu-files__transfer-body">
                    <div class="yohu-files__transfer-head">
                      <span class="yohu-files__transfer-name" title={transfer.name}>
                        {transfer.name}
                      </span>
                      <YoBadge text={transferLabel(transfer)} tone={transferTone(transfer)} />
                      <Show when={transfer.state === "running"}>
                        <YoIconButton
                          icon="close"
                          title="取消传输"
                          onClick={(event) => {
                            event.stopPropagation();
                            void fileStore.cancel(transfer.id);
                          }}
                        />
                      </Show>
                    </div>
                    <YoProgressBar
                      value={transfer.total ? (transfer.bytes / transfer.total) * 100 : undefined}
                      indeterminate={transfer.state === "running" && transfer.total === undefined}
                    />
                    <div class="yohu-files__transfer-meta">
                      {formatSize(transfer.bytes)}
                      {transfer.total ? ` / ${formatSize(transfer.total)}` : ""}
                      <Show when={transfer.speed !== undefined && transfer.state === "running"}>
                        <span class="yohu-files__transfer-speed">· {formatSize(transfer.speed!)}/s</span>
                      </Show>
                    </div>
                    <Show when={transfer.message}>
                      <div class="yohu-files__transfer-msg">{transfer.message}</div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </YoCollapse>
      </YoPanel>
    </YoPresence>
  );
}
