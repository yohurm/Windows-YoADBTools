/**
 * 应用壳身份常量（@yohu/workbench 专用）。
 * `APP_ICON_SRC` 是壳资源（UI/标题栏/关于/favicon 共用的应用图标），
 * 属于应用壳而非消费无关的契约门面（@yohu/api），故从 identity.ts 下放到此处。
 * 与 `app/yohu-adbtools/icons/icon.png` 同源。
 */

/** 标题栏 / 关于页 / favicon 共用的应用图标路径。 */
export const APP_ICON_SRC = "/app-icon.png";
