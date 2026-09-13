import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  composeFinalText,
  isAllowedArtifactPath,
  scanGeneratedImages,
} from "../runtime/src/artifacts.ts";

describe("artifact path allowlist", () => {
  it("accepts files under generated_images or cwd only", () => {
    const home = os.homedir();
    const images = path.join(home, ".codex", "generated_images");
    const cwd = path.join(home, "proj");
    expect(
      isAllowedArtifactPath(path.join(images, "ig.png"), [images, cwd])
    ).toBeTruthy();
    expect(
      isAllowedArtifactPath(path.join(cwd, "out.png"), [images, cwd])
    ).toBeTruthy();
    expect(isAllowedArtifactPath("/etc/passwd", [images, cwd])).toBeFalsy();
  });
});

describe(scanGeneratedImages, () => {
  it("picks recent images under a given home directory", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "tahcode-img-"));
    const dir = path.join(homeDir, ".codex", "generated_images");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "ig.png"), Buffer.from([137, 80, 78, 71]));
    const found = await scanGeneratedImages({
      homeDir,
      sinceMs: Date.now() - 10_000,
    });
    expect(
      found.some((item) => item.kind === "path" && item.name === "ig.png")
    ).toBeTruthy();
  });
});

describe(composeFinalText, () => {
  it("appends uploaded images before the footer", () => {
    expect(
      composeFinalText({
        artifactMarkdown: "![ig.png](/api/files/k)",
        elapsed: "1.2",
        fallbackMarkdown: "",
        model: "gpt-5.6-sol",
        output: "here you go",
        probeBinary: "codex",
        probeName: "Codex",
      })
    ).toContain("![ig.png](/api/files/k)");
  });
});
