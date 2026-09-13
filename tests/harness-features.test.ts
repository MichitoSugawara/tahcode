import { describe, expect, it } from "vitest";

import {
  artifactsFromAssistantText,
  extractStreamArtifacts,
  formatArtifactMarkdown,
  formatLocalArtifactMarkdown,
  looksLikeImagePath,
  tryImageBase64,
} from "../shared/artifacts.ts";
import { convexSiteUrl } from "../shared/convexUrls.ts";
import { fileKeyFromHref } from "../shared/files.ts";
import {
  applyImagegenDraft,
  imagegenInsert,
  rewriteImagegenPrompt,
  usesCodexImagegen,
} from "../shared/harnessFeatures.ts";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Codex $imagegen draft", () => {
  it("recognizes the native skill and the slash alias", () => {
    expect(usesCodexImagegen("$imagegen a fox")).toBeTruthy();
    expect(usesCodexImagegen("/imagegen a fox")).toBeTruthy();
    expect(usesCodexImagegen("please $imagegen\nlater")).toBeTruthy();
    expect(usesCodexImagegen("talk about imagegen")).toBeFalsy();
  });

  it("rewrites /imagegen to the Codex skill and routes via @codex", () => {
    expect(rewriteImagegenPrompt("/imagegen a fox")).toBe("$imagegen a fox");
    expect(applyImagegenDraft("codex", "/imagegen a fox")).toBe(
      "$imagegen a fox"
    );
    expect(applyImagegenDraft("claudeAgent", "/imagegen a fox")).toBe(
      "@codex $imagegen a fox"
    );
    expect(applyImagegenDraft("cursor", "@codex /imagegen a fox")).toBe(
      "@codex $imagegen a fox"
    );
  });

  it("inserts $imagegen, or @codex $imagegen when another agent is selected", () => {
    expect(imagegenInsert("codex")).toBe("$imagegen ");
    expect(imagegenInsert("cursor")).toBe("@codex $imagegen ");
  });
});

describe("stream artifacts", () => {
  it("reads Codex saved_path on image_generation items", () => {
    expect(
      extractStreamArtifacts({
        item: {
          item_type: "image_generation",
          saved_path: "/Users/me/.codex/generated_images/ig_1.png",
        },
        type: "item.completed",
      })
    ).toStrictEqual([
      {
        kind: "path",
        name: "ig_1.png",
        path: "/Users/me/.codex/generated_images/ig_1.png",
      },
    ]);
  });

  it("decodes a tiny PNG carried in result base64", () => {
    const found = extractStreamArtifacts({
      item: { item_type: "image_generation_call", result: PNG_1X1 },
      type: "item.completed",
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      contentType: "image/png",
      kind: "bytes",
      name: "generated.png",
    });
    expect(
      tryImageBase64(`data:image/png;base64,${PNG_1X1}`)?.contentType
    ).toBe("image/png");
  });

  it("scrapes local markdown images and ignores already-hosted ones", () => {
    expect(
      artifactsFromAssistantText(
        "see ![cat](/Users/me/.codex/generated_images/ig_2.png) and ![x](/api/files/abc/cat.png)"
      )
    ).toStrictEqual([
      {
        kind: "path",
        name: "ig_2.png",
        path: "/Users/me/.codex/generated_images/ig_2.png",
      },
    ]);
    expect(looksLikeImagePath("/tmp/notes.txt")).toBeFalsy();
  });

  it("formats uploaded and local fallback markdown", () => {
    expect(
      formatArtifactMarkdown([
        {
          contentType: "image/png",
          key: "org/chat/artifact/ig.png",
          name: "ig.png",
        },
      ])
    ).toBe("![ig.png](/api/files/org%2Fchat%2Fartifact%2Fig.png)");
    expect(
      formatLocalArtifactMarkdown([
        {
          kind: "path",
          name: "ig.png",
          path: "/tmp/ig.png",
        },
      ])
    ).toContain("このマシン: `/tmp/ig.png`");
  });
});

describe("convex site URL", () => {
  it("maps .cloud to .site and local 3210 to 3211", () => {
    expect(convexSiteUrl("https://happy-animal-123.convex.cloud")).toBe(
      "https://happy-animal-123.convex.site"
    );
    expect(convexSiteUrl("http://127.0.0.1:3210")).toBe(
      "http://127.0.0.1:3211"
    );
    expect(
      convexSiteUrl("https://happy-animal-123.convex.cloud", {
        siteUrl: "https://override.example",
      })
    ).toBe("https://override.example");
  });
});

describe("file href keys", () => {
  it("reads /api/files keys", () => {
    expect(fileKeyFromHref("/api/files/org%2Fchat%2Fa.png")).toBe(
      "org/chat/a.png"
    );
    expect(fileKeyFromHref("https://example.com/x.png")).toBeNull();
  });
});
