# Composer コンテキストバー（TAH-71）

Status: Implemented (phased)  
Date: 2026-09-15  
Issue: [TAH-71](https://linear.app/tahcode/issue/TAH-71/composer-上でプロジェクトマシンブランチ選択作成時はマシン別フォルダ任意)

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
[ 📁 プロジェクト ] [ 🖥 マシン ] [ ⑂ ブランチ ]
┌─────────────────────────────────────────────┐
│  大きな入力                                  │
│  +   モデル / オプション …              送信 │
└─────────────────────────────────────────────┘
```

ランタイム pill はバーに移した。Composer 内はプロバイダ / モデル / オプションだけ（添付スクショと同じ役割分担）。

### 2. プロジェクト選択

- プロジェクトチャット: バーは `chat.projectId` を表示。別プロジェクトを選ぶとそのプロジェクトの既存チャットへ（なければ作成ダイアログ）。チャットの `projectId` は書き換えない（TAH-68 の新チャット面と衝突しない）
- Home / Personal DM: 「プロジェクトなし」が既定。選ぶと org の composer 文脈だけが変わる（DM は DM のまま）
- 「新しいプロジェクト」は既存の `CreateProjectDialog`

### 3. マシン

オンラインで利用可能なランタイム + 「自動」。`org.setRuntimeId` と同じ永続化。オフライン / 許可なしは選べない。UI に OpenConnector / OOMOL / workers.dev / gateway は出さない。

### 4. ブランチ（Phase 1 はメタデータ）

Git checkout はブリッジにまだ無い。バーで名前を選び、エージェント context と localStorage（プロジェクトごと）に残す。既定は `main`。ランタイム側の実 checkout は後続。

### 5. マシン別フォルダ

新テーブル `projectRuntimeFolders`（`projectId` + `runtimeId` → `cwd`）。

- 作成時: マシンごとに任意。1 台だけでよい
- 解決順: そのマシンのマッピング。マップが 1 件も無いときだけ `projects.cwd`（レガシー）。どれか 1 台でもマップ済みなら、未マップのマシンはレガシー cwd を使わない
- 未マップのマシンでそのプロジェクトを使うときは、送信前に CTA「フォルダを指定」。黙ってジョブを投げない（クライアントで止める + サーバでも拒否）
- マップ 0 件の既存プロジェクトは従来どおり送信可（テストと既存データを壊さない）
- パス入力のみ。ディレクトリ picker は TAH-67

## やらないこと

- `/new` フルページや NewChatDialog の置換（TAH-68）
- デスクトップ / ブリッジの `pickDirectory`（TAH-67）
- 実 Git ブランチの列挙・checkout
- 右レールの再設計
