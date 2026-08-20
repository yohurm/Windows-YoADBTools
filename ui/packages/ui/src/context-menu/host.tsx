/**
 * L4 宿主：应用根只挂一份。Portal 到 body，避免祖先 transform 打断 fixed。
 */

import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";

import { YoContextMenu } from "../components/ContextMenu";
import { contextMenu, type ContextMenuController } from "./controller";

export interface YoContextMenuHostProps {
  controller?: ContextMenuController;
}

export function YoContextMenuHost(props: YoContextMenuHostProps): JSX.Element {
  const ctl = (): ContextMenuController => props.controller ?? contextMenu;
  const session = () => ctl().session();

  return (
    <Portal mount={document.body}>
      <YoContextMenu
        open={session() !== null}
        x={session()?.x ?? 0}
        y={session()?.y ?? 0}
        items={[...(session()?.items ?? [])]}
        onClose={() => ctl().close()}
        onSelect={(id) => session()?.select(id)}
      />
    </Portal>
  );
}
