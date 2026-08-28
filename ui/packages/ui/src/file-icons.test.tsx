import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoFileIcon } from "./file-icons";
import { fileGlyphFor } from "./file-glyph";

describe("fileGlyphFor", () => {
  it("目录与常见扩展名", () => {
    expect(fileGlyphFor("DCIM", "dir")).toBe("folder");
    expect(fileGlyphFor("app.apk", "file")).toBe("apk");
    expect(fileGlyphFor("a.PNG", "file")).toBe("image");
    expect(fileGlyphFor("v.mp4", "file")).toBe("video");
    expect(fileGlyphFor("pack.zip", "file")).toBe("archive");
    expect(fileGlyphFor("x.xml", "file")).toBe("xml");
    expect(fileGlyphFor("unknown.bin", "file")).toBe("file");
  });
});

describe("YoFileIcon", () => {
  it("同一字形可同时出现多份", () => {
    const { container } = render(() => (
      <>
        <YoFileIcon name="a" kind="dir" />
        <YoFileIcon name="b" kind="dir" />
      </>
    ));
    expect(container.querySelectorAll("svg[data-file-icon=folder]")).toHaveLength(2);
  });
});
