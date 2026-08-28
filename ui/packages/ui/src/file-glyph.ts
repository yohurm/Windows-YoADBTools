/**
 * 文件→字形分类的纯函数（无 JSX/无组件；与 SVG 渲染分离，见 `file-icons.tsx`）。
 *
 * 归属边界：本文件只做「字形映射」——按 `RemoteEntry.kind` + 扩展名选出一个图标字形
 * （文件/图像/视频/音频/压缩包/xml/json/文本/pdf/apk）。它是**展示性图标分组**，
 * 不是业务类型分类。@yohu/ui 作为组件库零 IPC，不依赖 @yohu/api 与任何模块。
 *
 * 业务文件类型分类（apk / media / doc / archive / other）的唯一来源是
 * `@yohu/modules/files` 的 `fileCategory`（model.ts）。两者粒度不同（图标字形
 * 分组 vs 业务类型分组）且依赖方向相反（组件库不得依赖模块，模块业务分类也不该
 * 依赖组件库图标集），故**不共享扩展名表** —— 这不是双源缺陷，而是两个不同轴。
 * 改动扩展名时请分别维护，勿让「业务分类」依赖本文件的图标分组。
 */

/** 与 wire RemoteEntry.kind 对齐，但不依赖 @yohu/api（组件库零 IPC）。 */
export type FileIconKind = "dir" | "file" | "symlink" | "other";

export type FileGlyph =
  | "folder"
  | "file"
  | "apk"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "xml"
  | "json"
  | "text"
  | "pdf";

/** 展示性图标分组（仅用于选字形，与业务分类 media/doc 不同轴）。 */
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"]);
const VIDEO_EXT = new Set(["mp4", "mkv", "avi", "webm", "mov"]);
const AUDIO_EXT = new Set(["mp3", "flac", "ogg", "wav", "m4a", "aac"]);
const ARCHIVE_EXT = new Set(["zip", "rar", "7z", "tar", "gz", "tgz"]);
const TEXT_EXT = new Set(["txt", "md", "log", "csv", "ini", "conf"]);

/** 由文件名/条目类型解析字形。 */
export function fileGlyphFor(name: string, kind: FileIconKind): FileGlyph {
  if (kind === "dir" || kind === "symlink") return "folder";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "apk" || ext === "aab") return "apk";
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (ext === "xml") return "xml";
  if (ext === "json") return "json";
  if (ext === "pdf") return "pdf";
  if (TEXT_EXT.has(ext)) return "text";
  return "file";
}
