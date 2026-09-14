import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { renderLaunchdPlist } from "../packages/cli/src/bridge.ts";
import {
  applyBridgeEnvToProcess,
  collectLaunchdEnvironment,
  launchdAuthSummary,
  launchdDoctorFindings,
  launchdPathHasNode,
  parseDotEnv,
  parsePlistEnvironmentVariables,
  persistBridgeEnvSecrets,
  readBridgeEnvFile,
  secretPresence,
} from "../packages/cli/src/launchdEnv.ts";

const SECRET = "sk-test-cursor-key-do-not-log";
const CLAUDE_SECRET = "oauth-test-token-do-not-log";

describe("launchd env merge (TAH-60)", () => {
  const execPath = "/opt/vite-plus/bin/node";

  it("keeps CURSOR_API_KEY when service install runs twice without the shell key", () => {
    const first = collectLaunchdEnvironment({
      execPath,
      fileEnv: {},
      home: "/Users/ada",
      processEnv: { CURSOR_API_KEY: SECRET, PATH: "/usr/bin" },
    });
    expect(first.CURSOR_API_KEY).toBe(SECRET);
    expect(first.PATH.split(path.delimiter)[0]).toBe("/opt/vite-plus/bin");

    const second = collectLaunchdEnvironment({
      execPath,
      existingPlistEnv: first,
      fileEnv: {},
      home: "/Users/ada",
      processEnv: { PATH: "/usr/bin" },
    });
    expect(second.CURSOR_API_KEY).toBe(SECRET);
    expect(second.PATH).toContain("/opt/vite-plus/bin");
  });

  it("prefers the installing shell, then plist, then bridge.env", () => {
    const fromFile = collectLaunchdEnvironment({
      execPath,
      existingPlistEnv: {},
      fileEnv: { CURSOR_API_KEY: "from-file" },
      home: "/Users/ada",
      processEnv: {},
    });
    expect(fromFile.CURSOR_API_KEY).toBe("from-file");

    const fromPlist = collectLaunchdEnvironment({
      execPath,
      existingPlistEnv: { CURSOR_API_KEY: "from-plist" },
      fileEnv: { CURSOR_API_KEY: "from-file" },
      home: "/Users/ada",
      processEnv: {},
    });
    expect(fromPlist.CURSOR_API_KEY).toBe("from-plist");

    const fromShell = collectLaunchdEnvironment({
      execPath,
      existingPlistEnv: { CURSOR_API_KEY: "from-plist" },
      fileEnv: { CURSOR_API_KEY: "from-file" },
      home: "/Users/ada",
      processEnv: { CURSOR_API_KEY: "from-shell" },
    });
    expect(fromShell.CURSOR_API_KEY).toBe("from-shell");
  });

  it("preserves extra plist keys that operators injected by hand", () => {
    const env = collectLaunchdEnvironment({
      execPath,
      existingPlistEnv: {
        CURSOR_API_KEY: SECRET,
        MY_CUSTOM_TOKEN: "custom",
      },
      fileEnv: {},
      home: "/Users/ada",
      processEnv: {},
    });
    expect(env.MY_CUSTOM_TOKEN).toBe("custom");
    expect(env.CURSOR_API_KEY).toBe(SECRET);
  });

  it("round-trips EnvironmentVariables through the plist without dropping auth", () => {
    const env = collectLaunchdEnvironment({
      execPath,
      existingPlistEnv: { CURSOR_API_KEY: SECRET },
      fileEnv: { CLAUDE_CODE_OAUTH_TOKEN: CLAUDE_SECRET },
      home: "/Users/ada",
      processEnv: {},
    });
    const xml = renderLaunchdPlist({ cwd: "/tmp/project" }, env);
    const parsed = parsePlistEnvironmentVariables(xml);
    expect(parsed.CURSOR_API_KEY).toBe(SECRET);
    expect(parsed.CLAUDE_CODE_OAUTH_TOKEN).toBe(CLAUDE_SECRET);
    expect(parsed.PATH).toContain("/opt/vite-plus/bin");
    expect(parsed.TAHCODE_BRIDGE_MODE).toBe("launchd");
  });

  it("unescapes plist XML entities in existing EnvironmentVariables", () => {
    const parsed = parsePlistEnvironmentVariables(`<?xml version="1.0"?>
<plist><dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CURSOR_API_KEY</key>
    <string>a&amp;b&lt;c&gt;</string>
  </dict>
</dict></plist>`);
    expect(parsed.CURSOR_API_KEY).toBe("a&b<c>");
  });
});

describe("bridge.env", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  function envFile(name: string): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "tahcode-launchd-"));
    tempDirs.push(dir);
    return path.join(dir, name);
  }

  it("parses dotenv with comments, export, and quotes", () => {
    expect(
      parseDotEnv(`
# comment
export CURSOR_API_KEY="quoted-key"
ANTHROPIC_API_KEY=plain
EMPTY=
`)
    ).toStrictEqual({
      ANTHROPIC_API_KEY: "plain",
      CURSOR_API_KEY: "quoted-key",
    });
  });

  it("persists auth keys at 0600 and reloads them", () => {
    const filePath = envFile("bridge.env");
    persistBridgeEnvSecrets(
      {
        CURSOR_API_KEY: SECRET,
        HOME: "/Users/ada",
        PATH: "/usr/bin",
        TAHCODE_BRIDGE_MODE: "launchd",
      },
      filePath
    );
    const loaded = readBridgeEnvFile(filePath);
    expect(loaded).toStrictEqual({ CURSOR_API_KEY: SECRET });
    expect(readFileSync(filePath, "utf-8")).toContain("CURSOR_API_KEY=");
  });

  it("fills missing process.env from the file and does not overwrite", () => {
    const target: NodeJS.ProcessEnv = { CURSOR_API_KEY: "keep-me" };
    const applied = applyBridgeEnvToProcess(target, {
      CLAUDE_CODE_OAUTH_TOKEN: CLAUDE_SECRET,
      CURSOR_API_KEY: SECRET,
    });
    expect(target.CURSOR_API_KEY).toBe("keep-me");
    expect(target.CLAUDE_CODE_OAUTH_TOKEN).toBe(CLAUDE_SECRET);
    expect(applied).toStrictEqual(["CLAUDE_CODE_OAUTH_TOKEN"]);
  });
});

describe("doctor / presence (never print secrets)", () => {
  it("reports present/missing without the secret value", () => {
    const env = { CURSOR_API_KEY: SECRET };
    expect(secretPresence(env, "CURSOR_API_KEY")).toBe("present");
    expect(secretPresence(env, "ANTHROPIC_API_KEY")).toBe("missing");
    const summary = launchdAuthSummary(env);
    expect(summary.cursorApiKey).toBe("present");
    expect(JSON.stringify(summary)).not.toContain(SECRET);
  });

  it("warns when launchd is missing CURSOR_API_KEY and cursor is available", () => {
    const findings = launchdDoctorFindings({
      cursorAvailable: true,
      execPath: "/opt/vite-plus/bin/node",
      fileEnv: {},
      installed: true,
      plistEnv: { PATH: "/usr/bin:/bin" },
      supported: true,
    });
    const text = findings.map((item) => item.message).join("\n");
    expect(text).toContain("CURSOR_API_KEY");
    expect(text).toContain("未設定");
    expect(text).not.toContain(SECRET);
    expect(findings.some((item) => item.level === "warn")).toBeTruthy();
  });

  it("tells the operator to re-install when the key is only in bridge.env", () => {
    const findings = launchdDoctorFindings({
      cursorAvailable: true,
      execPath: "/opt/vite-plus/bin/node",
      fileEnv: { CURSOR_API_KEY: SECRET },
      installed: true,
      plistEnv: { PATH: "/opt/vite-plus/bin" },
      supported: true,
    });
    const warn = findings.find((item) => item.level === "warn");
    expect(warn?.message).toContain("bridge.env");
    expect(warn?.message).not.toContain(SECRET);
    expect(JSON.stringify(findings)).not.toContain(SECRET);
  });

  it("does not warn about CURSOR_API_KEY when cursor is not installed", () => {
    const findings = launchdDoctorFindings({
      cursorAvailable: false,
      execPath: "/opt/vite-plus/bin/node",
      fileEnv: {},
      installed: true,
      plistEnv: { PATH: "/opt/vite-plus/bin" },
      supported: true,
    });
    expect(
      findings.some((item) => item.message.includes("CURSOR_API_KEY"))
    ).toBeFalsy();
  });

  it("warns when launchd PATH lacks node", () => {
    const findings = launchdDoctorFindings({
      cursorAvailable: false,
      execPath: "/opt/vite-plus/bin/node",
      fileEnv: {},
      installed: true,
      nodeExists: () => false,
      plistEnv: { PATH: "/usr/bin:/bin" },
      supported: true,
    });
    expect(
      findings.some(
        (item) => item.level === "warn" && item.message.includes("PATH")
      )
    ).toBeTruthy();
  });

  it("treats PATH as having node when it includes dirname(execPath)", () => {
    expect(
      launchdPathHasNode(
        "/opt/vite-plus/bin:/usr/bin",
        "/opt/vite-plus/bin/node"
      )
    ).toBeTruthy();
    expect(
      launchdPathHasNode("/usr/bin", "/opt/vite-plus/bin/node", () => false)
    ).toBeFalsy();
  });
});
