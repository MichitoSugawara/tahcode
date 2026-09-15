# UX シェル設計（TAH-32–39 / 45）

Codex / t3code / Multica / 一般 SaaS・IDE 慣習に寄せた tahcode シェルの決定と未着手項目。丸コピーはしない。

## 在庫（2026-09-14）

GitHub PR #33 / #34 / #35 は **別チケット** を運んだ。TAH-32–39 は当時すべて Backlog のまま。

| Issue | 内容 | #33–#35 | このスライス |
| --- | --- | --- | --- |
| TAH-31 | 左下ユーザーメニュー。ランタイムフッター削除 | **#35 で Done** | — |
| TAH-29 / 30 | プロバイダアイコン + TraitsPicker 相当 | **#34 で Done** | — |
| （背景）右レール Context / Runtime / Team を隠す | 一時オフ。再表示ではない | **#33** | TAH-34 の前提 |
| TAH-32 | タブ: ミドルクリック閉じ + 右クリック | 未着手 | **実装**（右クリックは TAH-77 / #67。ミドルクリックはタブピル全体） |
| TAH-33 | セッション右クリック | 未着手 | **実装**（開く / バックグラウンドタブ / リンクコピー） |
| TAH-34 | 右レールを workbench に再定義 | 未着手 | **設計のみ**（下） |
| TAH-35 | 左サイドを Projects→Chats | 未着手 | **実装** |
| TAH-36 | 招待を 1 モーダルでメール+ロール | 未着手 | **実装**（メールは任意） |
| TAH-37 | セッション DnD でタブ/チャットへ | 未着手 | **実装**（Phase1: サイドバー → タブ条 / メイン面。text/plain フォールバック） |
| TAH-38 | rail: ホーム vs 新規、ランタイム→設定 | 未着手 | **実装**（ランタイムを rail から外す） |
| TAH-39 | ヘッダー右に検索 / レール操作を固定 | 未着手 | **実装**（タブ列 `overflow-x-auto`、右クラスタ `flex-none`） |
| TAH-45 | プロジェクトオプションモジュール枠 | 未着手 | **設計のみ**（下） |
| TAH-51 | エージェント行の「中断」をやめる | 未着手 | **実装**（停止は Composer 右の ■ のみ） |
| TAH-52 | コネクタアカウント削除を赤 / アイコンに | 未着手（#44 はグレー「削除」） | **実装**（赤 trash。確認ダイアログは残す） |
| TAH-53 | 「チャット」見出しの ＋ / 🔍 をやめる | 未着手 | **実装**（常時表示の ＋ / 🔍 はなし。#69 のホバー作成はプロジェクト／DM 見出しに残す） |

## 採用した IA

```
Org 切替
レール: 新しいチャット / ホーム / 招待 / プラグイン
プロジェクト
  ▼ Alpha
      General
  ▼ Beta
チャット
  ▼ パーソナル
      Personal DM
ユーザーメニュー（設定 / プラグイン / テーマ / サインアウト）
```

### TAH-35 — なぜ Projects が先か

- **Codex left rail**（Unlock AI Codex guide）: New chat / Search / Pinned / **Projects** / **Chats** / 下部 Settings。Projects がコンテナ、Chats がその文脈のスレッド。
- **反パターン（旧 tahcode）**: `groupsLabel="チャット"` の下に project groups。チャットの下にプロジェクトがぶら下がって見える。
- **t3code / Multica**: workspace / project が上、threads / sessions がその配下。
- 用語は tahcode の chat / project のまま。入れ子とラベル順だけ Codex に合わせる。
- Personal DM はプロジェクト外の **チャット** セクション（Codex の「プロジェクト文脈の外のスレッド」）。

### TAH-38 — ホームと新規、ランタイム

**決定（案 A の差別化）**

- **新しいチャット** を残す: フルページ `/o/:slug/new`（`NewChatPage`。デフォルト No project）。詳細は [`docs/new-chat-t3code.md`](new-chat-t3code.md)（TAH-68 / 67 / 69）。
- **ホーム** を残す: `HomePage` はダッシュボード（提案・ランタイム状態・DM コンポーザ）。Codex home はほぼ composer だが、tahcode のホームは作成フォームと同一ではない。
- **ランタイム** ラベルを rail から削除。実体は `goSettings` だった（ラベル嘘）。設定は TAH-31 のユーザーメニューとワークスペースメニュー。マシンは Settings `#runtimes` とコマンドパレット「ランタイムの利用許可を管理」。
- **招待** と **プラグイン** は rail に残す（作成 / チーム拡張。Settings 下部に全部寄せると到達が落ちる）。

エビデンス: Codex に "Runtime" 第一級ナビはない。t3code は Settings → Providers。Slack/Linear は作成とホームを分けるが、ホーム≠作成フォームのときだけ。

### TAH-39 — 固定ツールクラスタ

- タブ列: `flex-1 min-w-0 overflow-x-auto`（Chrome / VS Code / Cursor と同じ）。ヘッダー行自体も `min-w-0`。
- 右端: `flex-none` の検索（⌘K）と（フラグオン時）右レールトグル。タブ増減で押し出さない。`data-shell-header-tools` はスクロール行の兄弟。
- 右レールトグル: `RIGHT_RAIL_SECTION_ENABLED` がオンのときだけ。xl ではドック開閉、未満ではシート。TAH-34 実装後に常設化する前提。

### TAH-32 — タブ操作

| 項目 | 採用 | 根拠 |
| --- | --- | --- |
| ミドルクリックで閉じる | する | Chrome / Firefox / VS Code / Cursor |
| 閉じる / 他を閉じる / 右側を閉じる | する | 同左。学習コストゼロ |
| すべて閉じる | **しない** | 確認なしだと危険。Codex 系も Close All は控えめ |
| ⌘W | **デスクトップシェルのみ** | Web ではブラウザタブを閉じる。矛盾しない範囲 |

### TAH-33 — セッションメニュー

今あるバックエンドだけで副操作を出す。

| 項目 | 採用 | 根拠 |
| --- | --- | --- |
| 開く | する | Slack / Linear / Codex 行メニュー |
| バックグラウンドでタブを開く | する | Chrome「新しいタブで開く」= フォーカスせずタブ追加 |
| リンクをコピー | する | Linear / Slack |
| ピン / 改名 / 削除 | **しない** | `convex/chats` に未実装。フェイク UI を置かない |

破壊的操作が来たら confirm（Linear / Notion）。

### TAH-37 — DnD Phase 1

- ドラッグ源: サイドバーのセッション行。
- ドロップ先: 上部タブ条、メインチャット面。成功 = `goChat`（タブ追加 + フォーカス）。
- プロジェクト間並べ替え・ピン付近は **後続**。バックエンドに順序フィールドがない。
- 根拠: Codex の「一覧から作業面へ」。VS Code / Cursor の explorer → エディタ。クリック＝開く、DnD＝持っていく。

### TAH-36 — 招待 1 モーダル

- 同一面: メール（任意）+ ロール（member / admin）。
- メール空欄 = 現行どおりリンク共有。指定すると accept 時にアドレス拘束（既存 `createInvite.email`）。
- Slack / Linear / Notion / GitHub org invite と同じ「email + permission を一画面」。ウィザードは Add Provider 級の複雑さ向け。

### TAH-51 / TAH-53

- 停止は Composer 右の ■ のみ（ChatGPT / Codex）。行の「中断」は二重。
- セクション見出しの ＋ / 🔍 は、上部 New chat と ⌘K と重複。折りたたみはグループ行に残す。

### TAH-52 — コネクタアカウント削除

- #44 の詳細ダイアログは行右端にグレー quiet の「削除」テキストだった。
- 行アクションは **赤い trash アイコン**（`aria-label` は「{アカウント} を削除」）。確認ダイアログの主 CTA は従来どおり赤の「削除」。
- 1 行の `connectorConnections.remove` のみ。OpenConnector / OOMOL は出さない。
- 根拠: Grok Bot / Settings アカウント一覧は破壊操作をアイコンか赤で区別。Codex / IDE も危険アクションを主 CTA と並べない。

## TAH-34 — 右サイド workbench（実装しない）

TAH-69 の段階 ship と後続チケットは [`docs/new-chat-t3code.md`](new-chat-t3code.md) §7。

旧 Context / Runtime / Team は設定寄り。#33 で隠した判断と整合するので **再表示しない**。

Codex side panel（Unlock AI / in-app browser docs）: Files / Side chat / Review / Terminal / Browser = 「話す場所」と「検証する場所」の分離。t3code も preview / terminal が chat 外。

### Phase 案

1. **Phase 1（シェル）**: タブ切替 + 開閉。ヘッダー固定トグルは TAH-39 で受け皿だけ用意。
2. **Phase 2**: Remote stop（既存 TAH-13 interrupt と Composer 停止を集約表示）。Terminal stub（ランタイムの tool ログ）。
3. **Phase 3**: Browser / Files / Diff。ランタイムが構造化 preview / diff を返すまで stub 以上は出さない。
4. Side chat は本線スレッドと履歴を分けないとメンション規則が壊れる。別 `kind` が必要 → プロダクト決定待ち。

### 今やらない理由

- Files / Terminal / Browser の実データがない。空パネルを出すと偽物の workbench になる。
- Side chat の ACL / メンション / タブモデルが未決。

## TAH-45 — モジュール枠（実装しない）

本線は Chats / Sessions / Runtime。Kanban / Meetings は project（主）に足すオプション。

Slack / Notion / Linear はコアを薄くし、ボードやカレンダーはアプリ単位。Codex workbench も面を選んで開く（TAH-34 と同型）。tahcode の Skill Library も「選んで載せる」。

決めること（子チケット前）:

1. スコープ: project 単位か、org テンプレ + project override か。
2. 契約: `id` / ナビ露出 / Convex テーブル / agent tools・context。
3. 無効化時: データは残して隠す（推奨）か消すか。
4. Meetings のカレンダーはプラグイン面と組み合わせる。UI に OpenConnector / workers.dev は出さない。

Phase 0 = このメモ。実装は Phase 2a（enable フラグとナビ）から。
