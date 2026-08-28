import { render } from "solid-js/web";

import { App, registerModule } from "@yohu/workbench";
import { descriptor as files } from "@yohu/module-files";
import { descriptor as logs } from "@yohu/module-logs";
import { descriptor as mirror } from "@yohu/module-mirror";
import { descriptor as terminal } from "@yohu/module-terminal";
import "@yohu/ui/theme.css";

// 唯一组合点：shell → workbench + modules。模块不依赖 @yohu/workbench。
registerModule(terminal);
registerModule(files);
registerModule(logs);
registerModule(mirror);

render(() => <App />, document.getElementById("root")!);
