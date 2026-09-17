# TAH-69 — ターミナル / ブラウザの実配線

Issue: [TAH-69](https://linear.app/tahcode/issue/TAH-69/)  
枠: [TAH-34](https://linear.app/tahcode/issue/TAH-34/) / [`docs/workbench-phase1.md`](workbench-phase1.md)（PR #71 のシェル）

Phase 1 の empty pane は「動く Terminal / Browser」ではない。このスライスは **pingdotgg/t3code を移植**し、I/O だけ tahcode の Mac ブリッジ + Convex 能力チャネルに載せ替える。新しいターミナルエミュレータも、第二のデーモンも作らない。

UI に OpenConnector / OOMOL / gateway / workers.dev は出さない。製品面のラベルは **プラグイン**。

---

## 1. この OSS ではこうできていた

### t3code — Ghostty ターミナル + 右プレビュー

この OSS ではこうできていた: Web 端末は `libghostty-vt` WASM（xterm 互換レイヤではない）。`ThreadTerminalDrawer` が複数 split を描画し、キーは Ghostty の C ABI で VT に落とす。ローカル `TerminalManager`（node-pty）へは WebSocket で `open` / `write` / `resize` / `output`。プレビューはデスクトップ Chromium guest を `openPreview` で開き、ナビは `previewBridge`。右パネル状態は `rightPanelStore`。

- [pingdotgg/t3code](https://github.com/pingdotgg/t3code) `packages/contracts/src/terminal.ts` — cols 1–1000 / rows 1–500、write 64KiB
- `apps/web/src/components/ThreadTerminalDrawer.tsx`
- `apps/web/src/terminal/ghostty/{core,runtime,renderer,keyCodes}.ts`
- `apps/web/src/terminal/ghostty/vendor/ghostty-vt.wasm`（630932 bytes）+ `ghostty-write-pty.wasm`（112 bytes）
- `packages/contracts/src/preview.ts` — http/https のみ、`PreviewInvalidUrlError`
- `apps/web/src/components/preview/{PreviewPanel,PreviewPanelShell,usePreviewBridge,previewBridge,openPreviewSession}.ts`
- `apps/web/src/rightPanelStore.ts` / `apps/web/src/components/RightPanelTabs.tsx`
- DeepWiki: [Terminal Integration](https://deepwiki.com/pingdotgg/t3code/3.4-terminal-integration)

tahcode への写し方: Ghostty の描画・キー・history replay はそのまま。WebSocket + node-pty の代わりに Convex `ptySessions` とブリッジの python3 `pty.fork`。Chromium guest の代わりにマシン側 `fetch` + スナップショット描画。右デッキ状態は既存 `workbench/state.ts`（#71）。

### Codex app — 右は検証面

この製品ではこうできていた: スレッド右から Terminal / Browser を選ぶ。チャットは話す場所、右は検証する場所。

- GitHub `openai/codex` [#41406](https://github.com/openai/codex/issues/41406)
- 公式 Browser: [developers.openai.com/codex/app/browser](https://developers.openai.com/codex/app/browser)

---

## 2. 対応表（t3code X → tahcode Y）

| t3code | tahcode |
| --- | --- |
| `packages/contracts/src/terminal.ts` | `shared/workbenchTerminal.ts` |
| TerminalManager + node-pty + WS | `convex/workbenchPty.ts` + `runtime/src/ptyHost.ts` |
| `ThreadTerminalDrawer` + Ghostty WASM | `TerminalPane` + `terminal/ghostty/*`（vendor WASM は t3code と同じバイト） |
| `GhosttyTerminalCore.encodeKey` | 同名クラス。WASM 未ロード時は `encodeTerminalKey` |
| `packages/contracts/src/preview.ts` | `shared/workbenchPreview.ts` |
| desktop Chromium + `previewBridge` / `openPreviewSession` | `convex/workbenchPreview.ts` + `runtime/src/previewFetch.ts` + `preview/PreviewFrame.tsx` |
| `rightPanelStore` / `RightPanelTabs` | `workbench/state.ts` / `panels.ts`（#71） |
| heartbeat なし（ローカルプロセス） | 既存 heartbeat の `capabilities: ["pty","preview"]` |

ブリッジは既存 `runtime/src/runner.ts` ループを伸ばすだけ。別デーモンは置かない。

---

## 3. この PR の範囲

| 面 | この PR | 残すもの |
| --- | --- | --- |
| ターミナル | オンライン連携マシンで type / run。Ghostty canvas。失敗時は VT フォールバック | 複数 split、Nerd Font、tool ログの別チャネル |
| ブラウザ | URL → マシン fetch → `iframe src` / `srcdoc` / text | デスクトップ Chromium guest、注釈、SPA の同一オリジン fetch |
| オフライン | `MachineNeeded` empty + CTA（#71） | — |
| 旧ブリッジ | 「更新コマンドをコピー」（`pty` / `preview` 未報告） | — |
| リモートデスクトップ | #71 の薄い枠 + ジョブ停止 | RDP / VNC |
| サイドチャット | TAH-80: Convex `sideChatTurns`（本線と分離、メンションはジョブなし） | エージェント応答 |

localhost HTML は `srcdoc` + `<base href>`。公開 https は `iframe src`。ホストされた Web からユーザマシンの localhost には届かないので、**描画の正本はブリッジが取ったスナップショット**。t3code の guest ほどインタラクティブではない。

---

## 4. 自動テスト（このリポで証明すること）

- 契約: `tests/workbench-terminal.test.ts` / `tests/workbench-preview.test.ts`（t3code の bounds / URL / renderer sizing）
- Convex: `tests/convex/workbench-pty.test.ts` / `workbench-preview.test.ts`（open → claim → write/output、http 以外拒否）
- ブリッジ: `tests/runtime-pty-host.test.ts`（行プロトコル + python3 がいる環境では実 PTY smoke） / `tests/runtime-preview-fetch.test.ts`
- シェル: `tests/workbench.test.ts`（スタブ文言を出さない）

**主張しないこと:** この Cloud Agent 環境にオンラインの Mac ブリッジは無い。Ghostty WASM のブラウザ初期化と、連携マシン上の対話は **手元の手動確認**が正本。

---

## 5. 手動確認（Mac・ブリッジ online）

前提: `tahcode@0.1.3`（`npm i -g tahcode@latest`）を入れ直し、`tahcode restart`。設定のランタイムがオンライン。Preview デプロイまたは `npm run dev` の Web。能力 `pty` / `preview` は **CLI 0.1.3+**。

1. 右レールを開き **端末**。プロンプトが出る。`pwd` → プロジェクト cwd。`ls` → 実ファイル。
2. Ghostty が落ちたらフォールバック `<pre>` でも同じキーが届く（Enter / Ctrl-C）。
3. **プレビュー**。`http://localhost:…`（マシンで listen 中）を開く → HTML が面に出る。
4. `https://example.com` を開く → iframe。`file:///etc/passwd` は拒否。
5. ブリッジを止める → 「オンラインのマシンが必要です」+ CTA。古い CLI（capability なし）→ 更新コマンド。
6. リモートの画面フレームと操作は [TAH-81](https://linear.app/tahcode/issue/TAH-81/) / [`docs/workbench-tah81.md`](workbench-tah81.md)（CLI 0.1.4+ の `screen`、0.1.5+ の `screenInput`）。サイドチャットは Convex 副スレッド（TAH-80）。

---

## 6. 実装パス

- `shared/workbenchTerminal.ts` / `shared/workbenchPreview.ts`
- `convex/workbenchPty.ts` / `convex/workbenchPreview.ts` / `convex/lib/workbenchAccess.ts`
- `runtime/src/ptyHost.ts` / `runtime/src/previewFetch.ts` / `runtime/src/runner.ts`
- `src/harness/workbench/TerminalPane.tsx` / `BrowserPane.tsx`
- `src/harness/workbench/terminal/` / `preview/`
