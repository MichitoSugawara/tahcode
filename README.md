# Team Harness — チーム作業場 Phase 1

Multica-based チーム作業場と同じプロダクト構想の、最小チームチャット + オンマシン・コーディングエージェント。
Phase 1 の垂直スライス: Org / Project 作成、Personal DM + プロ젝트チャット、メンション応答、
履歴 + メンション + プロジェクトリンクのコンテキスト、t3code 由来プロバイダのマシンランタイム、
最小ロール + ランタイム許可。Convex（データ/リアルタイム）+ Cloudflare（ホスティング/ファイル）。

UI は [Beautiful UI](https://www.beautifului.dev/) のプリミティブと
[/harness](https://www.beautifului.dev/harness) のシェル構成をそのまま採用（shadcn レジストリ経由で導入）し、
配色は VS Code **Dark Green+**（kazelone.vscode-dark-green-plus）をトークンにマッピング。ダークが既定。
プロバイダ配線は https://github.com/pingdotgg/t3code の `builtInDrivers.ts`
（Codex / Claude / Cursor / Grok / OpenCode / Antigravity の6種）を移植。
Multica からは Org / member / project / chat の考え方と作成フローの型だけ借りた新規実装（フォークではない）。

![Project chat with a streamed agent reply](docs/ui-screenshots/20-agent-reply-final-codeblock-table.png)

## Scope（Phase 1）

- ✅ Org → Project 階層、プロジェクト可視性（org / private）+ プライベートチャットの per-chat 追加
- ✅ Personal DM（Phase 1 は owner-only）+ プロジェクトチャット
- ✅ エージェント応答: DM は常時、他は @mention（@agent / @codex / @claude / @cursor / @grok / @opencode / @antigravity / @rt-…）時のみ
  - 仕様: プロジェクトチャットでメンションなしで送信すると、Composer が既定プロバイダのメンション（例 `@codex`）を自動付与してから送る。サーバ側ルール自体はメンション必須のまま（`convex/messages.ts`）。素のメッセージを送りたい場合は現状 UI からは不可（Phase 1 の簡略化）
- ✅ コンテキスト = 直近履歴 + メンション + プロジェクトリンク（Focus なし）
- ✅ マシンランタイム（t3code 由来の headless CLI 実行）+ default deny のランタイム ACL（user / role 混在可）
- ✅ ロール: owner（全体）/ admin（招待 + 権限）/ member（見える範囲のみ）
- 🚫 対象外: Kanban/Issue、Focus モード、Codex Cloud / Cursor Cloud Agent、DM の後から共有 UI、Linear 連携、Cloudflare 上でのエージェント実行

## UI — Beautiful UI × Dark Green+

### 導入方法（shadcn レジストリ）

Beautiful UI は npm パッケージではなく **shadcn 互換のコンポーネントレジストリ**（`https://www.beautifului.dev/r/registry.json`）。
`components.json` に `@beautifui` 名前空間を登録済みで、プリミティブは次で追加・更新する:

```bash
npx shadcn@latest add @beautifui/thinking-state   # 例。foundation は registryDependencies で自動解決
```

インストール先は `src/components/atoms/*`（Button, EntityChip, ValuePill, Chip, StatusPill, SegmentedControl, TextRow）と
`src/components/primitives/*`。`src/app/beautifui/foundation.css` がトークン（`:root` / `.dark` / `@theme`）・
基本ルール・共有キーフレーム、`sidebar-nav.css` が SidebarNav の開閉演出。`shadow-plugin` は foundation が要求する依存。

### 採用したプリミティブと使い所

| プリミティブ | 使い所 |
|---|---|
| **SidebarNav**（移植: lucide アイコン、データ駆動化） | ワークスペース切替（Org）、New chat / Home / 招待 / ランタイムのレール、パーソナル + プロジェクト別チャットツリー、検索、52↔224px 折りたたみ |
| **PromptBar**（移植: デモ/口述/シェーダを除去、データ駆動化） | コンポーザ。`@` でエージェント + メンバー、`/` でコマンド、プロバイダ / ランタイムのピルピッカー、R2 添付チップ、⏎送信 / ⇧⏎改行、IME 対応 |
| **ThinkingState**（`working` prop を追加してライブ駆動） | ランタイムの `thinking` / `tool` イベントをそのままトレース行に。実行中はシマー + スピナー、完了で「N ステップ実行」に畳む |
| **LoadingState** | ジョブ受付待ち・接続待ち・画面ロード（ピクセルグリッド + 経過秒） |
| **CodeBlock** | 返信内のコードフェンス、ランタイム起動コマンド（コピー付き） |
| **ContextCards** | Context タブ「エージェントに渡すもの」（project link / 履歴 / メンション） |
| **TaskRows**（静的 `queued` / `failed` を追加） | Context タブ「実行履歴」（チャットごとのジョブ状態） |
| **GlideMenu** | すべてのメニュー / 選択肢の滑るホバー（ワークスペースメニュー、ロールメニュー、ダイアログの選択肢） |
| Button / StatusPill / ValuePill / Chip / SegmentedControl / TextRow / EntityChip(Monogram) | ボタン、ロール・状態ピル、件数、ハンドル、タブ切替、設定行、アバター |
| ハーネスの構成（`IceCreamHarness`） | 3 ペインシェル、チャットタブバー、ホームの登場ストーリーボード（blur → 定位置）、ユーザーバブル、返信の fade-up、浮かぶコンポーザと追従スクロール |

見送り（Phase 1 に対応する機能がないため未導入）: ApprovalCard（承認フローは Phase 1 外）、ToolChips / DiffTable（構造化 diff をランタイムが返さない）、
RecordsTable / FilterTable / InsightCards / Flowchart / FineTuneCard / SelectionActions / SearchList / ChatComposer(デモ)。

### テーマ（`src/app/theme.css`）

Dark Green+ の生トークンを `--dg-*` として保持し、Beautiful UI のセマンティックトークンに解決する:

| Dark Green+ | 値 | → Beautiful UI |
|---|---|---|
| editor.background | `#121712` | `--page`（メインペイン） |
| sideBar.background | `#0b140b` | `--canvas`（シェル / サイドバー） |
| panel.background | `#141d14` | `--surface`（カード / メニュー） |
| activityBar / titleBar | `#040f04` / `#020f02` | `--stripe-bg` / `--tooltip-bg` |
| accent | `#0e9c2d` | `--accent`（リング / フォーカス / 強調塗り） |
| accent bright | `#00ff00` | `--accent-ink`, `--caret`（ストリーミングカーソル、小さな強調のみ） |
| button.background / hover | `#077015` / `#0ab320` | `--btn` / `--btn-hover`（Button `accent`、送信ボタン） |
| foreground | `#c9c9c9` | `--ink` |
| border | `#0e9c2dcc` | `--line` / `--line-strong`（同じ色相を減光したヘアライン、フォーカスで強く） |
| selection | `#196626` | `::selection` |
| list.activeSelectionBackground | `#09710e` | `--active`（サイドバーのアクティブ行） |

ライトテーマはワークスペースメニューから切替（Beautiful UI の寒色ニュートラル + 同じ緑アクセント）。

### ジャーニー（すべて空 → 作成 → 成功で次の一手を提示）

1. **Auth** — `/login`（ログイン / 新規登録の切替）。`?next=` で招待リンクへ戻る。サインアウトはワークスペースメニュー
2. **First run** — Org がなければ `/welcome`。Org 作成（Owner になる）または招待トークンで参加 → 作成後は Personal DM が即使えるホームへ
3. **Org 切替 / 設定** — サイドバー上部のワークスペースメニュー（切替・新規・設定・招待・テーマ・サインアウト）、`/o/:slug/settings`
4. **プロジェクト作成** — Multica 型ダイアログ（名前、公開範囲 org / private、任意でリポジトリ URL と作業ディレクトリ）。作成すると「General」チャットが開く
5. **チャット作成 / 開く** — 「新しいチャット」ダイアログ（場所 = プロジェクト or Personal DM、タイトル、公開範囲）。開いたチャットは上部タブに並ぶ
6. **招待とロール** — Team タブ / 「メンバーを招待」（Admin 以上）。招待リンク `…/invite/<token>` を発行 → 受け取った人はサインイン後 `/invite/:token` で参加。ロール変更は Owner / Admin（Owner の付与は Owner のみ、最後の Owner は降格不可）
7. **ランタイム登録** — 「このマシンを登録」→ 一度きりのトークン + コピー可能な起動コマンド → 最初のハートビートで同じ画面が「接続されました + 検出した CLI」に変わる
8. **利用許可（default deny）** — 「許可を管理」ダイアログ。メンバー単位 / ロール単位を混在して付与・取消。所有者以外は許可があるまで「利用許可がありません」の説明付き
9. **チャット** — 返信はジョブ受付待ち → トレース → ストリーミング Markdown → CodeBlock / 表。`@` ピッカー、プロバイダ / ランタイムピッカー、プロジェクトリンクは Context タブ
10. **右レール** — Context（渡すもの・実行履歴・参加メンバー） / Runtime（マシンと許可、使用マシンの指定） / Team（名簿とロール）
11. **権限の行き止まり** — Member には「招待」が無効表示 + 理由、使えるマシンがなければコンポーザ上に理由と次の一手、見えないチャットは説明付きの空状態

スクリーンショット一覧: `docs/ui-screenshots/`（01 → 42 の順で上のジャーニーをなぞる。`localhost` のフェイク `codex` CLI で実際にジョブを流したもの）。

## Stack

- UI: Vite + React 19 + Tailwind v4 + Beautiful UI（shadcn レジストリ）+ Convex Auth（Password）+ react-router
- Data/realtime: Convex（`convex/`）。認証は Convex Auth Password。権限は custom function ラッパ + 共有アクセスロジック
- Hosting/files: Cloudflare（`worker/` + `wrangler.jsonc`、R2 バケット `FILES`）。ファイル本体は Worker（`/api/files`）経由で R2、メタデータは Convex `files`
- Providers: t3code の6ドライバを `shared/providers.ts`（カタログ）+ `runtime/src/providers.ts`（headless 実行）に移植
- Runtime: Node（`runtime/`、tsx 実行）。Convex をポーリングして headless CLI を起動

## ローカルで動かす

前提: Node 22+、npm。

```bash
npm install --legacy-peer-deps

# 1) Convex（匿名エージェントモード。Convex アカウント不要）
CONVEX_AGENT_MODE=anonymous npx convex dev

# 1b) Convex Auth 用の鍵をローカル backend に登録（初回のみ）
npm run setup:local-auth

# 2) Web（別ターミナル）
npm run dev        # http://127.0.0.1:43173

# 3) ファイル Worker（別ターミナル、R2 ローカル永続化）
npm run dev:files  # http://127.0.0.1:43174（Vite が /api/files をプロキシ）
```

`.env.local` は `npx convex dev` が生成（`VITE_CONVEX_URL=http://127.0.0.1:3210`）。
本番相当の確認: `npm run build` → `npm run preview:cf`（dist を Worker で配信）。

### マシンランタイム

1. Web UI で登録 → 右レール **Runtime** タブ →「このマシンを登録」（サイドバー下の CTA、`/runtime` コマンドでも可）。
   トークンは一度だけ表示されるので、表示されたコマンドをそのままコピーする。
2. プロバイダ CLI を1つ以上用意（t3code と同じ）:
   `codex login` / `claude auth login` / `agent login` / `grok login` / `opencode auth login`
3. 起動:

```bash
npm run runtime -- providers   # 検出確認
CONVEX_URL=http://127.0.0.1:3210 HARNESS_RUNTIME_ID=... HARNESS_RUNTIME_TOKEN=th_... npm run runtime -- run
```

DM で話しかけると常時応答、プロジェクトチャットでは `@codex 直して` のようにメンションする。
送信時に既定プロバイダのメンションが自動付与される（プロジェクトのみ）。

## 受け入れ基準の対応

1. Org / Project 作成 → `/welcome` と ワークスペースメニュー（Org）、サイドバーの ＋ / `/project`（Project、org/private + リソース）
2. DM / プロジェクトチャット → DM は Org 参加時に自動作成、プロジェクトチャットは「新しいチャット」ダイアログ / プロジェクト行の ＋
3. DM 常時 / 他はメンション時のみ → `shared/mentions.ts` + `convex/messages.ts:send`
4. Context = 履歴 + メンション + プロジェクトリンク → `convex/lib/context.ts`（ジョブに JSON 同梱、ランタイムがプロンプトに付与）
5. t3code 由来プロバイダで実行 → `runtime/src/providers.ts`（6種カタログ、`codex exec` / `claude -p` / `agent -p` / `grok` / `opencode run`）
6. 最小ロール + ランタイム許可 → Org ロール + `runtimeGrants`（default deny、machine owner 付与）
7. Convex + Cloudflare → Convex が全データ/リアルタイム、Worker + R2 がホスティング/ファイル

## スタブ・既知の制限

- **Antigravity**: headless CLI がないためランタイムは「未対応」表示 + ガイド文。カタログには含む。
- **Grok headless flags**: CLI の headless 引数は暫定（`grok --prompt`）。手元に CLI があれば `providers` コマンドで確認し、ずれていたら `runtime/src/providers.ts` の1箇所を直す。
- **プロジェクトメンバー追加 UI なし**: private project への追加は現状 `projects:addMember` 関数呼び出し（`npx convex run` 等）。UI は Org メンバー招待・ロール・ランタイム許可まで。
- **Org 名変更 / 削除なし**: 設定ページは表示のみ（Owner 向けの変更は後続フェーズ）。
- **ファイル配信**: 本番は R2 バインディング必須（`wrangler deploy` 前に `team-harness-files` バケット作成）。ローカルは `wrangler dev` のローカル永続化。
- **ファイル Worker に認証なし**: `/api/files` は誰でも POST/GET 可能（メタデータ登録側の Convex は認証必須）。本番公開前に Worker 側で Convex トークン検証を足すこと。
- **Convex デプロイ**: ローカルは匿名モード。本番 Convex へのリンクは未実施（`npx convex login` → 通常 `dev`/`deploy`）。
- **承認フロー**: headless 実行は非対話（権限は各 CLI 側の事前設定に委譲）。t3code の approval デシジョン同期は Phase 1 外。

## CI/CD（Convex + Cloudflare）

`.github/workflows/deploy.yml` が3系統を回す（PR → preview、push staging → staging、push production → production）。
共通処理は `.github/actions/deploy-stack` に集約: `env.mjs decrypt` → `mask-env.mjs` → `convex deploy --cmd cf:build`
（`--cmd-url-env-var-name VITE_CONVEX_URL` で本番 Convex URL を注入）→ `wrangler` → Convex 側に `SITE_URL` /
`JWT_PRIVATE_KEY` / `JWKS` を設定。`cf:build` は `vite build`（`dist/` を Worker の ASSETS として配信）。

### GitHub に設定する secrets（リポジトリ Settings → Secrets）

| secret | 用途 |
|---|---|
| `DOTENV_PRIVATE_KEY_PREVIEW` | `.env.preview.enc` の復号鍵 |
| `DOTENV_PRIVATE_KEY_STAGING` | `.env.staging.enc` の復号鍵 |
| `DOTENV_PRIVATE_KEY_PRODUCTION` | `.env.production.enc` の復号鍵 |

各 `.env.<name>`（平文・gitignore、`.env.<name>.enc` のみコミット）が持つ変数:

| 変数 | 用途 |
|---|---|
| `CONVEX_DEPLOY_KEY` | `convex deploy` / `convex env set` の認証 |
| `CLOUDFLARE_API_TOKEN` | wrangler の認証 |
| `CLOUDFLARE_ACCOUNT_ID` | wrangler のデプロイ先 |
| `JWT_PRIVATE_KEY` / `JWKS` | Convex Auth の署名鍵（本番・staging・preview deploy ごとに設定される） |

`VITE_CONVEX_URL` は CI が自動注入するため保存不要。

### env ファイルの運用

```bash
# .env.example を元に .env.production を作る（平文・コミット禁止）
npm run env:enc -- production   # .env.production.enc を生成 → コミットする
npm run env:dec -- production   # 復号の確認（平文は捨てる）
```

鍵（`DOTENV_PRIVATE_KEY_*` の値）は各自 `openssl rand -hex 32` 等で生成し、GitHub secret と手元で共有する。
`env:enc` / `env:dec` 実行時は対応する `DOTENV_PRIVATE_KEY_<NAME>` をシェルに export すること
（dotenvx がファイル名のサフィックスから鍵名を解決する。未設定だと `.env.keys` が生成されるが gitignore 済み）。
初回は `.env.preview.enc` / `.env.staging.enc` / `.env.production.enc` が未コミットのため preview/staging/production
ジョブは復号で失敗する。実シークレットは絶対にコミットしないこと。

### Environments と wrangler

- preview: `wrangler versions upload --preview-alias pr-<番号>`（環境 `preview`、PR に URL コメント）
- staging: `wrangler deploy --env staging`（`team-harness-staging` + `team-harness-files-staging`）
- production: `wrangler deploy --env=""`（トップレベル `team-harness` + `team-harness-files`）+ `convex --prod`

R2 バケット（`team-harness-files` / `team-harness-files-staging`）は初回デプロイ前に作成すること。

## 開発コマンド

```bash
npm run typecheck  # TS（app / convex / runtime）
npm run lint       # eslint（Convex プラグイン含む）
npm test           # vitest（mentions / access）
npm run build      # 本番ビルド
npx shadcn@latest add @beautifui/<name>   # Beautiful UI プリミティブの追加（components.json 済み）
```
