/**
 * `YoFileIcon` 组件：SVG 渲染层（字形分组见 `./file-glyph`）。
 * HarmonyOS 对照：无系统文件图标控件；模块只消费 YoFileIcon。
 * 受控 API：kind / name / size。
 */
import type { JSX } from "solid-js";
import "./file-icons.css";
import { fileGlyphFor, type FileGlyph, type FileIconKind } from "./file-glyph";

const GLYPHS: Record<FileGlyph, () => JSX.Element> = {
  folder: () => (
    <>
      <path fill="#90CAF9" d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path fill="#42A5F5" d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
    </>
  ),
  file: () => (
    <>
      <path fill="#90A4AE" d="M6 3h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path fill="#CFD8DC" d="M14 3v6h6" />
    </>
  ),
  apk: () => (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#7CB342" />
      <path fill="#F1F8E9" d="M8 10c0-2.2 1.8-4 4-4s4 1.8 4 4v5H8v-5zm2.2-1.2a.8.8 0 1 0-1.1-1.1.8.8 0 0 0 1.1 1.1zm5.7 0a.8.8 0 1 0-1.1-1.1.8.8 0 0 0 1.1 1.1z" />
    </>
  ),
  image: () => (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" fill="#26A69A" />
      <circle cx="9" cy="10" r="2" fill="#E0F2F1" />
      <path fill="#B2DFDB" d="M7 17l4-5 3 4 2-2 4 3H7z" />
    </>
  ),
  video: () => (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" fill="#5C6BC0" />
      <path fill="#E8EAF6" d="M10 9l6 3-6 3V9z" />
    </>
  ),
  audio: () => (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#AB47BC" />
      <path fill="#F3E5F5" d="M10 8v8a3 3 0 1 0 1.5 2.6V11h4V8h-5.5z" />
    </>
  ),
  archive: () => (
    <>
      <path fill="#FFA726" d="M6 4h12v16H6z" />
      <path fill="#FFF3E0" d="M10 4h4v3h-4zm0 5h4v3h-4zm0 5h4v3h-4z" />
    </>
  ),
  xml: () => (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#FF7043" />
      <path fill="#FBE9E7" d="M8 8l-2 4 2 4h1.5L8 12l1.5-4H8zm8 0h-1.5L16 12l-1.5 4H16l2-4-2-4z" />
    </>
  ),
  json: () => (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#FFCA28" />
      <path fill="#5D4037" d="M9 8c-1.5 0-2 1-2 2v1c0 .5-.5 1-1 1s1 .5 1 1v1c0 1 .5 2 2 2v-1.2c-.5 0-.8-.3-.8-.8v-1.2c0-1 .8-1.3.8-2.2S8.7 9.2 8.2 9.2V8H9zm6 0v1.2c.5 0 .8.3.8.8v1.2c0 1-.8 1.3-.8 2.2s.8 1.2.8 1.2.8.3.8.8v1.2c0 1-.5 2-2 2v-1.2c.5 0 .8-.3.8-.8v-1.2c0-1 .8-1.3.8-2.2s-.8-1.2-.8-1.2-.8-.3-.8-.8V9.2c0-.5.3-.8.8-.8V8h.6z" />
    </>
  ),
  text: () => (
    <>
      <path fill="#78909C" d="M6 3h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path fill="#ECEFF1" d="M8 12h8v1.5H8zm0 3h6v1.5H8z" />
    </>
  ),
  pdf: () => (
    <>
      <path fill="#E53935" d="M6 3h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path fill="#FFEBEE" d="M8 13h8v1.6H8zm0 3h5v1.6H8z" />
    </>
  ),
};

export interface YoFileIconProps {
  name: string;
  kind: FileIconKind;
  size?: number;
}

export function YoFileIcon(props: YoFileIconProps): JSX.Element {
  const glyph = () => fileGlyphFor(props.name, props.kind);
  const size = () => props.size ?? 16;
  return (
    <svg
      class="yohu-file-icon"
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-file-icon={glyph()}
    >
      {GLYPHS[glyph()]()}
    </svg>
  );
}
