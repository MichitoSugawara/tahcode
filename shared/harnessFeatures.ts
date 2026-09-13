/**
 * Harness-native capabilities the control plane can surface in the
 * composer — first-class CLI skills / flags, not a lowest-common-denominator
 * prompt pipe.
 *
 * Phase 1 wires Codex `$imagegen`. Other providers stay listed so the UI
 * and PR/Linear notes share one follow-up inventory.
 */
import { parseMentions } from "./mentions.ts";
import type { ProviderDriverKind } from "./providers.ts";

export const CODEX_IMAGEGEN_SKILL = "$imagegen";
export const CODEX_IMAGEGEN_SLASH = "/imagegen";

export type HarnessFeatureStatus = "wired" | "followup";

export type HarnessNativeFeature = {
  description: string;
  driverKind: ProviderDriverKind;
  id: string;
  /** Text inserted into the composer (provider-aware mention when needed). */
  insert: (current: ProviderDriverKind) => string;
  name: string;
  phase: 1 | "followup";
  slash?: string;
  status: HarnessFeatureStatus;
};

export const HARNESS_NATIVE_FEATURES: readonly HarnessNativeFeature[] = [
  {
    description: "Codex CLI の画像生成スキル",
    driverKind: "codex",
    id: "codex-imagegen",
    insert: (current) =>
      current === "codex"
        ? `${CODEX_IMAGEGEN_SKILL} `
        : `@codex ${CODEX_IMAGEGEN_SKILL} `,
    name: CODEX_IMAGEGEN_SKILL,
    phase: 1,
    slash: CODEX_IMAGEGEN_SLASH,
    status: "wired",
  },
];

/** Documented follow-ups — not wired in Phase 1. */
export const HARNESS_NATIVE_FOLLOWUPS = [
  {
    description:
      "Codex `--image`（添付画像をローカルへ落として編集）。R2 添付のランタイム配信が必要",
    driverKind: "codex" as const,
    id: "codex-image-edit",
  },
  {
    description: "~/.codex/skills のライブ検出を $ メニューに載せる",
    driverKind: "codex" as const,
    id: "codex-skill-discovery",
  },
  {
    description:
      "Claude のスラッシュコマンド / スキルを composer から使えるようにする",
    driverKind: "claudeAgent" as const,
    id: "claude-slash-skills",
  },
  {
    description:
      "Cursor ACP の固有オプション（approval / setConfigOption など）",
    driverKind: "cursor" as const,
    id: "cursor-acp-options",
  },
  {
    description: "OpenCode の agent / plugin フラグを composer から選ぶ",
    driverKind: "opencode" as const,
    id: "opencode-agent-plugins",
  },
  {
    description: "Grok headless の画像・effort フラグ（CLI 側が固まったら）",
    driverKind: "grok" as const,
    id: "grok-native-flags",
  },
] as const;

const IMAGEGEN_TOKEN = /(?:^|[\s\n])(?:\$imagegen|\/imagegen)(?=[\s\n]|$)/m;

export function usesCodexImagegen(prompt: string): boolean {
  return IMAGEGEN_TOKEN.test(prompt);
}

/** `/imagegen …` → `$imagegen …` so Codex CLI sees its native skill. */
export function rewriteImagegenPrompt(prompt: string): string {
  return prompt.replaceAll(/(^|[\s\n])\/imagegen(?=[\s\n]|$)/g, "$1$imagegen");
}

export function mentionsCodex(prompt: string): boolean {
  return parseMentions(prompt).some(
    (mention) => mention.providerKind === "codex"
  );
}

/**
 * Composer / runner entry: normalize the slash alias and, when the current
 * agent is not Codex, route through `@codex` so the job hits the right CLI.
 */
export function applyImagegenDraft(
  driverKind: ProviderDriverKind,
  prompt: string
): string {
  const rewritten = rewriteImagegenPrompt(prompt);
  if (
    !usesCodexImagegen(rewritten) ||
    driverKind === "codex" ||
    mentionsCodex(rewritten)
  ) {
    return rewritten;
  }
  return `@codex ${rewritten}`;
}

export function wiredHarnessFeatures(): HarnessNativeFeature[] {
  return HARNESS_NATIVE_FEATURES.filter(
    (feature) => feature.status === "wired"
  );
}

export function imagegenInsert(current: ProviderDriverKind): string {
  const feature = HARNESS_NATIVE_FEATURES.find(
    (item) => item.id === "codex-imagegen"
  );
  return feature?.insert(current) ?? `${CODEX_IMAGEGEN_SKILL} `;
}
