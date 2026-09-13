/**
 * Machine provider maintenance — the allowlist the bridge, the Convex
 * functions and the web UI all agree on.
 *
 * Two things live here and nothing else:
 *
 * 1. **Live model discovery** — which CLIs can list their own model catalog
 *    (`agent models`, `opencode models`, `grok models` per each CLI's reference
 *    docs; `codex debug models --bundled` as Multica's `models.go` does) and
 *    how to parse that output. Claude has no such command (Multica drives a
 *    stream-json control request instead), so it stays on the static catalog
 *    in `shared/providers.ts`, the same fallback Multica uses.
 *
 * 2. **CLI update plans** — the exact argv a bridge is allowed to run to
 *    update a provider CLI. The server never sends a command string: it sends
 *    `(kind, driverKind)` and the bridge resolves the plan from *this* table
 *    with the install method it detected locally. Anything not in this table
 *    is "manual", shown to the owner as a command to run themselves. No
 *    `curl | sh`, no shell interpolation.
 */
import { type ProviderDriverKind, catalogFor, isValidModelSlug } from "./providers.ts";

/* ── vocabulary ──────────────────────────────────────────── */

export const INSTALL_METHODS = ["npm", "brew", "installer", "unknown"] as const;
export type InstallMethod = (typeof INSTALL_METHODS)[number];

export const MAINTENANCE_KINDS = ["updateCli", "refreshModels"] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

export const MAINTENANCE_STATUSES = ["queued", "running", "done", "failed", "cancelled"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

/** A command still "running" this long after being claimed lost its bridge (crash / restart mid-update). */
export const STALE_RUNNING_MS = 15 * 60_000;

/** Heartbeat capabilities a bridge advertises; an old bridge reports none. */
export const BRIDGE_CAPABILITY_MAINTENANCE = "maintenance";
export const BRIDGE_CAPABILITY_LIVE_MODELS = "liveModels";

/** One model as reported live from a machine (`agent models` etc.). */
export type LiveModel = {
  slug: string;
  name?: string;
  /** The CLI marked this as its current default (`*`, "(default)", "(current)"). */
  default?: boolean;
  /** Codex `debug models` JSON — sizes the effort picker when present. */
  defaultReasoningLevel?: string;
  supportedReasoningLevels?: string[];
};

export type ModelSource = "live" | "static";

/* ── per-provider table ──────────────────────────────────── */

export type UpdateVia = "self" | "npm" | "brew";

export type UpdatePlan = {
  via: UpdateVia;
  /** Exact argv; `argv[0]` is either the provider binary (self) or `npm` / `brew`. */
  argv: readonly string[];
};

type ProviderMaintenanceEntry = {
  /** Sub-argv appended to the provider binary to list models, or null when the CLI has none. */
  modelsArgv: readonly string[] | null;
  /** Human hint for where a live list comes from / why there is none (Japanese, UI copy). */
  modelsHint: string;
  /** The CLI's own update subcommand, run as `<binary> …`. */
  selfUpdateArgv: readonly string[] | null;
  /** Global npm package, when the vendor publishes one. */
  npmPackage: string | null;
  /** Homebrew formula/cask, when the vendor publishes one. */
  brewName: string | null;
  /** Shown when no plan applies (Antigravity) — Japanese. */
  manualHint: string;
};

export const PROVIDER_MAINTENANCE: Record<ProviderDriverKind, ProviderMaintenanceEntry> = {
  codex: {
    // Codex 0.122.0+ ships a structured, offline catalog dump (JSON on stdout);
    // Multica's daemon uses the same hook. Older binaries fail → static fallback.
    modelsArgv: ["debug", "models", "--bundled"],
    modelsHint: "codex debug models --bundled（Codex 0.122.0 以降。古い CLI は静的カタログ）",
    selfUpdateArgv: null,
    npmPackage: "@openai/codex",
    brewName: "codex",
    manualHint: "npm i -g @openai/codex@latest または brew upgrade codex",
  },
  claudeAgent: {
    modelsArgv: null,
    modelsHint: "Claude Code にはモデル一覧コマンドがないため静的カタログ（t3code model-manifest）",
    selfUpdateArgv: ["update"],
    npmPackage: "@anthropic-ai/claude-code",
    brewName: "claude-code",
    manualHint: "claude update",
  },
  cursor: {
    modelsArgv: ["models"],
    modelsHint: "agent models（サインイン中のアカウントで使えるモデル）",
    selfUpdateArgv: ["update"],
    npmPackage: null,
    brewName: null,
    manualHint: "agent update",
  },
  grok: {
    modelsArgv: ["models"],
    modelsHint: "grok models（サインイン中のアカウントで使えるモデル）",
    selfUpdateArgv: ["update"],
    npmPackage: "@xai-official/grok",
    brewName: null,
    manualHint: "grok update",
  },
  opencode: {
    modelsArgv: ["models"],
    modelsHint: "opencode models（設定済みプロバイダの provider/model）",
    // `opencode upgrade` detects its own install method (curl / npm / brew).
    selfUpdateArgv: ["upgrade"],
    npmPackage: null,
    brewName: null,
    manualHint: "opencode upgrade",
  },
  antigravity: {
    modelsArgv: null,
    modelsHint: "headless CLI がないため静的カタログ（t3code model-manifest）",
    selfUpdateArgv: null,
    npmPackage: null,
    brewName: null,
    manualHint: "Antigravity アプリ側で更新してください（CLI なし）",
  },
};

export function supportsLiveModels(kind: ProviderDriverKind): boolean {
  return PROVIDER_MAINTENANCE[kind].modelsArgv !== null;
}

/** `agent models` — the display form of the discovery command. */
export function modelsCommandLabel(kind: ProviderDriverKind, binary?: string | null): string | null {
  const argv = PROVIDER_MAINTENANCE[kind].modelsArgv;
  if (!argv) return null;
  return [binary ?? catalogFor(kind).binaryNames[0] ?? kind, ...argv].join(" ");
}

/**
 * Classify how a CLI was installed from where its binary really lives
 * (callers pass the symlink-resolved path). npm global installs land under
 * `node_modules`, Homebrew under `Cellar`/`homebrew`; everything else is the
 * vendor's own installer (`~/.local/bin/agent`, `~/.opencode/bin`, …).
 */
export function classifyInstallMethod(resolvedBinaryPath: string | null | undefined): InstallMethod {
  if (!resolvedBinaryPath) return "unknown";
  const normalized = resolvedBinaryPath.replace(/\\/g, "/");
  if (/\/node_modules\//.test(normalized) || /\/npm\/|\/\.npm-global\/|\/\.nvm\/|\/\.volta\/|\/\.fnm\//.test(normalized)) return "npm";
  if (/\/Cellar\/|\/homebrew\/|\/linuxbrew\/|\/Caskroom\//.test(normalized)) return "brew";
  return "installer";
}

/**
 * The update the bridge is allowed to run for a provider on a machine, given
 * how the CLI was installed there. Package-manager installs are updated via
 * the package manager (the vendors document `npm i -g …@latest` /
 * `brew upgrade …` for those); anything else uses the CLI's own updater.
 * Returns null when no documented, non-interactive path exists — the UI then
 * shows `manualHint` instead of a button.
 */
export function updatePlanFor(kind: ProviderDriverKind, installMethod: InstallMethod, binary?: string | null): UpdatePlan | null {
  const entry = PROVIDER_MAINTENANCE[kind];
  if (installMethod === "npm" && entry.npmPackage) {
    return { via: "npm", argv: ["npm", "install", "-g", `${entry.npmPackage}@latest`] };
  }
  if (installMethod === "brew" && entry.brewName) {
    return { via: "brew", argv: ["brew", "upgrade", entry.brewName] };
  }
  if (entry.selfUpdateArgv) {
    return { via: "self", argv: [binary ?? catalogFor(kind).binaryNames[0] ?? kind, ...entry.selfUpdateArgv] };
  }
  // A package-manager install we cannot classify still has a package path.
  if (entry.npmPackage && installMethod === "unknown") {
    return { via: "npm", argv: ["npm", "install", "-g", `${entry.npmPackage}@latest`] };
  }
  return null;
}

/** `agent update` — display form (binary basename, full argv otherwise). */
export function updateCommandLabel(plan: UpdatePlan | null): string | null {
  if (!plan) return null;
  const [bin = "", ...rest] = plan.argv;
  return [bin.split(/[\\/]/).pop() ?? bin, ...rest].join(" ");
}

export function installMethodLabel(method: InstallMethod | undefined): string {
  switch (method) {
    case "npm":
      return "npm";
    case "brew":
      return "Homebrew";
    case "installer":
      return "公式インストーラ";
    default:
      return "不明";
  }
}

/* ── output parsing (pure) ───────────────────────────────── */

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const BULLET_RE = /^[\s\-*•·>›✓✔☑▸▶]+/;
const DEFAULT_MARK_RE = /\((?:current|default|selected|active)\)|\[(?:current|default)\]|(?:^|\s)\*(?=\s|$)/i;
const HEADER_RE = /^(available|models?\b|usage|options?|commands?|name\b|id\b|provider\b|listing|fetching|loading|note|tip|hint|run\b|use\b)/i;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

function candidateFromJson(value: unknown): LiveModel | null {
  if (typeof value === "string") return isValidModelSlug(value) ? { slug: value } : null;
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  // `codex debug models` lists hidden entries too; Codex's own picker skips them.
  if (record.visibility === "hide" || record.hidden === true) return null;
  const slugField = [record.id, record.slug, record.model, record.value, record.name].find((field) => typeof field === "string" && isValidModelSlug(field));
  if (typeof slugField !== "string") return null;
  const nameField = [record.displayName, record.display_name, record.label, record.title, record.name].find(
    (field) => typeof field === "string" && field !== slugField && field.trim().length > 0,
  );
  const isDefault = record.default === true || record.current === true || record.selected === true;
  const defaultReasoning = [record.default_reasoning_level, record.defaultReasoningLevel, record.defaultReasoningEffort].find(
    (field) => typeof field === "string" && field.trim().length > 0,
  );
  const levelsRaw = [record.supported_reasoning_levels, record.supportedReasoningLevels, record.supportedReasoningEfforts].find(
    (field) => Array.isArray(field),
  );
  const supportedReasoningLevels = Array.isArray(levelsRaw)
    ? levelsRaw
        .map((item) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item !== null) {
            const effort = (item as Record<string, unknown>).reasoningEffort ?? (item as Record<string, unknown>).id;
            return typeof effort === "string" ? effort : "";
          }
          return "";
        })
        .filter((item) => item.length > 0)
    : undefined;
  return {
    slug: slugField,
    ...(typeof nameField === "string" ? { name: nameField.trim() } : {}),
    ...(isDefault ? { default: true } : {}),
    ...(typeof defaultReasoning === "string" ? { defaultReasoningLevel: defaultReasoning.trim() } : {}),
    ...(supportedReasoningLevels && supportedReasoningLevels.length > 0 ? { supportedReasoningLevels } : {}),
  };
}

function parseJsonModels(text: string): LiveModel[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null
        ? ((parsed as Record<string, unknown>).models ?? (parsed as Record<string, unknown>).data ?? (parsed as Record<string, unknown>).items)
        : null;
    if (!Array.isArray(list)) return null;
    const models = list.map(candidateFromJson).filter((model): model is LiveModel => model !== null);
    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
}

/**
 * Parse the stdout of a provider's `models` command into slugs the CLI will
 * accept for `--model`. Tolerates the common shapes — one slug per line,
 * `slug - Display name`, `slug  Display name`, bullets, a `*`/`(current)`
 * marker, JSON arrays — and ignores headers and prose. Returns an empty list
 * when nothing parsable was found so callers fall back to the static catalog.
 */
export function parseModelListOutput(kind: ProviderDriverKind, output: string): LiveModel[] {
  const clean = stripAnsi(output);
  const fromJson = parseJsonModels(clean);
  if (fromJson) return dedupe(fromJson);

  const models: LiveModel[] = [];
  for (const rawLine of clean.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    if (line.endsWith(":") || HEADER_RE.test(line)) continue;
    const isDefault = DEFAULT_MARK_RE.test(line);
    line = line.replace(new RegExp(DEFAULT_MARK_RE.source, "gi"), " ").replace(BULLET_RE, "").trim();
    if (!line) continue;
    // `slug - Name`, `slug — Name`, `slug: Name`, `slug<TAB>Name`, `slug   Name`
    const parts = line.split(/\s+[-—–:]\s+|\t+|\s{2,}|\s+\|\s+/).map((part) => part.trim()).filter(Boolean);
    const first = parts[0] ?? "";
    // The slug is the first whitespace-free token of the first column.
    const slug = first.split(/\s+/)[0] ?? "";
    if (!isValidModelSlug(slug)) continue;
    // OpenCode lists `provider/model`; everything else must look like an id, not a word.
    if (kind === "opencode" && !slug.includes("/")) continue;
    if (kind !== "opencode" && !/[\d\-./_]/.test(slug) && slug !== "auto") continue;
    const rest = first.split(/\s+/).slice(1).join(" ");
    const name = (parts.slice(1).join(" · ") || rest).trim();
    models.push({ slug, ...(name && name !== slug ? { name } : {}), ...(isDefault ? { default: true } : {}) });
  }
  return dedupe(models);
}

function dedupe(models: LiveModel[]): LiveModel[] {
  const seen = new Set<string>();
  const out: LiveModel[] = [];
  for (const model of models) {
    if (seen.has(model.slug)) continue;
    seen.add(model.slug);
    out.push(model);
  }
  return out;
}

/* ── catalog merge (shared by pickers and the settings UI) ── */

export type CatalogModel = LiveModel & { source: ModelSource; legacy?: boolean };

/**
 * What a picker should show for a provider: the live list when a machine
 * reported one (the account's real catalog — the same choice Multica makes),
 * otherwise the static snapshot from `shared/providers.ts`.
 */
export function mergeModelCatalog(kind: ProviderDriverKind, live: readonly LiveModel[] | null | undefined): { models: CatalogModel[]; source: ModelSource } {
  const statics = catalogFor(kind).models;
  if (live && live.length > 0) {
    const named = new Map(statics.map((model) => [model.slug, model.name] as const));
    return {
      source: "live",
      models: live.map((model) => ({ ...model, name: model.name ?? named.get(model.slug) ?? model.slug, source: "live" })),
    };
  }
  return {
    source: "static",
    models: [
      ...statics.filter((model) => !model.legacy).map((model) => ({ slug: model.slug, name: model.name, source: "static" as const })),
      ...statics.filter((model) => model.legacy).map((model) => ({ slug: model.slug, name: model.name, legacy: true, source: "static" as const })),
    ],
  };
}

/* ── permission rule (pure, tested) ─────────────────────── */

export type MaintenanceActor = {
  actorUserId: string;
  actorRole: "owner" | "admin" | "member";
  runtimeOwnerUserId: string;
  /** Runtime setting: the machine owner opted in to let org Owner/Admin run updates. */
  maintenanceByAdmins: boolean;
  /** Whether the actor may run jobs on this machine (owner or granted). */
  canUseRuntime: boolean;
};

/**
 * Who may trigger maintenance on a machine.
 * - `updateCli` changes software on someone's computer: the machine owner,
 *   plus org Owner/Admin only when the owner turned `maintenanceByAdmins` on.
 * - `refreshModels` only runs the provider's read-only `models` command, so
 *   anyone already allowed to run jobs there may refresh (it is strictly less
 *   powerful than the jobs they can already dispatch).
 */
export function canRequestMaintenance(kind: MaintenanceKind, input: MaintenanceActor): boolean {
  if (input.actorUserId === input.runtimeOwnerUserId) return true;
  const privileged = input.actorRole === "owner" || input.actorRole === "admin";
  if (kind === "updateCli") return input.maintenanceByAdmins && privileged;
  return input.canUseRuntime || (input.maintenanceByAdmins && privileged);
}
