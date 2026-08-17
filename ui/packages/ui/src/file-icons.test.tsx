import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YFileIcon, fileGlyphFor } from "./file-icons";

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

describe("YFileIcon", () => {
  it("同一字形可同时出现多份", () => {
    const { container } = render(() => (
      <>
        <YFileIcon name="a" kind="dir" />
        <YFileIcon name="b" kind="dir" />
      </>
    ));
    expect(container.querySelectorAll("svg[data-file-icon=folder]")).toHaveLength(2);
  });
});
