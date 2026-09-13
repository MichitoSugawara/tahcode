# tahcode — Phase 1

**tahcode**（ターコード、_team agent harness_）は、チームの会話と手元のマシンで動くコーディングエージェントをひとつの作業場にまとめる Web アプリ。本番: https://tahcode.gawara.workers.dev（旧称 **dalecode** から改名。npm パッケージ `dalecode` → `tahcode`、Worker `team-harness` → `tahcode`）。Multica ベースの既存プロダクトと同じ構想を新スタックで実装した、最小チームチャット + オンマシン・コーディングエージェント。Phase 1 の垂直スライス: Org / Project 作成、Personal DM + プロ젝트チャット、メンション応答、履歴 + メンション + プロジェクトリンクのコンテキスト、t3code 由来プロバイダのマシンランタイム、最小ロール + ランタイム許可。Convex（データ/リアルタイム）+ Cloudflare（ホスティング/ファイル）。

UI は [Beautiful UI](https://www.beautifului.dev/) のプリミティブと [/harness](https://www.beautifului.dev/harness) のシェル構成をそのまま採用（shadcn レジストリ経由で導入）し、配色は VS Code **Dark Green+**（kazelone.vscode-dark-green-plus）をトークンにマッピング。ライトが既定（ダークはトグルで切替、選択は localStorage に保存）。プロバイダ配線は https://github.com/pingdotgg/t3code の `builtInDrivers.ts` （Codex / Claude / Cursor / Grok / OpenCode / Antigravity の6種）を移植。Multica からは Org / member / project / chat の考え方と作成フローの型だけ借りた新規実装（フォークではない）。

![Project chat with a streamed agent reply](docs/ui-screenshots/20-agent-reply-final-codeblock-table.png)

## Scope（Phase 1）

- ✅ Org → Project 階層、プロジェクト可視性（org / private）+ プライベートチャットの per-chat 追加
- ✅ Personal DM（Phase 1 は owner-only）+ プロジェクトチャット
- ✅ エージェント応答: DM は常時、他は @mention（@agent / @codex / @claude / @cursor / @grok / @opencode / @antigravity / @rt-…）時のみ
  - メンションは `@provider/model` の形でモデルまで指名できる（例 `@cursor/muse-spark-1.3`、`@claude/opus`）。`@cursor` だけなら Cursor CLI の既定モデル（従来どおり）。詳細は [プロバイダとモデル](#プロバイダとモデルproviderモデル)
  - 仕様: チャットはエージェント（プロバイダ + モデル）に結びつけて作成でき、プロジェクトチャットでメンションなしで送信すると Composer がそのメンション（例 `@cursor/muse-spark-1.3`）を自動付与してから送る。DM はメンションなしでもチャットのエージェントで動く。サーバ側ルール自体はメンション必須のまま（`convex/messages.ts`）。素のメッセージを送りたい場合は現状 UI からは不可（Phase 1 の簡略化）
- ✅ コンテキスト = 直近履歴 + メンション + プロジェクトリンク（Focus なし）
- ✅ マシンランタイム（t3code 由来の headless CLI 実行）+ default deny のランタイム ACL（user / role 混在可）
- ✅ ロール: owner（全体）/ admin（招待 + 権限）/ member（見える範囲のみ）
- 🚫 対象外: Kanban/Issue、Focus モード、Codex Cloud / Cursor Cloud Agent、DM の後から共有 UI、Linear 連携、Cloudflare 上でのエージェント実行

## UI — Beautiful UI × Dark Green+

### 導入方法（shadcn レジストリ）

Beautiful UI は npm パッケージではなく **shadcn 互換のコンポーネントレジストリ**（`https://www.beautifului.dev/r/registry.json`）。 `components.json` に `@beautifui` 名前空間を登録済みで、プリミティブは次で追加・更新する:

```bash
npx shadcn@latest add @beautifui/thinking-state   # 例。foundation は registryDependencies で自動解決
```

インストール先は `src/components/atoms/*`（Button, EntityChip, ValuePill, Chip, StatusPill, SegmentedControl, TextRow）と `src/components/primitives/*`。`src/app/beautifui/foundation.css` がトークン（`:root` / `.dark` / `@theme`）・基本ルール・共有キーフレーム、`sidebar-nav.css` が SidebarNav の開閉演出。`shadow-plugin` は foundation が要求する依存。

### 採用したプリミティブと使い所

| プリミティブ | 使い所 |
| --- | --- |
| **SidebarNav**（移植: lucide アイコン、データ駆動化） | ワークスペース切替（Org）、New chat / Home / 招待 / ランタイムのレール、パーソナル + プロジェクト別チャットツリー、検索、52↔224px 折りたたみ |
| **PromptBar**（移植: デモ/口述/シェーダを除去、データ駆動化） | コンポーザ。`@` でエージェント + メンバー、`/` でコマンド、プロバイダ / ランタイムのピルピッカー、R2 添付チップ、⏎送信 / ⇧⏎改行、IME 対応 |
| **ThinkingState**（`working` prop を追加してライブ駆動） | ランタイムの `thinking` イベントをそのままトレース行に。実行中はシマー + スピナー、完了で「N ステップ実行」に畳む |
| **ToolChips**（`live` / `fill` prop を追加） | ランタイムの `tool` イベント（コマンド実行・編集・MCP）を展開可能なチップ行に。「N 件のツール呼び出し」で畳む |
| **Search**（データ駆動化 + ↑↓⏎） | ⌘K / Ctrl+K のコマンドパレット。チャット・プロジェクト・作成/登録/招待/設定を横断検索 |
| **StreamingText** のアクション行 / フォローアップ | 返信下のコピー・再実行アイコン、最新の返信に続く「続けて聞く」候補（クリックで送信） |
| **Shimmer** | 「読み込んでいます」「CLI を検出しています」など進行中ラベル |
| **LoadingState** | ジョブ受付待ち・接続待ち・画面ロード（ピクセルグリッド + 経過秒） |
| **CodeBlock** | 返信内のコードフェンス、ランタイム起動コマンド（コピー付き） |
| **ContextCards** | Context タブ「エージェントに渡すもの」（project link / 履歴 / メンション） |
| **TaskRows**（静的 `queued` / `failed` を追加） | Context タブ「実行履歴」（チャットごとのジョブ状態） |
| **GlideMenu** | すべてのメニュー / 選択肢の滑るホバー（ワークスペースメニュー、ロールメニュー、ダイアログの選択肢） |
| Button / StatusPill / ValuePill / Chip / SegmentedControl / TextRow / EntityChip(Monogram) | ボタン、ロール・状態ピル、件数、ハンドル、タブ切替、設定行、アバター |
| ハーネスの構成（`IceCreamHarness`） | 3 ペインシェル、チャットタブバー、ホームの登場ストーリーボード（blur → 定位置）、ユーザーバブル、返信の fade-up、浮かぶコンポーザと追従スクロール |

見送り（Phase 1 に対応する機能がないため未導入）: ApprovalCard（承認フローは Phase 1 外）、DiffTable / ToolChips の diff チップ（構造化 diff をランタイムが返さない）、RecordsTable / FilterTable / InsightCards / Flowchart / FineTuneCard / SelectionActions / RecommendationCard / ChatComposer(デモ)。

### テーマ（`src/app/theme.css`）

Dark Green+ の生トークンを `--dg-*` として保持し、Beautiful UI のセマンティックトークンに解決する:

| Dark Green+ | 値 | → Beautiful UI |
| --- | --- | --- |
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

1. **Auth** — `/login`（ログイン / 新規登録の切替）。メール＋パスワード、または **Google で続ける**（OAuth 設定時のみ有効）。`?next=` で招待リンクへ戻る（Google 経由でも維持）。入力検証と失敗メッセージは日本語（空欄・形式不正・8 文字未満・確認不一致・パスワード相違・登録済みメール・ネットワーク断・セッション未確立）。サインアウトはワークスペースメニュー
2. **First run** — Org がなければ `/welcome`。Org 作成（Owner になる）または招待トークンで参加 → 作成後は Personal DM が即使えるホームへ
3. **Org 切替 / 設定** — サイドバー上部のワークスペースメニュー（切替・新規・設定・招待・テーマ・サインアウト）、`/o/:slug/settings`
4. **プロジェクト作成** — Multica 型ダイアログ（名前、公開範囲 org / private、任意でリポジトリ URL と作業ディレクトリ）。作成すると「General」チャットが開く
5. **チャット作成 / 開く** — 「新しいチャット」ダイアログ（場所 = プロジェクト or Personal DM、タイトル、公開範囲、エージェント = プロバイダ + モデル）。選んだエージェントはチャットに保存され、最初の 1 通から自動メンション（`@cursor/muse-spark-1.3`）に使われる。開いたチャットは上部タブに並ぶ
6. **招待とロール** — Team タブ / 「メンバーを招待」（Admin 以上）。招待リンク `…/invite/<token>` を発行 → 受け取った人はサインイン後 `/invite/:token` で参加。ロール変更は Owner / Admin（Owner の付与は Owner のみ、最後の Owner は降格不可）
7. **ランタイム登録** — 「このマシンを登録」→ 一度きりのトークン入りの `npm i -g tahcode` / `tahcode link` / `tahcode start` → 最初のハートビートで同じ画面が「接続されました + 検出した CLI」に変わる
8. **利用許可（default deny）** — 「許可を管理」ダイアログ。メンバー単位 / ロール単位を混在して付与・取消。所有者以外は許可があるまで「利用許可がありません」の説明付き
9. **チャット** — 返信はジョブ受付待ち → トレース → ストリーミング Markdown → CodeBlock / 表。`@` ピッカー（`@cursor/` と打つとそのプロバイダのモデル候補）、プロバイダ / モデル / ランタイムピッカー（変更はチャットに保存）、プロジェクトリンクは Context タブ
10. **右レール** — Context（渡すもの・実行履歴・参加メンバー） / Runtime（マシンと許可、使用マシンの指定） / Team（名簿とロール） **⌘K** — コマンドパレットからチャット・プロジェクト・各操作へ
11. **権限の行き止まり** — Member には「招待」が無効表示 + 理由、使えるマシンがなければコンポーザ上に理由と次の一手、見えないチャットは説明付きの空状態

スクリーンショット一覧: `docs/ui-screenshots/`（01 → 43 の順で上のジャーニーをなぞる。`localhost` のフェイク `codex` CLI で実際にジョブを流したもの）。プロバイダ + モデルの結びつけと `@provider/model` メンションは `docs/ui-screenshots/agent-model/`（引数をそのまま返すフェイク CLI で `--model` が届くことを確認）。

### プロバイダとモデル（`@provider/model`）

- **カタログ** — `shared/providers.ts` が 6 プロバイダごとのモデル一覧を持つ。出典は t3code の `model-manifest.json`（Codex / Claude / Antigravity）、Multica の `models.go` 静的カタログ（Codex / Claude / Grok）、Cursor のモデルドキュメント（Cursor CLI の id）。Cursor / Grok / OpenCode は上流ではサインイン済み CLI から動的に取得するため、ここでの一覧はスナップショット。**一覧にないスラッグも `@cursor/<slug>` で直接指名でき、そのまま CLI に渡る**（CLI 側のカタログが正）。
- **メンション文法** — `@provider/model`。最初の `/` で分割するので OpenCode の `@opencode/anthropic/claude-sonnet-5` も通る。Claude の別名（`@claude/opus` → `claude-opus-5`）はカタログで解決。`@agent` は「このチャットのエージェント」。
- **既定モデル（後方互換）** — `@cursor` のようにプロバイダだけの指名は、そのプロバイダの既定モデル = **CLI 側の設定に従う**（`--model` を付けない）。これまでの `@codex` / `@claude` はそのまま同じ動きをする。チャットが `cursor/muse-spark-1.3` に結びついているときは素の `@cursor` もそのモデルで動く（別プロバイダを素で指名したときはその CLI の既定）。
- **チャットへの結びつけ** — `chats.driverKind` / `chats.model`。「新しいチャット」ダイアログで選ぶか、コンポーザのプロバイダ / モデルピッカーで変更（`chats:setAgent`、チャットのメンバー全員に共有）。優先順位は **明示メンション > コンポーザ / チャットの結びつけ > ランタイムに入っている CLI**。
- **ランタイム** — ジョブが `model` を持つときだけ CLI にフラグを付ける: `codex exec --model`、`claude -p --model`、`agent -p --model`、`opencode run --model provider/model`、`grok --model`（Grok の headless 引数は暫定のまま）。指名されたプロバイダの CLI がそのマシンに無いときは別の CLI で黙って実行せず、「未インストール」を返信として返す。サーバ側も指名プロバイダが検出済みのマシンを優先して選ぶ。`tahcode start --provider <kind>` で固定した場合はメンションのモデル指定は無視される（モデル名はプロバイダ固有のため）。認証 UX の検証ショット（ログイン / 新規登録 / 各バリデーション / エラー状態 / モバイル、デスクトップ＋390px）は `docs/ui-screenshots/auth/`。

## Stack

パッケージ名・Worker 名は `tahcode`（production `tahcode` → `tahcode.gawara.workers.dev`、staging `tahcode-staging`、preview `tahcode-preview`）。R2 バケット名 `team-harness-files*` はデータを保持しているため据え置き（改名にはバケット作成 + オブジェクト移行が必要。ユーザーには見えない）。 `HARNESS_*` 環境変数は CLI の互換フォールバックとして残す。ユーザーに見える名前はすべて **tahcode**。

- UI: Vite + React 19 + Tailwind v4 + Beautiful UI（shadcn レジストリ）+ Convex Auth（Password）+ react-router
- Data/realtime: Convex（`convex/`）。認証は Convex Auth Password。権限は custom function ラッパ + 共有アクセスロジック
- Hosting/files: Cloudflare（`worker/` + `wrangler.jsonc`、R2 バケット `FILES`）。ファイル本体は Worker（`/api/files`）経由で R2、メタデータは Convex `files`
- Providers: t3code の6ドライバを `shared/providers.ts`（カタログ）+ `runtime/src/providers.ts`（headless 実行）に移植
- Runtime: `tahcode` CLI（`packages/cli`）= Multica CLI/daemon の薄いラッパー + Convex をポーリングするブリッジ（`runtime/`）。headless CLI 起動は t3code 由来

## ローカルで動かす

前提: Node **22.18+**（Oxlint / Oxfmt の TypeScript 設定を読むため）、npm。

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

`.env.local` は `npx convex dev` が生成（`VITE_CONVEX_URL=http://127.0.0.1:3210`）。本番相当の確認: `npm run build` → `npm run preview:cf`（dist を Worker で配信）。

### マシンランタイム（`npm i -g tahcode`）

エージェントはあなたのマシンで、**Multica daemon** 経由で動きます。tahcode は独自の常駐デーモンを持たず、 [Multica CLI/daemon](https://multica.ai/docs/daemon-runtimes) を薄くラップします（`packages/cli`、npm パッケージ名 `tahcode`、bin `tahcode`）。

1. Web UI → 右レール **Runtime** タブ →「このマシンを登録」。一度だけ表示されるトークン入りのコマンド 3 行が発行されます:

```bash
npm i -g tahcode
tahcode link --url "https://<deployment>.convex.cloud" --runtime "<id>" --token "th_…" --name "office-mac"
tahcode start        # Multica daemon を起動 → tahcode のジョブブリッジをフォアグラウンドで実行
```

2. Multica CLI が未導入なら `tahcode install-multica`（Homebrew / 公式インストールスクリプト）。エージェント CLI は 1 つ以上ログイン済みにする: `codex login` / `claude auth login` / `agent login` / `grok login` / `opencode auth login`
3. 確認: `tahcode doctor`（Node / Multica / 検出 CLI / tahcode 接続）、`tahcode status`、`tahcode logs -f`。

役割分担: tahcode バックエンドが Org・ランタイム・トークン・default deny の許可を持ち、Multica daemon が CLI 検出とマシンのライフサイクルを持ち、 `tahcode start` のブリッジがチャットのジョブをローカルの CLI（t3code 由来の 6 プロバイダ）に流します。 `tahcode multica <args>` で Multica CLI をそのまま呼べます（例: `tahcode multica login`）。

リポジトリ内での開発: `npm run cli -- doctor`（tsx でソース実行）、`npm run cli:build`（`packages/cli/dist/tahcode.mjs` にバンドル）。公開手順は [`packages/cli/README.md`](packages/cli/README.md)。CI や 1 回限りの実行では環境変数 `TAHCODE_URL` / `TAHCODE_RUNTIME_ID` / `TAHCODE_TOKEN` でもリンクできます。

DM で話しかけると常時応答、プロジェクトチャットでは `@codex 直して` や `@cursor/muse-spark-1.3 直して` のようにメンションする。送信時にチャットのエージェントのメンションが自動付与される（プロジェクトのみ。DM は付与なしでチャットのエージェントで動く）。

## リポジトリ構成（Multica 型モノレポ）

Web と Desktop を **1 つのモノレポ**に置き、共有パッケージ + 薄いシェルで構成する（[Multica](https://github.com/multica-ai/multica) の `apps/web` + `apps/desktop` + `packages/{core,ui,views}` と同じ考え方）。パッケージマネージャは npm workspaces（`apps/*`, `packages/*`、lockfile はルートの 1 つ）。

| Multica | tahcode（現状） | 中身 |
| --- | --- | --- |
| `apps/web`（Next） | **ルート直下の Vite アプリ**（`src/`, `index.html`, `vite.config.ts`, `worker/`, `wrangler.jsonc`） | Web。Cloudflare の deploy 設定がルートを前提にしているため、この PR では動かしていない（後述） |
| `apps/desktop`（Electron + electron-vite） | [`apps/desktop`](apps/desktop) = `@tahcode/desktop` | Electron + electron-vite の**薄いシェル**。renderer をバンドルせず、デプロイ済み Web を URL で読む |
| `packages/core` | [`packages/core`](packages/core) = `@tahcode/core`（現在は `./desktop` のみ）+ `shared/` | フレームワーク非依存のロジック。`@tahcode/core/desktop` は deep link / OAuth リダイレクトの契約（Web・Convex・Desktop の 3 者が同じ TS ソースを取り込む）。`shared/`（mentions / access / auth / providers）は次の移設候補 |
| `packages/ui` / `packages/views` | `src/components` / `src/harness`（未分離） | Desktop が renderer をバンドルする段階になったら切り出す。今は Web 側からのみ参照されるため分離しない（重複を作らない） |
| `server`（Go）+ CLI | `convex/` + `runtime/` + [`packages/cli`](packages/cli)（`tahcode`） | バックエンドは Convex、ランタイムは Multica daemon をラップする CLI |

Desktop が「Web を URL で読む」方式なのは、共有 UI の切り出しを **必要になった分だけ**に留めて Vite/React アプリを二重化しないため。Web に手を入れれば Desktop にも即反映され、Desktop 固有のコードは main / preload と `@tahcode/core/desktop` だけになる。 `apps/web` への物理的な移設（`src/` 一式 + `wrangler.jsonc` の `assets.directory` + `cf:build` + `tsconfig` の参照）は Cloudflare deploy に触るため、Web CI のリスクを切り離した別 PR で行う。

### デスクトップアプリ（macOS、Electron）

Google ログインはシステムブラウザで行い、`tahcode://auth/callback` の deep link で戻ってくる。設計・Electron を選んだ理由・署名/公証の手順は [`apps/desktop/README.md`](apps/desktop/README.md)。

```bash
npm install --legacy-peer-deps   # ルートで 1 回（workspaces が apps/desktop と packages/core も入れる。Electron 本体は初回起動時に取得）
npm run desktop:dev              # electron-vite dev。production の Web を読み込む（TAHCODE_DESKTOP_ENV=staging|local で切替）
npm run desktop:pack             # 未署名 .app（apps/desktop/release/mac-arm64/tahcode.app）— deep link の検証はこちら
npm run desktop:build            # Apple Silicon 向け .dmg / .zip（apps/desktop/release/）
```

Linux CI（`.github/workflows/desktop.yml`）は typecheck → `npm test` → `electron-vite build` → xvfb で起動 → スクリーンショット → `electron-builder --linux dir` まで、macOS の `.dmg` は `workflow_dispatch` / `desktop-v*` タグで `macos-latest` が作る（未署名）。スクリーンショットは `docs/desktop-screenshots/`。

## 受け入れ基準の対応

1. Org / Project 作成 → `/welcome` と ワークスペースメニュー（Org）、サイドバーの ＋ / `/project`（Project、org/private + リソース）
2. DM / プロジェクトチャット → DM は Org 参加時に自動作成、プロジェクトチャットは「新しいチャット」ダイアログ / プロジェクト行の ＋
3. DM 常時 / 他はメンション時のみ → `shared/mentions.ts`（`@provider/model` 文法）+ `convex/messages.ts:send`
4. Context = 履歴 + メンション + プロジェクトリンク → `convex/lib/context.ts`（ジョブに JSON 同梱、ランタイムがプロンプトに付与）
5. t3code 由来プロバイダで実行 → `tahcode start`（Multica daemon + ブリッジ）→ `runtime/src/providers.ts`（6種カタログ、`codex exec` / `claude -p` / `agent -p` / `grok` / `opencode run`）
6. 最小ロール + ランタイム許可 → Org ロール + `runtimeGrants`（default deny、machine owner 付与）
7. Convex + Cloudflare → Convex が全データ/リアルタイム、Worker + R2 がホスティング/ファイル

## スタブ・既知の制限

- **Antigravity**: headless CLI がないためランタイムは「未対応」表示 + ガイド文。カタログには含む。
- **Grok headless flags**: CLI の headless 引数は暫定（`grok --prompt`、モデルは `--model`）。手元に CLI があれば `providers` コマンドで確認し、ずれていたら `runtime/src/providers.ts` の1箇所を直す。
- **モデル一覧は静的**: `shared/providers.ts` のカタログは t3code / Multica / Cursor ドキュメントのスナップショット。ランタイム側で `agent models` / `grok models` / `opencode models` を叩いて一覧を同期するのは後続フェーズ（一覧外のスラッグは `@provider/<slug>` でそのまま指名できる）。
- **プロジェクトメンバー追加 UI なし**: private project への追加は現状 `projects:addMember` 関数呼び出し（`npx convex run` 等）。UI は Org メンバー招待・ロール・ランタイム許可まで。
- **Org 名変更 / 削除なし**: 設定ページは表示のみ（Owner 向けの変更は後続フェーズ）。
- **ファイル配信**: 各環境の R2 バインディング必須（`wrangler deploy` / `versions upload` 前にバケット作成。Wrangler はバケットを作らない）。本番 `team-harness-files`、staging `team-harness-files-staging`、preview `team-harness-files-preview`。ローカルは `wrangler dev` のローカル永続化。
- **ファイル Worker に認証なし**: `/api/files` は誰でも POST/GET 可能（メタデータ登録側の Convex は認証必須）。本番公開前に Worker 側で Convex トークン検証を足すこと。
- **Convex デプロイ**: ローカルは匿名モード。本番 Convex へのリンクは未実施（`npx convex login` → 通常 `dev`/`deploy`）。
- **承認フロー**: headless 実行は非対話（権限は各 CLI 側の事前設定に委譲）。t3code の approval デシジョン同期は Phase 1 外。

## CI/CD（Convex + Cloudflare）

`.github/workflows/deploy.yml` が3系統を回す（PR → preview、push staging → staging、push production → production）。共通処理は `.github/actions/deploy-stack` に集約: `env.mjs decrypt` → `mask-env.mjs` → `convex deploy --cmd cf:build` （`--cmd-url-env-var-name VITE_CONVEX_URL` で本番 Convex URL を注入）→ `wrangler` → Convex 側に `SITE_URL` / `JWT_PRIVATE_KEY` / `JWKS` を設定。`cf:build` は `vite build`（`dist/` を Worker の ASSETS として配信）。

### GitHub に設定する secrets（リポジトリ Settings → Secrets）

| secret                          | 用途                           |
| ------------------------------- | ------------------------------ |
| `DOTENV_PRIVATE_KEY_PREVIEW`    | `.env.preview.enc` の復号鍵    |
| `DOTENV_PRIVATE_KEY_STAGING`    | `.env.staging.enc` の復号鍵    |
| `DOTENV_PRIVATE_KEY_PRODUCTION` | `.env.production.enc` の復号鍵 |

各 `.env.<name>`（平文・gitignore、`.env.<name>.enc` のみコミット）が持つ変数:

| 変数 | 用途 |
| --- | --- |
| `CONVEX_DEPLOY_KEY` | `convex deploy` / `convex env set` の認証 |
| `CLOUDFLARE_API_TOKEN` | wrangler の認証 |
| `CLOUDFLARE_ACCOUNT_ID` | wrangler のデプロイ先 |
| `JWT_PRIVATE_KEY` / `JWKS` | Convex Auth の署名鍵（本番・staging・preview deploy ごとに設定される） |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | （任意）Google OAuth のクライアント ID / シークレット。設定時のみ Google ログインが有効 |

`VITE_CONVEX_URL` は CI が自動注入するため保存不要。`SITE_URL` はデプロイ後の Cloudflare URL を CI が設定するため保存不要。

### Convex Auth の署名鍵（重要）

デプロイ時、CI は `scripts/sync-convex-auth-env.mjs` で `SITE_URL` / `JWT_PRIVATE_KEY` / `JWKS`（と設定時の Google 資格情報）を Convex デプロイに反映する。鍵ペアは次で生成:

```bash
node scripts/generate-auth-keys.mjs >> .env.production   # JWT_PRIVATE_KEY と JWKS を追記
npm run env:enc -- production                            # .env.production.enc を更新してコミット
```

**JSON のクォートに注意**（過去に本番のログイン不能を招いた原因）。 `.env.<name>` では:

- `JWKS` は**シングルクォート**か引用符なしで書く（例 `JWKS='{"keys":[...]}'`）。
- `JWKS="{\"keys\":...}"` のように**ダブルクォート＋エスケープにしない**。dotenv はバックスラッシュを保持するため、デプロイが不正な JSON を配信し、発行直後の JWT を自身で拒否して（`AuthProviderDiscoveryFailed`）サインインが成立しなくなる。
- `JWT_PRIVATE_KEY` は 1 行（改行をスペースに置換）でダブルクォート可。

CI の同期スクリプトは `jose` で両値を検証し、エスケープや改行の崩れを自動補修し、 `JWKS` が壊れている / 秘密鍵と一致しない場合は秘密鍵から公開鍵のみの JWKS を再生成する。検証は `DRY_RUN=1 SITE_URL=… JWT_PRIVATE_KEY=… JWKS=… node scripts/sync-convex-auth-env.mjs` で確認できる（`convex` は呼ばれない）。

### Google OAuth（任意）

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID**（Web application）。
2. **Authorized redirect URIs** に各デプロイの Convex **site** URL のコールバックを追加: `https://<deployment>.convex.site/api/auth/callback/google` （例 本番: `https://dapper-ibex-447.convex.site/api/auth/callback/google`。`.convex.cloud` ではなく `.convex.site`）。OAuth 後の戻り先は Convex Auth の `SITE_URL`（CI が Worker の URL、本番は `https://tahcode.gawara.workers.dev` を設定）。 **Authorized JavaScript origins** に Worker の URL を登録している場合は `https://tahcode.gawara.workers.dev` へ更新する。
3. 取得した Client ID / Secret を反映する。いずれか:
   - `.env.<name>` に `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` を入れて `env:enc` → CI が同期、または
   - ダッシュボードで直接 `npx convex env set AUTH_GOOGLE_ID …`（本番は `--prod`）。
4. 両方が設定されると `/login` の「Google で続ける」が有効になる（未設定時は自動で無効表示）。シークレットはコミットしないこと（`.enc` のみコミット）。

### env ファイルの運用

```bash
# .env.example を元に .env.production を作る（平文・コミット禁止）
npm run env:enc -- production   # .env.production.enc を生成 → コミットする
npm run env:dec -- production   # 復号の確認（平文は捨てる）
```

鍵（`DOTENV_PRIVATE_KEY_*` の値）は各自 `openssl rand -hex 32` 等で生成し、GitHub secret と手元で共有する。 `env:enc` / `env:dec` 実行時は対応する `DOTENV_PRIVATE_KEY_<NAME>` をシェルに export すること（dotenvx がファイル名のサフィックスから鍵名を解決する。未設定だと `.env.keys` が生成されるが gitignore 済み）。初回は `.env.preview.enc` / `.env.staging.enc` / `.env.production.enc` が未コミットのため preview/staging/production ジョブは復号で失敗する。実シークレットは絶対にコミットしないこと。

### Environments と wrangler

- preview: `wrangler versions upload --env preview --preview-alias pr-<番号>`（Worker `tahcode-preview` + R2 `team-harness-files-preview`、PR に URL コメント）
- staging: `wrangler deploy --env staging`（Worker `tahcode-staging` → `tahcode-staging.gawara.workers.dev` + R2 `team-harness-files-staging`）
- production: `wrangler deploy --env=""`（トップレベル Worker `tahcode` → `tahcode.gawara.workers.dev` + R2 `team-harness-files`）+ `convex --prod`

R2 バケットは環境ごとに分かれており、**Wrangler はバケットを作らない**。初回デプロイ前に ops が作成する:

```bash
npx wrangler r2 bucket create team-harness-files
npx wrangler r2 bucket create team-harness-files-preview
npx wrangler r2 bucket create team-harness-files-staging
```

`wrangler versions upload` は既存 Worker にしかバージョンを上げられない。preview 用 Worker `tahcode-preview` が未作成のときは、`deploy-stack` が Wrangler の stderr を含む出力を見て一度 `wrangler deploy --env preview` してから upload し直す。旧 Worker `team-harness` / `team-harness-staging` は新しい URL への切替（Google OAuth の redirect URI、Convex の `SITE_URL`）を確認したあとに削除する。

## 開発コマンド

```bash
npm run typecheck  # TS（app / convex / runtime + packages/cli / packages/core / apps/desktop）
npm run check      # Ultracite（Oxlint + Oxfmt、`--deny-warnings`）。`lint` はエイリアス
npm run lint:convex  # Convex 専用 ESLint（`eslint.convex.config.js`。Oxlint ではカバーしない）
npm run fix        # Ultracite autofix + format
npm run cli -- …   # tahcode CLI をソースから実行 / npm run cli:build でバンドル
npm test           # vitest（mentions / access）
npm run build      # 本番ビルド
npx shadcn@latest add @beautifui/<name>   # Beautiful UI プリミティブの追加（components.json 済み）
```
