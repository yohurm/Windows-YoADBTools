import { For, Show } from "solid-js";

import { Icon, YoBadge, YoIconButton, YoProgressBar } from "@yovo/ui";

import { formatSize } from "./model";
import { fileStore } from "./store";

export function TransferPanel() {
  return (
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
  );
}
