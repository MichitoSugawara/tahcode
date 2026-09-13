import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PREVIEW_R2_BUCKET,
  PREVIEW_RETRY,
  classifyCreateOutput,
  classifyWranglerOutput,
  decideEnsureAction,
  failureHint,
  nextBackoffMs,
  nextDeployAction,
  outputListsBucket,
  parseBucketNames,
  parseCloudflareUrl,
  previewSkipReason,
  readEnvPresence,
  toConvexSiteUrl,
} from "../scripts/wrangler-classify.mjs";

const FETCH_FAILED = `
▲ [WARNING] A fetch request failed, likely due to a connectivity issue.

  Common causes:
    - No internet connection or network connectivity problems

✘ [ERROR] fetch failed
`;

describe(classifyWranglerOutput, () => {
  it("treats PR #12 connectivity output as transient", () => {
    expect(classifyWranglerOutput(FETCH_FAILED, 1)).toBe("transient");
  });

  it("strips ANSI from Wrangler color codes before classifying", () => {
    expect(
      classifyWranglerOutput(
        "\u001B[33mWARNING\u001B[0m A fetch request failed, likely due to a connectivity issue.\n\u001B[31mERROR\u001B[0m fetch failed",
        1
      )
    ).toBe("transient");
  });

  it("does not treat fetch failed as a missing Worker", () => {
    expect(classifyWranglerOutput(FETCH_FAILED, 1)).not.toBe("worker_missing");
  });

  it("classifies a missing Worker from combined stdout/stderr", () => {
    expect(
      classifyWranglerOutput(
        "Error: Worker tahcode-preview does not yet exist.",
        1
      )
    ).toBe("worker_missing");
  });

  it("classifies a missing R2 bucket", () => {
    expect(
      classifyWranglerOutput(
        "The R2 bucket 'team-harness-files-preview' does not exist. Please create it with wrangler r2 bucket create team-harness-files-preview",
        1
      )
    ).toBe("r2_missing");
  });

  it("classifies auth errors ahead of transient wording", () => {
    expect(
      classifyWranglerOutput("Authentication error / Invalid API token", 1)
    ).toBe("auth");
  });

  it("returns ok when wrangler exits 0", () => {
    expect(classifyWranglerOutput(FETCH_FAILED, 0)).toBe("ok");
  });
});

describe(nextBackoffMs, () => {
  it("uses 2s, 4s, 8s, 16s then caps", () => {
    expect(nextBackoffMs(1)).toBe(2000);
    expect(nextBackoffMs(2)).toBe(4000);
    expect(nextBackoffMs(3)).toBe(8000);
    expect(nextBackoffMs(4)).toBe(16_000);
    expect(nextBackoffMs(5)).toBe(16_000);
  });
});

describe(nextDeployAction, () => {
  const preview = {
    bootstrapped: false,
    ensuredR2: false,
    maxAttempts: PREVIEW_RETRY.maxAttempts,
    name: "preview",
    transientAttempt: 1,
  };

  it("retries transient preview failures until the cap", () => {
    expect(
      nextDeployAction({ ...preview, kind: "transient", transientAttempt: 1 })
    ).toStrictEqual({ backoffMs: 2000, type: "retry" });
    expect(
      nextDeployAction({ ...preview, kind: "transient", transientAttempt: 4 })
    ).toStrictEqual({ backoffMs: 16_000, type: "retry" });
    expect(
      nextDeployAction({ ...preview, kind: "transient", transientAttempt: 5 })
    ).toStrictEqual({ type: "fail" });
  });

  it("does not retry transient failures on staging or production", () => {
    expect(
      nextDeployAction({
        ...preview,
        kind: "transient",
        maxAttempts: 1,
        name: "staging",
        transientAttempt: 1,
      })
    ).toStrictEqual({ type: "fail" });
    expect(
      nextDeployAction({
        ...preview,
        kind: "transient",
        maxAttempts: 1,
        name: "production",
        transientAttempt: 1,
      })
    ).toStrictEqual({ type: "fail" });
  });

  it("bootstraps a missing Worker once", () => {
    expect(
      nextDeployAction({ ...preview, kind: "worker_missing" })
    ).toStrictEqual({ type: "bootstrap" });
    expect(
      nextDeployAction({
        ...preview,
        bootstrapped: true,
        kind: "worker_missing",
      })
    ).toStrictEqual({ type: "fail" });
  });

  it("auto-creates preview R2 only", () => {
    expect(nextDeployAction({ ...preview, kind: "r2_missing" })).toStrictEqual({
      type: "ensure_r2",
    });
    expect(
      nextDeployAction({
        ...preview,
        kind: "r2_missing",
        name: "staging",
      })
    ).toStrictEqual({ type: "fail" });
    expect(
      nextDeployAction({
        ...preview,
        kind: "r2_missing",
        name: "production",
      })
    ).toStrictEqual({ type: "fail" });
  });
});

describe(previewSkipReason, () => {
  it("skips preview when Cloudflare credentials are missing", () => {
    expect(
      previewSkipReason({ accountId: false, name: "preview", token: false })
    ).toContain("not set after decrypt");
  });

  it("never skips staging or production for missing credentials", () => {
    expect(
      previewSkipReason({ accountId: false, name: "staging", token: false })
    ).toBeNull();
    expect(
      previewSkipReason({
        accountId: false,
        name: "production",
        token: false,
      })
    ).toBeNull();
  });
});

describe(decideEnsureAction, () => {
  const base = {
    accountPresent: true,
    bucketListed: false,
    listAttempts: 1,
    listKind: "ok",
    listStatus: 0,
    maxListAttempts: 5,
    tokenPresent: true,
  };

  it("creates when the preview bucket is absent", () => {
    expect(decideEnsureAction(base)).toStrictEqual({ action: "create" });
  });

  it("reports exists when listed", () => {
    expect(decideEnsureAction({ ...base, bucketListed: true })).toStrictEqual({
      action: "exists",
    });
  });

  it("skips when credentials or list auth are missing", () => {
    expect(decideEnsureAction({ ...base, tokenPresent: false }).action).toBe(
      "skip"
    );
    expect(
      decideEnsureAction({
        ...base,
        listKind: "auth",
        listStatus: 1,
      }).action
    ).toBe("skip");
  });

  it("retries a transient list, then creates", () => {
    expect(
      decideEnsureAction({
        ...base,
        listAttempts: 1,
        listKind: "transient",
        listStatus: 1,
      })
    ).toStrictEqual({ action: "retry_list" });
    expect(
      decideEnsureAction({
        ...base,
        listAttempts: 5,
        listKind: "transient",
        listStatus: 1,
      })
    ).toStrictEqual({ action: "create" });
  });
});

describe("bucket list parsing", () => {
  it("reads JSON and table output", () => {
    expect(
      parseBucketNames(
        JSON.stringify({
          buckets: [{ name: "team-harness-files-preview" }],
        })
      )
    ).toStrictEqual(["team-harness-files-preview"]);
    expect(
      outputListsBucket(
        "name\n-----------\nteam-harness-files-preview\n",
        PREVIEW_R2_BUCKET
      )
    ).toBeTruthy();
  });

  it("treats already-exists create output as success", () => {
    expect(
      classifyCreateOutput("A bucket with that name already exists", 1)
    ).toBe("already_exists");
  });
});

describe("URL and env helpers", () => {
  it("parses version preview alias URLs", () => {
    expect(
      parseCloudflareUrl(
        "Version Preview Alias URL: https://pr-12-tahcode-preview.gawara.workers.dev"
      )
    ).toBe("https://pr-12-tahcode-preview.gawara.workers.dev");
  });

  it("maps convex.cloud to convex.site like the previous bash", () => {
    expect(toConvexSiteUrl("https://expert-ox-188.convex.cloud")).toBe(
      "https://expert-ox-188.convex.site"
    );
  });

  it("reads credential presence without returning values", () => {
    const present = readEnvPresence(
      "CLOUDFLARE_API_TOKEN=secret\nCLOUDFLARE_ACCOUNT_ID=\n",
      ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
      {}
    );
    expect(present).toStrictEqual({
      CLOUDFLARE_ACCOUNT_ID: false,
      CLOUDFLARE_API_TOKEN: true,
    });
  });

  it("mentions preview retries in the transient hint", () => {
    expect(failureHint("transient", "preview")).toContain("retries");
  });
});

describe("wrangler.jsonc preview bindings", () => {
  it("binds preview FILES to team-harness-files-preview", () => {
    const config = readFileSync("wrangler.jsonc", "utf-8");
    const preview = config.split('"preview":')[1]?.split('"staging":')[0] ?? "";
    expect(preview).toContain(PREVIEW_R2_BUCKET);
    expect(preview).toContain('"name": "tahcode-preview"');
    expect(preview).not.toMatch(/"bucket_name": "team-harness-files"/);
  });
});
