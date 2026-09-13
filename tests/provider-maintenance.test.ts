import { describe, expect, it } from "vitest";
import {
  PROVIDER_MAINTENANCE,
  canRequestMaintenance,
  classifyInstallMethod,
  mergeModelCatalog,
  modelsCommandLabel,
  parseModelListOutput,
  supportsLiveModels,
  updateCommandLabel,
  updatePlanFor,
} from "../shared/providerMaintenance.ts";
import { PROVIDER_DRIVER_KINDS } from "../shared/providers.ts";

describe("parseModelListOutput", () => {
  it("reads Cursor's `agent models` text (header, bullets, `slug - Name`, default marker)", () => {
    const out = [
      "Available models:",
      "  auto - Auto",
      "* composer-2.5 - Composer 2.5 (default)",
      "  claude-fable-5-1 - Claude Fable 5.1",
      "  gpt-5.6-sol",
      "",
      "Use --model <id> to pick one.",
    ].join("\n");
    expect(parseModelListOutput("cursor", out)).toEqual([
      { slug: "auto", name: "Auto" },
      { slug: "composer-2.5", name: "Composer 2.5", default: true },
      { slug: "claude-fable-5-1", name: "Claude Fable 5.1" },
      { slug: "gpt-5.6-sol" },
    ]);
  });

  it("strips ANSI colour codes and dedupes", () => {
    const out = "\u001b[1mModels\u001b[22m\n\u001b[32mgrok-4.6\u001b[39m\ngrok-4.6\ngrok-4.5 — Grok 4.5\n";
    expect(parseModelListOutput("grok", out)).toEqual([{ slug: "grok-4.6" }, { slug: "grok-4.5", name: "Grok 4.5" }]);
  });

  it("keeps only provider/model ids for OpenCode", () => {
    const out = "anthropic/claude-sonnet-5\nopenai/gpt-5.6-sol\nsome prose line here\nopencode/kimi-k3\n";
    expect(parseModelListOutput("opencode", out).map((m) => m.slug)).toEqual(["anthropic/claude-sonnet-5", "openai/gpt-5.6-sol", "opencode/kimi-k3"]);
  });

  it("accepts JSON arrays of objects or strings", () => {
    expect(parseModelListOutput("cursor", JSON.stringify([{ id: "composer-2.5", displayName: "Composer 2.5", default: true }, "gpt-5.6-sol"]))).toEqual([
      { slug: "composer-2.5", name: "Composer 2.5", default: true },
      { slug: "gpt-5.6-sol" },
    ]);
    expect(parseModelListOutput("grok", JSON.stringify({ models: [{ name: "grok-4.6" }] }))).toEqual([{ slug: "grok-4.6" }]);
  });

  it("reads `codex debug models --bundled` JSON and skips hidden entries (Multica's shape)", () => {
    const out = JSON.stringify({
      models: [
        { slug: "gpt-6-astra", display_name: "GPT-6 Astra", visibility: "list", default_reasoning_level: "high" },
        { slug: "gpt-5.6-sol", display_name: "GPT-5.6 Sol", visibility: "list" },
        { slug: "gpt-5.3-codex", display_name: "GPT-5.3 Codex", visibility: "hide" },
      ],
    });
    expect(parseModelListOutput("codex", out)).toEqual([
      { slug: "gpt-6-astra", name: "GPT-6 Astra" },
      { slug: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
    ]);
  });

  it("returns [] for error prose so callers fall back to the static catalog", () => {
    expect(parseModelListOutput("cursor", "Error: not logged in. Run agent login first.")).toEqual([]);
    expect(parseModelListOutput("opencode", "")).toEqual([]);
  });
});

describe("live model discovery table", () => {
  it("Codex, Cursor, Grok and OpenCode have a models command; Claude / Antigravity are static", () => {
    expect(PROVIDER_DRIVER_KINDS.filter(supportsLiveModels)).toEqual(["codex", "cursor", "grok", "opencode"]);
    expect(modelsCommandLabel("cursor")).toBe("agent models");
    expect(modelsCommandLabel("codex")).toBe("codex debug models --bundled");
    expect(modelsCommandLabel("opencode", "/usr/local/bin/opencode")).toBe("/usr/local/bin/opencode models");
    expect(modelsCommandLabel("claudeAgent")).toBeNull();
  });
});

describe("classifyInstallMethod", () => {
  it("recognises npm, Homebrew and vendor installers from the resolved path", () => {
    expect(classifyInstallMethod("/usr/local/lib/node_modules/@openai/codex/bin/codex.js")).toBe("npm");
    expect(classifyInstallMethod("/Users/me/.nvm/versions/node/v22.0.0/bin/claude")).toBe("npm");
    expect(classifyInstallMethod("/opt/homebrew/Cellar/codex/0.9.0/bin/codex")).toBe("brew");
    expect(classifyInstallMethod("/home/linuxbrew/.linuxbrew/bin/opencode")).toBe("brew");
    expect(classifyInstallMethod("/Users/me/.local/bin/agent")).toBe("installer");
    expect(classifyInstallMethod("C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\codex\\bin\\codex")).toBe("npm");
    expect(classifyInstallMethod(null)).toBe("unknown");
  });
});

describe("updatePlanFor (the allowlist)", () => {
  it("uses the package manager for npm / brew installs and the CLI's own updater otherwise", () => {
    expect(updatePlanFor("codex", "npm")).toEqual({ via: "npm", argv: ["npm", "install", "-g", "@openai/codex@latest"] });
    expect(updatePlanFor("codex", "brew")).toEqual({ via: "brew", argv: ["brew", "upgrade", "codex"] });
    expect(updatePlanFor("claudeAgent", "installer", "/Users/me/.local/bin/claude")).toEqual({ via: "self", argv: ["/Users/me/.local/bin/claude", "update"] });
    expect(updatePlanFor("claudeAgent", "npm")).toEqual({ via: "npm", argv: ["npm", "install", "-g", "@anthropic-ai/claude-code@latest"] });
    expect(updatePlanFor("cursor", "installer", "/Users/me/.local/bin/agent")).toEqual({ via: "self", argv: ["/Users/me/.local/bin/agent", "update"] });
    expect(updatePlanFor("opencode", "brew", "/opt/homebrew/bin/opencode")).toEqual({ via: "self", argv: ["/opt/homebrew/bin/opencode", "upgrade"] });
    expect(updatePlanFor("grok", "npm")).toEqual({ via: "npm", argv: ["npm", "install", "-g", "@xai-official/grok@latest"] });
    expect(updatePlanFor("grok", "installer", "grok")).toEqual({ via: "self", argv: ["grok", "update"] });
  });

  it("has no plan for Codex on an unclassifiable install without npm, and never for Antigravity", () => {
    expect(updatePlanFor("codex", "installer")).toBeNull();
    expect(updatePlanFor("antigravity", "npm")).toBeNull();
    expect(updatePlanFor("antigravity", "installer")).toBeNull();
  });

  it("never produces a shell pipeline — every argv is a bare program + arguments", () => {
    for (const kind of PROVIDER_DRIVER_KINDS) {
      for (const method of ["npm", "brew", "installer", "unknown"] as const) {
        const plan = updatePlanFor(kind, method, "/bin/x");
        for (const arg of plan?.argv ?? []) {
          expect(arg).not.toMatch(/[|;&$`<>]/);
          expect(arg).not.toMatch(/curl|wget|sh\b|bash\b/);
        }
      }
    }
  });

  it("labels use the binary basename", () => {
    expect(updateCommandLabel(updatePlanFor("cursor", "installer", "/Users/me/.local/bin/agent"))).toBe("agent update");
    expect(updateCommandLabel(null)).toBeNull();
    expect(PROVIDER_MAINTENANCE.codex.manualHint).toContain("npm i -g @openai/codex@latest");
  });
});

describe("mergeModelCatalog", () => {
  it("prefers the live list and borrows display names from the static snapshot", () => {
    const merged = mergeModelCatalog("cursor", [{ slug: "composer-2.5", default: true }, { slug: "brand-new-9" }]);
    expect(merged.source).toBe("live");
    expect(merged.models).toEqual([
      { slug: "composer-2.5", name: "Composer 2.5", default: true, source: "live" },
      { slug: "brand-new-9", name: "brand-new-9", source: "live" },
    ]);
  });

  it("falls back to the static catalog, current models before legacy", () => {
    const merged = mergeModelCatalog("codex", []);
    expect(merged.source).toBe("static");
    expect(merged.models[0]).toEqual({ slug: "gpt-6-astra", name: "GPT-6 Astra", source: "static" });
    expect(merged.models.at(-1)).toMatchObject({ slug: "gpt-5.3-codex", legacy: true, source: "static" });
  });
});

describe("canRequestMaintenance", () => {
  const base = { runtimeOwnerUserId: "owner", maintenanceByAdmins: false, canUseRuntime: false };

  it("lets the machine owner do anything", () => {
    expect(canRequestMaintenance("updateCli", { ...base, actorUserId: "owner", actorRole: "member" })).toBe(true);
    expect(canRequestMaintenance("refreshModels", { ...base, actorUserId: "owner", actorRole: "member" })).toBe(true);
  });

  it("denies CLI updates to admins and org owners until the machine owner opts in", () => {
    expect(canRequestMaintenance("updateCli", { ...base, actorUserId: "a", actorRole: "admin" })).toBe(false);
    expect(canRequestMaintenance("updateCli", { ...base, actorUserId: "o", actorRole: "owner" })).toBe(false);
    expect(canRequestMaintenance("updateCli", { ...base, actorUserId: "a", actorRole: "admin", maintenanceByAdmins: true })).toBe(true);
    expect(canRequestMaintenance("updateCli", { ...base, actorUserId: "m", actorRole: "member", maintenanceByAdmins: true })).toBe(false);
  });

  it("never lets a granted user update CLIs, but lets them refresh models", () => {
    expect(canRequestMaintenance("updateCli", { ...base, actorUserId: "m", actorRole: "member", canUseRuntime: true })).toBe(false);
    expect(canRequestMaintenance("refreshModels", { ...base, actorUserId: "m", actorRole: "member", canUseRuntime: true })).toBe(true);
    expect(canRequestMaintenance("refreshModels", { ...base, actorUserId: "m", actorRole: "member" })).toBe(false);
  });
});
