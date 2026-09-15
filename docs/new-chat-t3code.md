# 新しいチャット / フォルダ / 右サイド（TAH-68 / 67 / 69、バーは TAH-71）

Status: TAH-68 実装（この PR） / TAH-67・69 は設計と後続 / **TAH-71 は別エージェント**  
Date: 2026-09-15  
Issues:

- [TAH-68](https://linear.app/tahcode/issue/TAH-68/新しいチャットを-t3code-型フルページにするデフォルト-no-project)（今 ship）
- [TAH-67](https://linear.app/tahcode/issue/TAH-67/プロジェクトのフォルダ選択を使えるようにする)
- [TAH-69](https://linear.app/tahcode/issue/TAH-69/右サイドバー-terminal-browser-リモートデスクトップ-サイドチャット)
- [TAH-71](https://linear.app/tahcode/issue/TAH-71/composer-上でプロジェクトマシンブランチ選択作成時はマシン別フォルダ任意)（Composer コンテキストバー。**この PR では実装しない**）

シェル全体の在庫は [`docs/ux-shell-design.md`](ux-shell-design.md)。ここは New thread 面と、それに続くフォルダ / 右レールを切る。Composer コンテキストバーは TAH-71。

UI に OpenConnector / OOMOL / gateway / workers.dev は出さない。

---

## 1. 現状のギャップ（ファイル）

| 面 | いま | パス |
| --- | --- | --- |
| 新しいチャット | モーダル。場所必須。プロジェクトがあれば先頭プロジェクトを初期選択 | 削除: `src/harness/dialogs/NewChatDialog.tsx`。旧呼び出しは `Shell` / `CommandPalette` / `Composer` `/new` |
| ホーム | フルページ hero + composer。常に Personal DM | `src/pages/HomePage.tsx` + `src/harness/EmptyHero.tsx` |
| 空チャット | 既存スレッドの空状態 hero | `src/pages/ChatPage.tsx` |
| Composer 内コントロール | プロバイダ / モデル / 推論 / ランタイムは PromptBar 下段 | `src/harness/Composer.tsx` · `src/components/primitives/PromptBar.tsx` |
| ルート | `/o/:slug` と `/o/:slug/c/:chatId` のみ。`/new` なし | `src/App.tsx` · `src/lib/orgPaths.ts` |
| フォルダ | プロジェクト作成時の **手入力** `cwd` だけ。ディレクトリピッカーなし | `src/harness/dialogs/CreateProjectDialog.tsx` · `convex/projects.ts` · `convex/schema.ts` `projects.cwd` |
| チェックアウト表示 | Context ペインに `cwd:` を出すだけ（右レールはオフ） | `src/harness/rail/ContextPane.tsx` |
| Git ブランチ | スキーマも bridge 契約もない | — |
| 右レール | Context / Runtime / Team をフラグで全隠し | `src/harness/rail/flags.ts` · `src/harness/rail/RightRail.tsx` |
| Terminal / Browser / リモートデスクトップ / サイドチャット | コンポーネントなし。幽霊パネルも出していない | TAH-34 メモと同じ |

---

## 2. 目標 IA

```
レール「新しいチャット」 → /o/:slug/new          （デフォルト No project）
プロジェクト行の ＋     → /o/:slug/new?project=id （そのプロジェクトを初期選択）
ホーム                 → /o/:slug                 （ダッシュボード。作成フォームではない）
送信（No project）     → Personal DM
送信（プロジェクト）   → そのプロジェクトにチャットを作成して開く
```

見出し: **「{プロジェクト名 or プロジェクトなし} で何を作りますか？」**  
名前は点線 underline で切替（t3code New thread の project 切替）。

Composer 下段: 既存のプロバイダ / モデル / 推論 / ランタイム（スクショの Muse / Max / access に相当する tahcode の実コントロール。無い「Max」「Full access」は作らない）。

**Composer 周辺のコンテキストバー（プロジェクト / マシン / ブランチ、作成時のマシン別フォルダ）は [TAH-71](https://linear.app/tahcode/issue/TAH-71/composer-上でプロジェクトマシンブランチ選択作成時はマシン別フォルダ任意)。この PR では置かない。** 見出しの点線は TAH-68 の New thread 切替であり、バーのセレクタと二重にしない。

---

## 3. OSS / 製品エビデンス

形式は「この OSS ではこうできていた」。丸コピーはしない。tahcode は multi-harness のまま。

### t3code — New thread はフルページ

この OSS ではこうできていた: 新しいスレッドはモーダルではなく、中央ヒーロー + 大きな composer の専用面。見出しは “What should we build in **project**?”。モデル・推論・権限は composer 内ボトムバー。その下に Current checkout / branch。

- ユーザー添付スクショ（t3code New thread）
- [A deep dive into T3 Code](https://flaviocopes.com/t3-code/) — 「After adding a project, T3 Code opens the new-thread composer with the model, reasoning, permission, workspace, and branch controls together」
- リポジトリ: [pingdotgg/t3code](https://github.com/pingdotgg/t3code)

### t3code — checkout / branch は composer 周辺

この OSS ではこうできていた: スレッドの作業場所は composer 直下の `BranchToolbar` で選ぶ。Current checkout はプロジェクトに追加したディレクトリそのもの。worktree は別チェックアウト。

- [`apps/web/src/components/BranchToolbar.tsx`](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/BranchToolbar.tsx)
- [PR #4411](https://github.com/pingdotgg/t3code/pull/4411)
- Deep dive の “A project points to a directory” / “A workspace is the checkout used by a thread” / “Current checkout or new worktree”

tahcode への写し方: checkout / machine / branch の **選択 UI は TAH-71**（別エージェント）。この PR の New chat 面にはコンテキストバーも偽の checkout 行も置かない。フォルダが実際に選べて永続する契約は TAH-67。

### t3code — プロジェクト追加 = ディレクトリ

この OSS ではこうできていた: プロジェクトを足す操作はディレクトリを足すこと。Current checkout はその直下。

- Deep dive: “Add a project directory” → “Create a new thread”

tahcode は `projects.cwd` を既に持つが、入力が手打ちだけ（TAH-67）。

### Codex / 一般 IDE — 新規は専用面、設定は composer 内

この製品ではこうできていた: New chat はオーバーレイフォームではなく作業面。モデルや権限は入力欄の中。右レールは Files / Side chat / Review / Terminal / Browser で「話す場所」と「検証する場所」を分ける。

- 既存整理: [`docs/ux-shell-design.md`](ux-shell-design.md) TAH-34 / TAH-38
- Codex 左レール: New chat と Home を分ける（Unlock AI Codex 系ガイド。tahcode もホーム≠作成）

### Cursor — ワークスペースはフォルダ

この製品ではこうできていた: ワークスペースはフォルダ選択ダイアログか最近使ったパス。サイドパネルで Terminal / Browser / Chat を切替。

TAH-67 / TAH-69 の到達点。今は空の workbench を出さない（`ux-shell-design.md` と同じ）。

---

## 4. 段階 ship と依存

```
TAH-68 フルページ New chat（この PR）
        │  コンテキストバーは置かない
        │
        ├─ TAH-71 Composer コンテキストバー（別エージェント）
        │         プロジェクト / マシン / ブランチ + 作成時マシン別フォルダ任意
        │
        ├─ TAH-67 フォルダ選択が完了する（bridge / 永続）
        │         バーの入力は TAH-71 に載せる。ここで第二の checkout 行を足さない
        │
        └─ TAH-69 右レール 4 面
                  依存: オンラインマシン、構造化 preview / PTY / 画面、サイドチャットの kind
```

TAH-68 は 67 / 69 / 71 をブロックしない。69 はチャット作成と独立。71 は 68 のページにバーを足す。

---

## 5. TAH-68 — この PR でやること

受け入れ（Linear）:

1. New chat がフルページ（モーダルではない）
2. モデル等のコントロールが composer 内
3. 初回デフォルトが No project
4. No project のまま送れる / プロジェクトを選んでから送れる
5. 見出しでプロジェクト切替（点線 underline）
6. OpenConnector / OOMOL / gateway / workers.dev を出さない

実装の対応:

| 受け入れ | 実装 |
| --- | --- |
| フルページ | `/o/:slug/new` · `src/pages/NewChatPage.tsx`。`NewChatDialog` 削除 |
| composer 内コントロール | 既存 `Composer` + `PromptBar` の `tall` |
| デフォルト No project | `resolveNewChatProjectId` はクエリ無し / 不明 id → `null`。レール「新しいチャット」は `goNewChat()` |
| No project で送信 | Personal DM（既存 `kind: "dm"`。スキーマにプロジェクトなしスレッドを増やさない） |
| プロジェクトを選んで送信 | 初回送信で `createProjectChat`（タイトルは本文先頭行） |
| 見出し切替 | `NewChatProjectSwitch`。`?project=` を replace |
| 禁則コピー | 新規文言にインフラ名を入れない |

再利用: `EmptyHero`（greeting なし / 中央揃え）、`Composer`（`ensureChat` / `hideHint`）、`Shell` レール。`afterComposer` は EmptyHero に残してある（TAH-71 用。この PR の New chat では未使用）。

やらない（Linear + スクショの外 / 他チケット）:

- タイトル / 公開範囲フォーム（旧モーダル。スクショに無い）
- 「Max」「Full access」の偽物
- **Composer コンテキストバー**（プロジェクト / マシン / ブランチセレクタ、偽の checkout 行）→ [TAH-71](https://linear.app/tahcode/issue/TAH-71/composer-上でプロジェクトマシンブランチ選択作成時はマシン別フォルダ任意)
- フォルダダイアログ / マシン別フォルダマッピング → TAH-67 + TAH-71
- 右レール 4 面（TAH-69）

---

## 6. TAH-71 — Composer コンテキストバー（この PR 外）

[TAH-71](https://linear.app/tahcode/issue/TAH-71/composer-上でプロジェクトマシンブランチ選択作成時はマシン別フォルダ任意) が別エージェントで所有する。

- Composer 上（または直上）で **プロジェクト / マシン / ブランチ** を選ぶ
- プロジェクト作成時、マシンごとにフォルダを **任意** 設定
- 未マップのマシンではフォルダ選択を促す
- 置き場は灰色のコンテキストバー + 下の入力（TAH-71 添付）。t3code `BranchToolbar` と同じ周辺

この PR はフルページ New chat と見出しの No project 切替だけ。バーのセレクタを先回りして置かない。TAH-71 は `EmptyHero` / `Composer` / `NewChatPage` に載せる想定。

---

## 7. TAH-67 — フォルダ選択（後続）

### 症状

新しいチャットやプロジェクト設定から、マシン上のディレクトリを選び切れない。`cwd` は手入力。

### 期待（Linear）

- マシン（bridge）上のディレクトリを選べる
- 結果がプロジェクト / スレッド文脈に残る
- No project のまま進む経路と両立する

### フェーズ

1. **契約** — bridge がディレクトリ列挙（またはデスクトップの native picker）を返す。Web の `showDirectoryPicker` は bridge のパスに届かないので主経路にしない。
2. **永続** — 選んだパスを `projects.cwd` に書く。No project のときはチャット / ランタイムに付けない（プロジェクトを作るか、後で選ぶ）。
3. **UI の置き場** — 選択バーは TAH-71。この PR / TAH-67 で New chat に第二の「作業ディレクトリ」行を足さない。
4. **最近使ったパス** — Cursor / Codex 慣習。任意。

### 今やらない理由

- CLI / desktop にフォルダ RPC が無い（`apps/desktop` に `showOpenDialog` なし）
- パスサンドボックスと ACL が未決
- 空の「選ぶ」ボタンは TAH-34 と同じ幽霊 UI

### 後続チケット案

- TAH-67a: bridge / desktop のディレクトリ列挙契約
- TAH-67b: 永続（プロジェクト / マシン別パス）を TAH-71 のバーに接続
- TAH-67c: git branch（ランタイムが返してから。セレクタ UI は TAH-71）

Composer 上のプロジェクト / マシン / ブランチと、作成時のマシン別フォルダ任意は **TAH-71**。重複実装しない。

---

## 8. TAH-69 — 右サイド（後続）

### 症状

Terminal / Browser / リモートデスクトップ / サイドチャットが使えない。導線もオフ。

### 期待（Linear）の 4 面

1. Terminal — マシン上のターミナル
2. Browser — 組み込み / 連携ブラウザ
3. リモートデスクトップ — マシン画面
4. サイドチャット — 本線横の副チャット

未接続時は「オンラインのマシンが必要」などの empty / CTA。幽霊ランタイム禁止。禁則コピーは TAH-68 と同じ。

### フェーズ（`ux-shell-design.md` TAH-34 を具体化）

1. **シェル** — タブ切替 + 開閉。ヘッダー固定トグルは TAH-39 の受け皿を常設化。旧 Context / Runtime / Team は再表示しない。
2. **Terminal stub** — ランタイムの tool ログ / 将来 PTY。オンラインマシンが無いときは CTA のみ。
3. **Browser / リモートデスクトップ** — ランタイムが構造化 preview / 画面を返すまで stub 以上は出さない。
4. **サイドチャット** — 本線と履歴を分けないとメンション規則が壊れる。別 `kind` が必要。プロダクト決定待ち。

### 今やらない理由

- Files / Terminal / Browser の実データが無い
- サイドチャットの ACL / メンション / タブモデルが未決
- 空パネルは偽物の workbench になる（TAH-34 と同じ判断）

### 後続チケット案

- TAH-69a: 右レール枠（4 タブ + empty CTA）。中身は未接続メッセージのみ
- TAH-69b: Terminal（PTY または tool ログ）
- TAH-69c: Browser
- TAH-69d: リモートデスクトップ
- TAH-69e: サイドチャット（`kind` 決定後）

本 issue は設計承認後に上へ分割してリンクする。

---

## 9. リスク / 未決

| 項目 | 判断（この PR） | 開き |
| --- | --- | --- |
| No project の送信先 | 毎回新しい `kind: "thread"`（TAH-75）。Personal DM はホーム専用の 1 本 | 旧実装は `/new` 送信で既存 DM に合流していた |
| プロジェクトチャットのタイトル | 本文先頭行。空なら「新しいチャット」 | 旧モーダルの手入力タイトルは捨てた |
| 公開範囲 | `inherit` 固定 | プライベート作成 UI はスクショに無い |
| スキルプロファイル | プロジェクトの `profileId` を継承 | ページ上の ProfilePicker は置かない |
| Composer コンテキストバー | **置かない** | [TAH-71](https://linear.app/tahcode/issue/TAH-71/composer-上でプロジェクトマシンブランチ選択作成時はマシン別フォルダ任意) |
| ブランチ / マシン選択 | 出さない | TAH-71 |

---

## 10. 検証

Preview は PR コメントの Cloudflare URL（`pr-<n>`）。Google OAuth は preview では使えない。

1. `test@test.com` / `test1234` でログイン → `/o/preview`
2. レール「新しいチャット」→ `/o/preview/new`（モーダルが無い）
3. 見出しが「**プロジェクトなし** で何を作りますか？」
4. composer 下段にプロバイダ / モデル（と推論があればそれ）がある
5. **プロジェクト / マシン / ブランチのコンテキストバーが無い**（TAH-71）
6. 送信 → **新しい空スレッド**が開く（既存 Personal DM ではない）
7. 見出しでプロジェクトを選んで送信 → そのプロジェクトにチャットができる
8. プロジェクト行の ＋ → `?project=` 付き。レールから入ったときと違い初期選択がある
9. ページソース / 画面に OpenConnector / OOMOL / gateway / workers.dev が無い

スクショ（preview 上）:

- `/o/preview/new` のフルページ（No project）
- プロジェクト切替メニューを開いた状態
- 送信後の新規スレッド / プロジェクトチャット

ユニット: `tests/new-chat.test.ts`（デフォルト No project、`/new` パス、モーダル削除）。

---

## 11. 後続（PR に残す）

- [TAH-71](https://linear.app/tahcode/issue/TAH-71/composer-上でプロジェクトマシンブランチ選択作成時はマシン別フォルダ任意): Composer コンテキストバー（別エージェント）
- TAH-67: フォルダ選択が完了する。バー UI は TAH-71
- TAH-69: 右レール 4 面。子 issue に分割して本 issue にリンク
- TAH-75: No project は `kind: "thread"`。Personal DM 再利用はしない
