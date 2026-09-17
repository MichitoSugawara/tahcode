# TAH-81 — リモート: マシン画面ストリームの最小形

Issue: [TAH-81](https://linear.app/tahcode/issue/TAH-81/)  
親: [TAH-69](https://linear.app/tahcode/issue/TAH-69/) / [`docs/workbench-tah69.md`](workbench-tah69.md)

リモートタブを「画面共有は未接続」のまま終わらせない。**フル RDP / VNC は作らない。** ブリッジが JPEG / PNG を撮り、Convex `_storage` のファイル URL を Remote 面に出す。停止は既存のジョブ中断（[TAH-13](https://linear.app/tahcode/issue/TAH-13/)）。

UI に OpenConnector / OOMOL / gateway / workers.dev は出さない。製品面のラベルは **プラグイン**。

---

## 1. この OSS / 製品ではこうできていた

### t3code — フレームループ。デスクトッププロトコルではない

この OSS ではこうできていた: 右パネルのプレビューは Chromium guest の **ページキャプチャ**。PR #4397 は CDP `Page.screencast` をやめ、共有の `capturePage` ループ（おおよそ 12 FPS）で JPEG フレームを取る。PiP もそのフレームを描く。デバイス面には `device_screenshot`。どれも RDP / VNC スタックではない。

- [pingdotgg/t3code](https://github.com/pingdotgg/t3code) [#4397](https://github.com/pingdotgg/t3code/pull/4397) — `capturePage` frame loop
- DeepWiki: [MCP & Preview Automation](https://deepwiki.com/pingdotgg/t3code/5.9-mcp-and-preview-automation) — `preview_snapshot` / `device_screenshot`
- t3code のリモートは「エージェントセッションを見る」であり、Windows 画面全体の RDP ではない（[解説](https://knightli.com/en/2026/07/29/t3-code-windows-remote-control-codex-claude-code/)）

tahcode への写し方: 同じ「1 枚の正直なフレーム」を既存 tahcode ブリッジ + Convex 能力チャネルに載せる。第二のデーモンも、WebRTC も、RDP サーバも置かない。

### Computer Use — screenshot ツール

この製品ではこうできていた: エージェントはディスプレイの PNG / JPEG をツール結果として受け取る。連続映像ではなく、間欠フレーム。

- Anthropic: [Computer use](https://docs.anthropic.com/en/docs/agents-and-tools/computer-use) — `screenshot`
- OpenAI Codex 右面は検証ワークベンチ（Browser / Terminal）。画面共有は「共有ビュー」でありフルデスクトッププロトコルではない（[Browser](https://developers.openai.com/codex/app/browser)）

---

## 2. 対応表

| 出典 | tahcode |
| --- | --- |
| t3code `capturePage` / `device_screenshot` | `runtime/src/screenCapture.ts`（`screencapture` / grim / scrot） |
| Computer Use の 1 フレーム | Convex `_storage` + `screenSessions.storageId`（URL は query 時に `getUrl`） |
| 能力ビット | heartbeat `capabilities: ["screen"]`（CLI **0.1.4+**） |
| オフライン / 旧 CLI | Terminal / Browser と同じ `MachineNeeded` / 「更新コマンドをコピー」 |
| 停止 | `useCancelJob`（TAH-13）。画面セッションの stop ではない |

---

## 3. この PR の範囲

| 面 | この PR | 残すもの |
| --- | --- | --- |
| リモート | オンライン + `screen` で最新フレーム。poll 間隔 1.5s。フレーム無しは「待ち」または失敗 | キー / マウス、WebRTC、連続映像、Windows キャプチャ |
| オフライン | `MachineNeeded` | — |
| 旧ブリッジ | `screen` 未報告 → 更新 CTA | — |
| 停止 | active job があるときだけ | 画面キャプチャ専用の stop |

**嘘をつかない:** `frameUrl` が無い限り「接続済みデスクトップ」は出さない。古いフレームは「更新が止まっています」。

---

## 4. 自動テスト

- 契約: `tests/workbench-screen.test.ts`（能力ビット、render mode、JPEG magic）
- Convex: `tests/convex/workbench-screen.test.ts`（open → claim → report、capability 拒否、他 Org 隠し、フレーム無しは URL null）
- ブリッジ: `tests/runtime-screen-capture.test.ts`（darwin / linux のコマンド選択、DISPLAY 無しは fatal）
- シェル: `tests/workbench.test.ts`（スタブ「画面共有は未接続」を出さない）

**主張しないこと:** この Cloud Agent 環境にオンラインの Mac ブリッジと画面収録許可は無い。実フレームの目視は手元の手動確認が正本。

---

## 5. 手動確認（Mac・ブリッジ online）

前提: `tahcode@0.1.4`（`npm i -g tahcode@latest`）を入れ直し、`tahcode restart`。システム設定で画面収録を許可。能力 `screen` は **CLI 0.1.4+**。

1. 右レールを開き **リモート**。フレーム待ちのあと、マシン画面が 1 枚以上出る。
2. タブを離すとキャプチャは止まる（セッション close）。戻すと再開。
3. ブリッジを止める → 「オンラインのマシンが必要です」。古い CLI → 更新コマンド。
4. 実行中ジョブがあるときだけ **停止** が有効（Composer と同じ）。

```bash
npm i -g tahcode@0.1.4
tahcode restart
```
