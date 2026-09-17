# TAH-81 — リモート: マシン画面の操作付きストリーム

Issue: [TAH-81](https://linear.app/tahcode/issue/TAH-81/)  
親: [TAH-69](https://linear.app/tahcode/issue/TAH-69/) / [`docs/workbench-tah69.md`](workbench-tah69.md)

リモートタブを「画面共有は未接続」のまま終わらせない。**Microsoft RDP / VNC スタックは置かない。** ブリッジが JPEG / PNG を撮り、Convex `_storage` のファイル URL を Remote 面に出し、同じセッションへキー / マウスを返す。見た目は [Beautiful UI Agent Screen](https://www.beautifului.dev/)（ページ末尾、`AgentScreen.tsx`）。停止は既存のジョブ中断（[TAH-13](https://linear.app/tahcode/issue/TAH-13/)）。

UI に OpenConnector / OOMOL / gateway / workers.dev は出さない。製品面のラベルは **プラグイン**。

---

## 1. この OSS / 製品ではこうできていた

### Beautiful UI — Agent Screen

この製品ではこうできていた: エージェントの画面をカードで見せ、Open でキャンバスを広げ、カスタムカーソルと Connecting スピナーを持つ。npm パッケージは無い。tahcode は見た目・密度・キャンバス・操作感をポートする（丸コピーしない）。

- [beautifului.dev](https://www.beautifului.dev/) — 末尾 **Agent Screen**（Working / Loading）
- 根拠ファイル名: `AgentScreen.tsx`（キャプション: Watch an agent's screen — open, teach a task, record.）

### t3code — フレームループ。デスクトッププロトコルではない

この OSS ではこうできていた: 右パネルのプレビューは Chromium guest の **ページキャプチャ**。PR #4397 は CDP `Page.screencast` をやめ、共有の `capturePage` ループで JPEG フレームを取る。

- [pingdotgg/t3code](https://github.com/pingdotgg/t3code) [#4397](https://github.com/pingdotgg/t3code/pull/4397)

### Computer Use — screenshot + 座標アクション

この製品ではこうできていた: ディスプレイの PNG を間欠で取り、クリック / キーを座標で返す。Windows 専用 RDP ではない。

- Anthropic: [Computer use](https://docs.anthropic.com/en/docs/agents-and-tools/computer-use)

---

## 2. 対応表

| 出典 | tahcode |
| --- | --- |
| Beautiful UI Agent Screen | `AgentScreenCanvas` / Remote のウィンドウクロム |
| t3code `capturePage` | `runtime/src/screenCapture.ts` |
| Computer Use の click / type | `screenInputs` + `runtime/src/screenInput.ts`（cliclick / osascript / xdotool） |
| 能力ビット | `screen`（CLI **0.1.4+**）と `screenInput`（**0.1.5+**） |
| オフライン / 旧 CLI | Terminal / Browser と同じ `MachineNeeded` / 更新 CTA |
| 停止 | `useCancelJob`（TAH-13） |

---

## 3. この PR の範囲

| 面 | この PR | 残すもの |
| --- | --- | --- |
| リモート | オンライン + `screen` で最新フレーム。`screenInput` でキー / マウス。poll 約 0.5s | WebRTC、Windows キャプチャ、Microsoft RDP |
| オフライン | `MachineNeeded` | — |
| 旧ブリッジ | `screen` なし → 更新 CTA。`screenInput` なし → 閲覧のみ + 更新チップ | — |
| 右レール幅 | ビューポートに対する **比率**。ドラッグした割合を維持 | — |
| `+` ピッカー | `pointer-events: auto`。リサイズハンドルはタブ下 | — |
| 停止 | active job があるときだけ | 画面キャプチャ専用の stop |

**嘘をつかない:** `frameUrl` が無い限り「接続済みデスクトップ」は出さない。古いフレームは「更新が止まっています」。

---

## 4. 自動テスト

- 契約: `tests/workbench-screen.test.ts`
- Convex: `tests/convex/workbench-screen.test.ts`（capability 拒否、HID enqueue、他 Org 隠し）
- ブリッジ: `tests/runtime-screen-capture.test.ts` / `tests/runtime-screen-input.test.ts`
- シェル: `tests/workbench.test.ts`（比率、ピッカー、Agent Screen）

**主張しないこと:** この Cloud Agent 環境にオンラインの Mac ブリッジと画面収録許可は無い。実フレームの目視は手元の手動確認が正本。

---

## 5. 手動確認（Mac・ブリッジ online）

前提: `tahcode@0.1.5` を入れ直し、`tahcode restart`。画面収録とアクセシビリティを許可。

```bash
npm i -g tahcode@0.1.5
tahcode restart
```
