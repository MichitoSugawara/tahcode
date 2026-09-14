# tahcode

Machine CLI for [tahcode](../../README.md) (ターコード — _team agent harness_): link this computer to a tahcode org and run coding agents on it through the **Multica daemon**.

> Renamed from the `dalecode` npm package (last release `dalecode@0.1.1`). See [Migrating from dalecode](#migrating-from-dalecode).

```bash
npm i -g tahcode
tahcode link --url "https://<deployment>.convex.cloud" --runtime "<id>" --token "th_…" --name "office-mac"
tahcode start
```

The `link` line is issued by the tahcode web UI (Runtime タブ →「このマシンを登録」); the token is shown once. The desktop app can run `link` and then restart/start the bridge itself via **この Mac を登録** (see [`apps/desktop/README.md`](../../apps/desktop/README.md)).

## What it does

`tahcode` is a thin wrapper — it does not ship its own execution daemon.

| Responsibility | Owner |
| --- | --- |
| Org / runtime identity, one-time token, default-deny grants | tahcode backend (Convex) |
| Agent CLI detection, machine lifecycle (`daemon start/stop/status/logs`), Multica login | [Multica CLI/daemon](https://multica.ai/docs/daemon-runtimes) |
| Bridging tahcode chat jobs to a local agent CLI (Codex / Claude / Cursor / Grok / OpenCode) | `tahcode start` (the tahcode **bridge**, resident in the background) |

## Commands

| Command | Description |
| --- | --- |
| `tahcode link --url … --runtime … --token … [--name …] [--no-restart]` | Store the link in `~/.tahcode/config.json` (0600) after verifying it against the backend. If a bridge is already running, restart it against the new url/runtime/token (`--no-restart` skips that). Also accepts the env block on stdin. |
| `tahcode start [--foreground] [--no-daemon] [--cwd dir] [--provider kind]` | Start the Multica daemon (device name = machine name), then start the tahcode bridge **in the background** and return. `--foreground` keeps the bridge in this terminal (Ctrl+C to stop). `--detach` is the explicit default. `run` is an alias. |
| `tahcode status` | Link status, bridge status (pid / mode / uptime / log file, launchd registration on macOS) and `multica daemon status`. |
| `tahcode stop [bridge\|multica\|all]` | Stop the bridge (SIGTERM → SIGKILL after 5 s) and/or `multica daemon stop`. Default `all`. |
| `tahcode restart [bridge\|multica\|all]` | Restart; the bridge comes back detached with its previous `--cwd` / `--provider` (override with flags). Default `all`. |
| `tahcode logs [bridge\|multica\|all] [-f] [-n N]` | Bridge log (`~/.tahcode/bridge.log`, default) or `multica daemon logs`. `-f` follows, `-n` sets the line count (50). |
| `tahcode service install\|uninstall\|status` | **macOS only.** Register the bridge as a launchd user agent (`~/Library/LaunchAgents/com.tahcode.bridge.plist`, RunAtLoad + KeepAlive) so it starts at login and is restarted if it dies. `install` accepts the same `--cwd` / `--provider` / `--no-daemon` as `start`. |
| `tahcode doctor` | Node, Multica install/login/daemon, detected agent CLIs, backend connectivity, bridge status, and whether this CLI has `tahcode tool` / `tool-mcp` (fails if older than 0.1.1). |
| `tahcode providers` | Agents seen by the Multica daemon + the t3code provider set the bridge can launch directly. |
| `tahcode models [provider]` | Models each CLI can use, fetched live where the CLI has a list command (`agent models`, `opencode models`, `grok models`); Codex / Claude / Antigravity fall back to the static catalog. |
| `tahcode update <provider\|all> [--yes]` | Update an agent CLI with the **same allowlisted command the web UI's「CLI を更新」runs**: npm / Homebrew installs via `npm i -g …@latest` / `brew upgrade …`, everything else via the CLI's own updater (`claude update`, `agent update`, `grok update`, `opencode upgrade`). Prints the command and exits unless `--yes`. |
| `tahcode install-multica [--yes]` | Print (or with `--yes` run) the Multica install command: Homebrew tap, official install script, or PowerShell on Windows. |
| `tahcode multica <args…>` | Anything else on the Multica CLI, unchanged (e.g. `tahcode multica login --token mul_…`). |
| `tahcode unlink` | Remove the stored link. |
| `tahcode tool [name] [--args JSON]` | While a job is running, call in-app tahcode tools (org / project / chat / runtime / connectors / Linear issues when `@linear` is mentioned). No args prints the catalog. |
| `tahcode tool-mcp` | Stdio host for the same tools (job env only). The bridge writes a temporary config for Claude `--mcp-config`. Cursor `agent -p` has no equivalent flag. |

Environment fallback (CI / containers): `TAHCODE_URL`, `TAHCODE_RUNTIME_ID`, `TAHCODE_TOKEN` (legacy `DALECODE_*`, `CONVEX_URL` / `HARNESS_RUNTIME_ID` / `HARNESS_RUNTIME_TOKEN` still work). `TAHCODE_HOME` overrides the config directory; `MULTICA_BIN` overrides the Multica binary.

## Running the bridge in the background

```bash
tahcode start              # Multica daemon + bridge detached; prints the pid and returns
tahcode status             # ✓ 起動中（pid 12345 · バックグラウンド · 2h3m · cwd …）
tahcode logs -f            # follow ~/.tahcode/bridge.log
tahcode stop               # bridge + Multica daemon
tahcode stop bridge        # bridge only
tahcode start --foreground # old behaviour: bridge in this terminal, Ctrl+C to stop
```

Files under `~/.tahcode/` (or `$TAHCODE_HOME`):

| File | Purpose |
| --- | --- |
| `config.json` | Link (url / runtime id / token), 0600 |
| `bridge.json` | pid, mode (`foreground` / `detached` / `launchd`), start time, cwd, provider of the running bridge. Written by the bridge process itself, removed on exit; a stale file (crash / reboot) is discarded automatically. |
| `bridge.log` | stdout + stderr of a detached / launchd bridge (timestamped). Rotated to `bridge.log.1` when it exceeds 5 MB on start. |
| `bridge.env` | Durable launchd / start env (`CURSOR_API_KEY`, Claude OAuth, …). `0600`, never committed. `service install` merges this file and the current plist — it does **not** wipe keys. |

Only one bridge runs per config directory: `start` is a no-op (exit 0) when one is already running.

### macOS: start at login (launchd)

```bash
tahcode service install [--cwd dir] [--provider kind] [--no-daemon]
tahcode service status
tahcode stop               # unloads the agent for now (RunAtLoad brings it back at next login; `tahcode start` resumes it immediately)
tahcode restart            # launchctl kickstart -k
tahcode service uninstall  # unload + remove the plist
```

The plist runs `node <this cli> start --foreground …`. `PATH` always includes the `node` that ran `tahcode` (`dirname(process.execPath)`), plus Homebrew / `/usr/local/bin`. `TAHCODE_HOME` / `MULTICA_BIN` / Cursor / Claude auth env are merged from:

1. the installing shell (`CURSOR_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, …)
2. the existing plist (`~/Library/LaunchAgents/com.tahcode.bridge.plist`)
3. `~/.tahcode/bridge.env`

Re-running `tahcode service install` **does not wipe** those keys. `service uninstall` removes the plist only — `bridge.env` stays. Because the launchd agent also runs `start` (without `--no-daemon`), the Multica daemon is brought up at login too.

Set Cursor headless auth once (never commit this file; doctor / logs print only 設定済み / 未設定):

```bash
mkdir -p ~/.tahcode
cat > ~/.tahcode/bridge.env <<'EOF'
CURSOR_API_KEY=key_…
# optional — Claude headless when the login session is not inherited:
# CLAUDE_CODE_OAUTH_TOKEN=…
# ANTHROPIC_API_KEY=…
EOF
chmod 600 ~/.tahcode/bridge.env
tahcode service install
tahcode doctor    # launchd の CURSOR_API_KEY / PATH を確認（値は出さない）
```

Or export `CURSOR_API_KEY` in the shell and run `tahcode service install` — the key is copied into the plist and `bridge.env`. `tahcode start` also loads `bridge.env` into the process when a key is missing.

## Development (in the tahcode repo)

```bash
npm run cli -- doctor          # run from source (tsx)
npm run cli:build              # bundle to packages/cli/dist/tahcode.mjs (esbuild, convex external)
node packages/cli/dist/tahcode.mjs --help
```

The bridge reuses `runtime/src/*` and `shared/providers.ts` from the repo; `build.mjs` bundles them so the published package is self-contained.

## Publishing

Version lives in `packages/cli/package.json` and `shared/cliVersion.ts` (`CLI_VERSION`). Keep them in sync. Dist is not committed; `prepublishOnly` / CI run `build.mjs`.

CI: [`.github/workflows/publish-cli.yml`](../../.github/workflows/publish-cli.yml) builds, verifies `tahcode tool` is not 「不明なコマンド」, and publishes to npm on push to `main` when the version is new. Needs repository secret `NPM_TOKEN`. `workflow_dispatch` can dry-run.

If the secret is missing, one-shot from a machine with npm publish rights:

```bash
npm run cli:verify
npm publish --workspace tahcode --access public
```

Current version: `0.1.1` (`tahcode tool` / `tool-mcp`, leaseId on `jobs:appendEvent` / `jobs:complete`). `tahcode@0.1.0` (2026-09-13) omitted both; server hotfix [#26](https://github.com/MichitoSugawara/tahcode/pull/26) still accepts missing `leaseId`.

Mac upgrade (binary pickup: `tahcode restart` is enough. `service install` now keeps `CURSOR_API_KEY` / Claude env — see [macOS: start at login](#macos-start-at-login-launchd) / TAH-60):

```bash
npm i -g tahcode@0.1.1
tahcode restart
tahcode doctor          # エージェントツール must be ✓
tahcode tool            # must NOT print 不明なコマンド: tool
```

## Migrating from dalecode

The package, bin, config directory, launchd label and env vars were renamed; behaviour is unchanged.

| `dalecode` ≤ 0.1.1 | `tahcode` |
| --- | --- |
| `npm i -g dalecode` / `dalecode …` | `npm i -g tahcode` / `tahcode …` |
| `~/.dalecode/` (`config.json`, `bridge.json`, `bridge.log`) | `~/.tahcode/` |
| `DALECODE_URL` / `DALECODE_RUNTIME_ID` / `DALECODE_TOKEN` / `DALECODE_HOME` / `DALECODE_CWD` | `TAHCODE_URL` / `TAHCODE_RUNTIME_ID` / `TAHCODE_TOKEN` / `TAHCODE_HOME` / `TAHCODE_CWD` |
| launchd label `com.dalecode.bridge` | `com.tahcode.bridge` |

Steps on a machine that already runs `dalecode`:

```bash
dalecode stop && dalecode service uninstall   # if the launchd agent was installed
npm rm -g dalecode && npm i -g tahcode
tahcode start                                  # reads the existing ~/.dalecode/config.json link
tahcode service install                        # optional; re-registers under com.tahcode.bridge
```

`tahcode` keeps reading an existing `~/.dalecode/config.json` (read-only fallback, shown by `tahcode status`) until you run `tahcode link …` again, which writes `~/.tahcode/config.json`. `DALECODE_URL` / `DALECODE_RUNTIME_ID` / `DALECODE_TOKEN` are still honoured as env fallbacks. `tahcode unlink` removes both locations.
