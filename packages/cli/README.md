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
| Bridging dalecode chat jobs to a local agent CLI (Codex / Claude / Cursor / Grok / OpenCode) | `dalecode start` (foreground bridge, Phase 1) |

## Commands

| Command | Description |
| --- | --- |
| `dalecode link --url … --runtime … --token … [--name …]` | Store the link in `~/.dalecode/config.json` (0600) after verifying it against the backend. Also accepts the env block on stdin. |
| `dalecode start [--no-daemon] [--cwd dir] [--provider kind]` | Start the Multica daemon (device name = machine name), then run the dalecode bridge in the foreground. `run` is an alias. |
| `dalecode status` | Link status + `multica daemon status`. |
| `dalecode doctor` | Node, Multica install/login/daemon, detected agent CLIs, backend connectivity. |
| `dalecode providers` | Agents seen by the Multica daemon + the t3code provider set the bridge can launch directly. |
| `dalecode stop` / `restart` / `logs [-f] [-n N]` | Pass through to `multica daemon …`. |
| `dalecode install-multica [--yes]` | Print (or with `--yes` run) the Multica install command: Homebrew tap, official install script, or PowerShell on Windows. |
| `dalecode multica <args…>` | Anything else on the Multica CLI, unchanged (e.g. `dalecode multica login --token mul_…`). |
| `dalecode unlink` | Remove the stored link. |

Environment fallback (CI / containers): `DALECODE_URL`, `DALECODE_RUNTIME_ID`, `DALECODE_TOKEN` (legacy `CONVEX_URL` / `HARNESS_RUNTIME_ID` / `HARNESS_RUNTIME_TOKEN` still work). `DALECODE_HOME` overrides the config directory; `MULTICA_BIN` overrides the Multica binary.

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
npm version patch
npm publish --access public   # prepublishOnly runs the bundle
```

The package name `dalecode` is unclaimed on npm at the time of writing.
