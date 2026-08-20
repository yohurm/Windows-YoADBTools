import { For, Show } from "solid-js";

import { Icon, YoBadge, YoIconButton, YoPanel, YoProgressBar } from "@yohu/ui";

import { formatSize } from "./model";
import { fileStore } from "./store";

export function TransferPanel() {
  return (
    <Show when={fileStore.transfers.length > 0}>
      <YoPanel title="传输" padding="sm">
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
                <Icon name={transfer.direction === "push" ? "arrow-up" : "arrow-down"} size={14} />
              </span>
              <div class="yohu-files__transfer-body">
                <div class="yohu-files__transfer-head">
                  <span class="yohu-files__transfer-name" title={transfer.name}>
                    {transfer.name}
                  </span>
                  <YoBadge
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
                    <YoIconButton icon="close" title="取消传输" onClick={() => void fileStore.cancel(transfer.id)} />
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
      </YoPanel>
    </Show>
  );
}
