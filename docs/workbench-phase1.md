# 検証ワークベンチ Phase 1（TAH-34）

Issue: [TAH-34](https://linear.app/tahcode/issue/TAH-34/右サイドバーを-codext3code-型ワークベンチにする)  
関連: [TAH-39](https://linear.app/tahcode/issue/TAH-39/)（ヘッダー固定トグル） / [TAH-69](https://linear.app/tahcode/issue/TAH-69/)（4 面の本番配線） / [TAH-13](https://linear.app/tahcode/issue/TAH-13/)（ジョブ中断）

旧 Context / Runtime / Team は設定寄りで、PR #33 で隠した。このスライスは同じ場所を **再表示せず再定義**する。Settings は従来どおり `RuntimePane` / `TeamPane` をフル幅で使う。

UI に OpenConnector / OOMOL / gateway / workers.dev は出さない。

---

## 1. 採用した IA

```
本線（中央）= 話す場所
右レール     = 検証する場所（closable pane deck）

タブ: サイドチャット | ターミナル | ブラウザ | リモートデスクトップ
ヘッダー右: 検索（⌘K）+ レール開閉（TAH-39 の固定クラスタ）
```

本線チャットはメンション規則とジョブ履歴の正本。サイドチャットは副スレッドで、Phase 1 はブラウザ localStorage の下書きだけ。Remote の「停止」は Remote *stop 単独パネルではなく、リモートセッション面のコントロール（既存 `jobs.cancel`）。

---

## 2. エビデンス（この OSS / 製品ではこうできていた）

形式は「この OSS ではこうできていた」。丸コピーはしない。tahcode は multi-harness のまま。

### Codex app — 右は検証ワークベンチ

この製品ではこうできていた: スレッドの右サイドパネルから **Files / Side chat / Review / Terminal / Browser** を選ぶ。チャットは「話す場所」、右は「検証する場所」。パネルはスレッドごとに開閉でき、メニュー順は Review / Terminal / Browser / Files / Side chat。

- GitHub `openai/codex` [#41406](https://github.com/openai/codex/issues/41406) — 「panel menu: Review, Terminal, Browser, Files, Side chat」
- GitHub `openai/codex` [#24765](https://github.com/openai/codex/issues/24765) — 「Files, Side chat, Browser, and Terminal can be selected from the side panel」
- Unlock AI Codex 系ガイド（既存整理: [`docs/ux-shell-design.md`](ux-shell-design.md)）: 右は files / browser / terminal / 実行結果

tahcode への写し方: Phase 1 は Codex の検証面のうち **Side chat / Terminal / Browser** を第一級タブにする。Files / Review は実データが無いので出さない（TAH-34 の任意・後続）。

### OpenAI Codex — in-app browser は第一級

この製品ではこうできていた: 組み込みブラウザはローカル開発サーバ・ファイルプレビュー・注釈・エージェントとの共有ビュー。CLI / IDE 拡張には無く、アプリの右（または専用）面。手順は「ターミナルで dev server → URL を開く → 描画を diff と並べて見る → 注釈」。

- 公式: [Browser | Codex / ChatGPT Learn](https://developers.openai.com/codex/app/browser)
- ショートカット Cmd+Shift+B でブラウザを開く、アドレス欄から履歴検索

tahcode への写し方: **ブラウザ**タブを第一級にする。Phase 1 は URL 欄付きのプレビュー枠（disabled）と empty。iframe / webcontents / 注釈は後続。

### t3code — preview / terminal は chat 外の右パネル

この OSS ではこうできていた: `ChatView` が右パネル kind（`preview` など）を持ち、`rightPanelStore` が開閉と永続を持つ。プレビューは `PreviewPanel`、ターミナルは `ThreadTerminalDrawer`（Ghostty WASM / 複数 split）。ターミナル内リンクは設定により埋め込みプレビューへ開く。

- [pingdotgg/t3code](https://github.com/pingdotgg/t3code) `apps/web/src/components/ChatView.tsx` — `activeRightPanelKind === "preview"`, `rightPanelState.isOpen`
- `apps/web/src/rightPanelStore.ts` — スレッド横のパネル状態を永続
- `apps/web/src/components/RightPanelTabs.tsx` — Diff / files / preview の切替
- `apps/web/src/components/preview/PreviewPanel.tsx` / `openTerminalLinkInPreview.ts`
- `apps/web/src/components/ThreadTerminalDrawer.tsx`
- DeepWiki: [Terminal Integration](https://deepwiki.com/pingdotgg/t3code/3.4-terminal-integration), [Frontend](https://deepwiki.com/pingdotgg/t3code/3-frontend-application)

tahcode への写し方: 右は closable deck。開閉とアクティブ面を `localStorage`（既存 `useStoredState`）に残す。PTY / Ghostty は移植しない。

### VS Code — Secondary Side Bar + Panel

この製品ではこうできていた: 左が Primary Side Bar、右が **Secondary Side Bar**（⌥⌘B / Ctrl+Alt+B）。Chat は Secondary に載る。Terminal / Problems / Output は下の Panel（Ctrl+`）。レイアウトは記憶される。タブ列はスクロール、右側のパネル操作は固定。

- [Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout) — Toggle Secondary Side Bar
- [Terminal Basics](https://code.visualstudio.com/docs/terminal/basics/)
- [Chat view](https://code.visualstudio.com/docs/copilot/chat/chat-view) — Chat は Secondary Side Bar

tahcode への写し方: 右レール = Secondary 相当の closable deck。ターミナルを下パネルに分けない（Codex / t3code / TAH-69 の「右 4 面」に合わせる）。開閉はヘッダー固定クラスタ（#70 / TAH-39）。

### Cursor — 右 Apps パネルに Browser + Terminal

この製品ではこうできていた: Agents / Glass の右 **Apps Panel** に Browser と Terminal が同居。パネル全体の隠す操作は Cmd+Option+B（Hide Apps Panel）。チャットは本線、検証面は右。

- Cursor Forum: [Agents Window terminal toggle](https://forum.cursor.com/t/agents-window-cmd-j-ctrl-cannot-hide-the-terminal-they-spawn-a-second-one-there-is-no-working-toggle/169156) — 「Cmd+Option+B hides the whole right panel where the terminal lives」

tahcode への写し方: ヘッダーの PanelRight は **デッキ全体**の開閉。個別タブの破棄はしない。

### リモートデスクトップ（Remote *stop だけでは足りない）

Linear TAH-34 原文の「Remote stop」は TAH-13 interrupt との整合。プロダクトオーナー意図と TAH-69 は **リモートセッション面**（画面閲覧 / 操作の受け皿）。停止はその面のコントロール。

この製品ではこうできていた:

- Codex Computer Use / in-app browser は「共有ビューで操作し、結果を同じ面で確認」([docs](https://developers.openai.com/codex/app/browser))
- t3code の right panel には devices 面がある（`rightPanelStore` のパネル種別）
- TAH-69: Grok Bot 系の「サイドチャットとデスクトップ閲覧の分離」

tahcode への写し方: タブラベルは **リモートデスクトップ**。中の「停止」は `useCancelJob`（Composer / TAH-13 と同じ `jobs.cancel`）。RDP / VNC は後続。

### 反パターン（やらない）

- 旧 Context / Runtime / Team を workbench タブとして再表示する（#33 の判断と矛盾。設定は Settings）
- 中身の無い Files / Diff を出して偽の IDE にする
- サイドチャットを本線 `messages` に混ぜる（メンション規則が壊れる）
- UI に OpenConnector / OOMOL / gateway / workers.dev を出す

---

## 3. Phase 1（この PR）と後続

| 面 | Phase 1 | 後続（TAH-69 以降。この PR ではブロックしない） |
| --- | --- | --- |
| シェル | 開閉・幅 360px・4 タブ切替。xl ドック / 未満シート | リサイズ、最大化、スレッドごとの開いている面インジケータ |
| 永続 | `th:workbench:docked` / `th:workbench:panel`（`useStoredState`） | スレッド単位のパネルセット（Codex #41406） |
| サイドチャット | ローカル下書きスレッド。Convex スキーマなし | 別 `kind`、ACL、メンション、本線と履歴分離 |
| ターミナル | 端末枠 + PTY 待ち empty。オフラインは「オンラインのマシンが必要」 | node-pty / ブリッジ PTY、tool ログ、リンク→プレビュー |
| ブラウザ | disabled アドレス欄 + プレビュー枠 | iframe / webcontents、注釈、localhost 許可 |
| リモート | セッション枠 + **停止**（active job → `jobs.cancel`） | RDP / VNC / 画面ストリーム |
| Files / Diff | 出さない | ランタイムが構造化 diff / ファイル樹を返してから |

ヘッダートグルは TAH-39 の `data-shell-header-tools` に常設。`RIGHT_RAIL_SECTION_ENABLED` ではゲートしない（あれは旧設定タブ用で、すべて false のまま）。

---

## 4. 本線とサイドチャット

|  | 本線 | サイドチャット |
| --- | --- | --- |
| 役割 | チーム会話 + エージェントジョブ | 検証中の短いメモ / 副質問 |
| 履歴 | Convex `messages` | Phase 1 は `localStorage` のみ |
| メンション | `@provider/model` がジョブを起こす | 起こさない |
| タブ | 上部チャットタブ | 右デッキの一面 |

---

## 5. 実装パス

- `src/harness/workbench/panels.ts` — 4 面のカタログ
- `src/harness/workbench/state.ts` — 開閉 / アクティブ面の永続
- `src/harness/rail/RightRail.tsx` — デッキシェル
- `src/harness/Shell.tsx` — `rail` が true ならトグル常設
- Settings の Runtime / Team は `src/pages/SettingsPage.tsx` のまま
