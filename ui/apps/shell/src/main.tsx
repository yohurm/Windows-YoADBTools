import { render } from "solid-js/web";

// 模块静态组合（shell 是唯一同时依赖 app 与 modules 的组合点；模块间零 import）
import "@yohu/module-terminal";
import "@yohu/module-files";
import "@yohu/module-logs";
import "@yohu/module-mirror";

import { App } from "@yohu/app";
import "@yohu/ui/theme.css";

render(() => <App />, document.getElementById("root")!);
