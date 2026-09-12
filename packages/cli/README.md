# dalecode

Machine CLI for [dalecode](../../README.md): link this computer to a dalecode org and run coding agents on it through the **Multica daemon**.

```bash
npm i -g dalecode
dalecode link --url "https://<deployment>.convex.cloud" --runtime "<id>" --token "th_…" --name "office-mac"
dalecode start
```

The `link` line is issued by the dalecode web UI (Runtime タブ →「このマシンを登録」); the token is shown once.

## What it does

`dalecode` is a thin wrapper — it does not ship its own execution daemon.

| Responsibility | Owner |
| --- | --- |
| Org / runtime identity, one-time token, default-deny grants | dalecode backend (Convex) |
| Agent CLI detection, machine lifecycle (`daemon start/stop/status/logs`), Multica login | [Multica CLI/daemon](https://multica.ai/docs/daemon-runtimes) |
| Bridging dalecode chat jobs to a local agent CLI (Codex / Claude / Cursor / Grok / OpenCode) | `dalecode start` (the dalecode **bridge**, resident in the background) |

## Commands

| Command | Description |
| --- | --- |
| `dalecode link --url … --runtime … --token … [--name …]` | Store the link in `~/.dalecode/config.json` (0600) after verifying it against the backend. Also accepts the env block on stdin. |
| `dalecode start [--foreground] [--no-daemon] [--cwd dir] [--provider kind]` | Start the Multica daemon (device name = machine name), then start the dalecode bridge **in the background** and return. `--foreground` keeps the bridge in this terminal (Ctrl+C to stop). `--detach` is the explicit default. `run` is an alias. |
| `dalecode status` | Link status, bridge status (pid / mode / uptime / log file, launchd registration on macOS) and `multica daemon status`. |
| `dalecode stop [bridge\|multica\|all]` | Stop the bridge (SIGTERM → SIGKILL after 5 s) and/or `multica daemon stop`. Default `all`. |
| `dalecode restart [bridge\|multica\|all]` | Restart; the bridge comes back detached with its previous `--cwd` / `--provider` (override with flags). Default `all`. |
| `dalecode logs [bridge\|multica\|all] [-f] [-n N]` | Bridge log (`~/.dalecode/bridge.log`, default) or `multica daemon logs`. `-f` follows, `-n` sets the line count (50). |
| `dalecode service install\|uninstall\|status` | **macOS only.** Register the bridge as a launchd user agent (`~/Library/LaunchAgents/com.dalecode.bridge.plist`, RunAtLoad + KeepAlive) so it starts at login and is restarted if it dies. `install` accepts the same `--cwd` / `--provider` / `--no-daemon` as `start`. |
| `dalecode doctor` | Node, Multica install/login/daemon, detected agent CLIs, backend connectivity, bridge status. |
| `dalecode providers` | Agents seen by the Multica daemon + the t3code provider set the bridge can launch directly. |
| `dalecode install-multica [--yes]` | Print (or with `--yes` run) the Multica install command: Homebrew tap, official install script, or PowerShell on Windows. |
| `dalecode multica <args…>` | Anything else on the Multica CLI, unchanged (e.g. `dalecode multica login --token mul_…`). |
| `dalecode unlink` | Remove the stored link. |

Environment fallback (CI / containers): `DALECODE_URL`, `DALECODE_RUNTIME_ID`, `DALECODE_TOKEN` (legacy `CONVEX_URL` / `HARNESS_RUNTIME_ID` / `HARNESS_RUNTIME_TOKEN` still work). `DALECODE_HOME` overrides the config directory; `MULTICA_BIN` overrides the Multica binary.

## Running the bridge in the background

```bash
dalecode start              # Multica daemon + bridge detached; prints the pid and returns
dalecode status             # ✓ 起動中（pid 12345 · バックグラウンド · 2h3m · cwd …）
dalecode logs -f            # follow ~/.dalecode/bridge.log
dalecode stop               # bridge + Multica daemon
dalecode stop bridge        # bridge only
dalecode start --foreground # old behaviour: bridge in this terminal, Ctrl+C to stop
```

Files under `~/.dalecode/` (or `$DALECODE_HOME`):

| File | Purpose |
| --- | --- |
| `config.json` | Link (url / runtime id / token), 0600 |
| `bridge.json` | pid, mode (`foreground` / `detached` / `launchd`), start time, cwd, provider of the running bridge. Written by the bridge process itself, removed on exit; a stale file (crash / reboot) is discarded automatically. |
| `bridge.log` | stdout + stderr of a detached / launchd bridge (timestamped). Rotated to `bridge.log.1` when it exceeds 5 MB on start. |

Only one bridge runs per config directory: `start` is a no-op (exit 0) when one is already running.

### macOS: start at login (launchd)

```bash
dalecode service install [--cwd dir] [--provider kind] [--no-daemon]
dalecode service status
dalecode stop               # unloads the agent for now (RunAtLoad brings it back at next login; `dalecode start` resumes it immediately)
dalecode restart            # launchctl kickstart -k
dalecode service uninstall  # unload + remove the plist
```

The plist runs `node <this cli> start --foreground …` with `PATH` extended by the node directory, `/opt/homebrew/bin` and `/usr/local/bin`, and `DALECODE_HOME` / `MULTICA_BIN` if they were set when installing. Because the launchd agent also runs `start` (without `--no-daemon`), the Multica daemon is brought up at login too.

## Development (in the dalecode repo)

```bash
npm run cli -- doctor          # run from source (tsx)
npm run cli:build              # bundle to packages/cli/dist/dalecode.mjs (esbuild, convex external)
node packages/cli/dist/dalecode.mjs --help
```

The bridge reuses `runtime/src/*` and `shared/providers.ts` from the repo; `build.mjs` bundles them so the published package is self-contained.

## Publishing

```bash
cd packages/cli
npm version patch             # keep VERSION in src/index.ts in sync
npm publish --access public   # prepublishOnly runs the bundle
```

Current version: `0.1.1` (background bridge, `stop` / `restart` / `logs` for both processes, `service` for launchd).
