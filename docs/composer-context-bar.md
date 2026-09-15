# Composer コンテキストバー（TAH-71 / TAH-72）

Status: Implemented (phased)  
Date: 2026-09-15  
Issue: [TAH-71](https://linear.app/tahcode/issue/TAH-71/composer-上でプロジェクトマシンブランチ選択作成時はマシン別フォルダ任意) · [TAH-72](https://linear.app/tahcode/issue/TAH-72/コンテキストバー-ブランチ失敗全オフライン時の-ux-注釈削除)

Composer 直上の灰色バーで **プロジェクト / マシン / ブランチ** を切り替える。モデル選択は従来どおり Composer 内。新しいチャットのフルページ化（TAH-68）とネイティブフォルダピッカー（TAH-67）は対象外。

## エビデンス

- ユーザー添付: 上段バー（フォルダ+プロジェクト / マシン / ブランチ）+ 下の大きな入力。モデルは入力内
- t3code [BranchToolbar.tsx](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/BranchToolbar.tsx) — Current checkout / branch / environment を composer 周辺に置く
- [t3code deep dive](https://flaviocopes.com/t3-code/)
- Codex / Cursor: スレッド文脈はプロジェクト・ワークスペース・ブランチを明示切替

関連: [TAH-68](https://linear.app/tahcode/issue/TAH-68)（新チャット / No project）、[TAH-67](https://linear.app/tahcode/issue/TAH-67)（フォルダ選択 plumbing）

## 既存に乗せる（新アーキテクチャを増やさない）

| 面 | そのまま使うもの |
| --- | --- |
| レイアウト | `EmptyHero` の `composer` スロット / `Thread` 下部の `Composer` |
| プロジェクト | `projects` + `OrgContext.projects`。チャットの `projectId` が一次ソース |
| マシン | 既存の `runtimes` + `org.runtimeId`（localStorage）。オンラインかつ `canUse` のみ選択可 |
| 作業ディレクトリ（レガシー） | `projects.cwd` はフォールバックのまま残す |
| フォルダ入力 | パスのテキスト。ネイティブ picker は TAH-67 |

## 決定

### 1. コンテキストバーは Composer の一部

`Composer` がバーを描く。Home / 空チャット / スレッドで同じ面になる。モーダル専用にしない。

```
┌─────────────────────────────────────────────┐
│ 📁 プロジェクト   🖥 マシン   ⑂ ブランチ   │  灰色トップ（上角だけ丸）
│  大きな入力                                  │  白。隙間なし・外枠は共有
│  +   モデル / オプション …              送信 │
└─────────────────────────────────────────────┘
```

ランタイム pill はバーに移した。Composer 内はプロバイダ / モデル / オプションだけ（添付スクショと同じ役割分担）。バーと入力は 1 枚のカード（`data-composer-shell`）。

### 2. プロジェクト選択

- プロジェクトチャット: バーは `chat.projectId` を表示。別プロジェクトを選ぶとそのプロジェクトの既存チャットへ（なければ作成ダイアログ）。チャットの `projectId` は書き換えない（TAH-68 の新チャット面と衝突しない）
- Home / Personal DM: 「プロジェクトなし」が既定。選ぶと org の composer 文脈だけが変わる（DM は DM のまま）
- 「新しいプロジェクト」は既存の `CreateProjectDialog`

### 3. マシン

オンラインで利用可能なランタイム + 「自動」。`org.setRuntimeId` と同じ永続化。オフライン / 許可なしは選べない（幽霊ランタイムを usable に見せない）。UI に OpenConnector / OOMOL / workers.dev / gateway は出さない。

オンラインランタイムが 0 のとき、Composer のプロバイダ / モデル / オプション picker は無効。理由は `COMPOSER_CATALOG_OFFLINE_MESSAGE`。CTA は既存の `NoRuntimeChrome`（登録 / 設定で確認）。静的カタログやオフラインマシンの最終報告を「今使える」ようには扱わない。

### 4. ブランチ（確定は成功時だけ）

バーに出る名前は **confirmed**（`org.composerBranch`）だけ。メニューで選んだ瞬間に確定しない。

`evaluateComposerBranchApply` が先に見る:

1. 名前が Git checkout の対象になりうるか（空・空白・`..` などは拒否。空を `main` に勝手にしない）
2. 同じ confirmed なら no-op（失敗扱いにしない）
3. ランタイム一覧の読み込み中なら確定しない
4. 指定マシンがオフライン、または自動でオンライン usable が 0 → 失敗
5. プロジェクトでフォルダ必須なのに未マップ → 失敗

失敗時は confirmed を書き換えない。toast + カード外のインラインエラー + CTA（再試行 / フォルダを指定 / マシンをオンラインにする・別のマシンを選ぶ）。楽観更新するなら失敗でロールバックするが、この経路は成功するまで書かない。

ブリッジに git checkout RPC はまだ無い。前提を満たしたときだけ intended branch を localStorage と send context に残す。成功 toast で「checkout した」とは言わない。ランタイム側の実 checkout が来たら、同じ apply 関数の後ろに載せて git エラーも `ok: false` にする。

既定は `main`。

### 5. マシン別フォルダ

新テーブル `projectRuntimeFolders`（`projectId` + `runtimeId` → `cwd`）。

- 作成時: マシンごとに任意。1 台だけでよい
- 解決順: そのマシンのマッピング。マップが 1 件も無いときだけ `projects.cwd`（レガシー）。どれか 1 台でもマップ済みなら、未マップのマシンはレガシー cwd を使わない
- 未マップのマシンでそのプロジェクトを使うときは、送信前に CTA「フォルダを指定」。黙ってジョブを投げない（クライアントで止める + サーバでも拒否）
- マップ 0 件の既存プロジェクトは従来どおり送信可（テストと既存データを壊さない）
- パス入力のみ。ディレクトリ picker は TAH-67

## 失敗 / オフライン UX（TAH-72）

| 状態 | バー | Composer |
| --- | --- | --- |
| ブランチ apply 失敗 | 表示は confirmed のまま | カード外 Notice + toast + CTA |
| 全マシン offline | オフライン行は選択不可 | プロバイダ / モデル disable + `NoRuntimeChrome` |
| 指定マシンだけ offline | 名前は指定中として残る | ブランチ切替は失敗。別マシン CTA |

Composer 直下の説明注釈（「@codex がこのチャットのエージェント · 別のモデルも指名できます · $imagegen」など）は置かない。生成中や「チャットを開くと送信できます」、オフライン理由だけ残す。

## エビデンス（失敗 / オフライン）

- t3code [BranchToolbar.tsx](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/BranchToolbar.tsx) — checkout / worktree を composer 周辺に置き、成功表示と実状態を揃える
- [t3code deep dive](https://flaviocopes.com/t3-code/)
- Cursor / IDE: リモートやエージェント実行環境が無いときモデル切替を無効にする
- 一般 SaaS: 依存リソース offline のコントロールは disable + CTA（登録 / 設定）

## やらないこと

- `/new` フルページや NewChatDialog の置換（TAH-68）
- デスクトップ / ブリッジの `pickDirectory`（TAH-67）
- 実 Git ブランチの列挙・checkout RPC
- 右レールの再設計
