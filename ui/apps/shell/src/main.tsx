import { render } from "solid-js/web";

// 模块静态组合（shell 是唯一同时依赖 app 与 modules 的组合点；模块间零 import）
import "@yovo/module-terminal";
import "@yovo/module-files";
import "@yovo/module-logs";
import "@yovo/module-mirror";

import { App } from "@yovo/app";
import "@yovo/ui/theme.css";

render(() => <App />, document.getElementById("root")!);
