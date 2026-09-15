# GitHub プラグイン（TAH-79）

Status: Phase 2（Linear 縦通しの上に載せる）  
Issue: [TAH-79](https://linear.app/tahcode/issue/TAH-79/プラグイン-github-を-linear-と同じ縦通しで追加する)  
親: [TAH-40](https://linear.app/tahcode/issue/TAH-40)  
Repo: [https://github.com/MichitoSugawara/tahcode](https://github.com/MichitoSugawara/tahcode)

UI 文言は「プラグイン」。コード識別子・ルートは従来どおり `connector*` / `/connectors`。

トークンはコネクタワーカーだけが持つ。Convex の `connectorConnections` には不透明な id だけを置く。画面・トースト・エージェント説明にコネクタ基盤のホスト名やベンダー名を出さない。

---

## この OSS/製品ではこうできていた

1. **tahcode Linear 縦通し（TAH-41〜54）** — GitHub 専用スタックは作らない。同じ経路に provider を足す。
   - OAuth 開始: `shared/openConnector.ts` の `POST /v1/connections/{service}/connect`。`returnUri` に `connector=` + `scope=` +（2 本目以降）`connectionId=`。ブラウザの `connectedAccountId` は入力にしない。
   - Convex: `convex/connectorConnect.ts` + `convex/connectorConnectHelpers.ts`。公開 action は `startLinearConnect` / `completeLinearConnect`。完了は保存済み `oauthRequestId` をサーバ側で確認し、`appId` だけを不透明 id として upsert する。
   - UI: `src/harness/connectors/LinearConnectorCard.tsx` の追加 → 認証 → Waiting+再表示 → 接続済み。専用面は `/o/:slug/connectors`（`src/pages/ConnectorsPage.tsx` / `src/harness/rail/ConnectorsPane.tsx`）。
   - チャット内カード: `messages.suggestConnector` → `convex/lib/connectorCards.ts` → `Thread.tsx` が同じカードを `variant="chat"` で載せる。`/connect` が Linear を出す。
   - マルチアカウント（TAH-50）: 同じ `connectorConnections` テーブル。2 本目の `returnUri` に `connectionId` を付け、完了がその行だけを更新する。
   - エージェントツール（TAH-65）: `shared/connectorActionCatalog.ts` の 1 行が Claude MCP と `tahcode tool` の両方になる。手メンテの GitHub ツールファイルは禁止。
2. **OpenConnector GitHub provider** — service id は `github`。OAuth アプリの callback は `{origin}/oauth/callback`。試験 Action は `github.get_current_user`。
   - [Create a GitHub OAuth app for OpenConnector](https://oomol.com/en/docs/openconnector-github-oauth-app/)
   - [credentials.md](https://github.com/oomol-lab/open-connector/blob/847efc10/docs/credentials.md) — `PUT /api/oauth/configs/github` に `clientId` / `clientSecret`
   - ライブカタログ: `{worker}/v1/actions?service=github`（147 Actions）。tahcode が露出するのは curated な 5 行だけ。
3. **Grok Bot marketplace card** — 1 provider 行で detail。ヘッダーに追加 / 認証 / 接続済み。アカウント一覧は別画面。
   - [connector.tsx](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/recovered/features/conversation/cards/transcript-card/views/connector.tsx)
   - tahcode 側の文法: `src/lib/connectorCard.ts`（`sand-connector-card__header` 相当の marketplace row、Add / Authorize / Connected）

---

## 何を足したか（新しいスタックは無い）

| 層 | Linear にあったもの | GitHub |
| --- | --- | --- |
| provider 一覧 | `CONNECTOR_PROVIDERS = ["linear"]` | `"github"` を追加 |
| OAuth start/complete | `startLinearConnect` / `completeLinearConnect` | 同じ helper を `startGithubConnect` / `completeGithubConnect` が呼ぶ |
| returnUri | `connector=linear` | `connector=github` |
| health | `linear.get_current_user` → teams | `github.get_current_user` → `github.list_my_repositories` |
| 表示名 | Linear `viewer.displayName` | GitHub `name`（なければ `login`） |
| マーケットカード | `LINEAR_CONNECTOR` | `GITHUB_CONNECTOR`（homepage `https://github.com`） |
| チャット | `/connect` | `/github` + `suggest_connector({ provider: "github" })` |
| メンション | `@linear` / `@linear/<slug>` | `@github` / `@github/<slug>` |
| エージェントツール | Linear 5 行 | GitHub 5 行（カタログのみ） |

---

## Preview で追加 → 認証 → 接続済み

GitHub OAuth アプリがワーカーに保存されているとき:

1. preview に `test@test.com` / `test1234` で入る（[`.env.example`](../.env.example)）
2. `/o/preview/connectors` を開く
3. GitHub 行の「追加」を押す（Owner / Admin）
4. GitHub の認可画面で Authorize
5. `?connector=github&scope=org` でプラグイン面に戻る
6. カードが「接続済み」になる（表示名は GitHub の name / login）

チャット: `/github` またはエージェントの `suggest_connector`（`provider: "github"`）。2 本目は接続済みのあと「+ 別のアカウントを追加」（TAH-50 と同じ）。

Member は Team 連携の認証ができない（Linear と同じ Notice）。

### スクショ手順（レビュー用）

OAuth アプリ未設定でも 1–3 は撮れる。4–6 は下のハンドオフ後。

1. `/o/preview/connectors` — Linear と GitHub が並ぶ（検索「github」で GitHub だけ）
2. GitHub 行をクリック — 追加が OAuth を始める。未設定なら「認証を開始できません。管理者に連絡してください。」
3. チャットで `/github` — 会話内カード。追加 / 認証 / 接続済みはマーケットと同じ
4. ハンドオフ後: 認可画面 → 戻り → 接続済み。表示名にトークンや基盤ホストが無いこと

---

## ハンドオフ: GitHub OAuth アプリ（エージェントでは作れない）

GitHub の OAuth App 作成は **Developer settings に入れるアカウント**が必要。このエージェントはそのログインを持たない。アプリ作成と client の保存だけ、オーナー作業。

tahcode 側（カード、Convex action、カタログ、returnUri、マルチアカウント、チャットカード）は Linear と同じ経路で実装済み。足りないのはワーカー上の GitHub client だけ。Linear は TAH-41 で同じワーカーに載っている。

### 1. GitHub で OAuth App を作る

公式: [Creating an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)

1. github.com に、tahcode のコネクタを所有するアカウント（個人または org）で入る
2. 右上アイコン → **Settings**
3. 左下 **Developer settings**
4. **OAuth Apps** → **New OAuth App**
5. 入力:
   - **Application name:** `tahcode`
   - **Homepage URL:** `https://tahcode.com`
   - **Authorization callback URL:** `https://tahcode-open-connector.gawara.workers.dev/oauth/callback`
   - Application description は任意
6. **Register application**
7. **Generate a new client secret** を押し、Client ID と Client secret を控える（secret は一度しか出ない）

GitHub OAuth App の callback は **1 本**。localhost 用が要るなら別アプリを作る。preview / staging / production の **tahcode 側 returnUri** は Convex `SITE_URL` とページ origin で変わる。GitHub に登録するのはワーカーの `/oauth/callback` だけ（Linear と同じ）。

スコープ（`read:user` / `user:email` / `repo` など）は認可リクエスト側。アプリ作成画面では選ばない。

### 2. ワーカーに client を保存する

OpenConnector の正本は `PUT /api/oauth/configs/:service`（[credentials.md](https://github.com/oomol-lab/open-connector/blob/847efc10/docs/credentials.md)）。本番ワーカーは管理者トークン必須（未認証は 401）。

```bash
# OPENCONNECTOR_ADMIN_TOKEN は Convex / .env.preview に既にあるもの。コミットしない。
# 値は GitHub の Client ID / Client secret。チャットや PR に貼らない。

curl -sS -X PUT \
  "$OPENCONNECTOR_BASE_URL/api/oauth/configs/github" \
  -H "authorization: Bearer $OPENCONNECTOR_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"clientId":"<github-client-id>","clientSecret":"<github-client-secret>"}'
```

`OPENCONNECTOR_BASE_URL` の既定は Linear と同じワーカー origin。コンソール UI があるなら Providers → GitHub → Configure OAuth Client でも同じ。

確認:

```bash
curl -sS -H "authorization: Bearer $OPENCONNECTOR_ADMIN_TOKEN" \
  "$OPENCONNECTOR_BASE_URL/api/oauth/configs"
```

`github` の `expectedRedirectUri` が `https://tahcode-open-connector.gawara.workers.dev/oauth/callback` であること。secret は応答に出さない想定。

### 3. preview で通す

保存後、上の「追加 → 認証 → 接続済み」を繰り返す。Redirect URI mismatch なら GitHub アプリの callback がワーカー origin と一致しているか見る。

---

## エージェントツール（手メンテ禁止）

`@github` があるジョブだけで載る。定義は `shared/connectorActionCatalog.ts`。

| ツール                 | Action                                   |
| ---------------------- | ---------------------------------------- |
| `list_github_repos`    | `github.list_my_repositories`            |
| `list_github_issues`   | `github.list_repository_issues`          |
| `search_github_issues` | `github.search_issues_and_pull_requests` |
| `create_github_issue`  | `github.create_issue`                    |
| `update_github_issue`  | `github.update_issue`                    |

`github.get_current_user` は接続確認だけ。147 Action を全部は出さない（TAH-65 の curated catalog）。

---

## やらないこと

- Slack など他 provider
- 独自 GitHub GraphQL / REST クライアント
- Convex へのトークン保存
- UI への基盤ホスト名
- GitHub ツール用の新しい Convex handler / MCP ホスト
