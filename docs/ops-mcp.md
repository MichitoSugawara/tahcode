# tahcode ops MCP / tools（TAH-55 Phase 1）

ジョブ中の各ハーネス（Claude / Cursor / Codex / OpenCode / Grok）に、**tahcode 自身を操作するツール面**を渡す共通基盤です。コネクタの状態も同じ経路です。Cursor 内蔵の Linear MCP やマーケットプレイス MCP は使いません。

正本は Convex の `agentTools:invoke` と、ジョブ claim 時の `opsBundle` です。ブリッジが一時 MCP 設定を書き、Claude だけ `--mcp-config` で渡します。

## 今日のジョブ起動（調査メモ）

| ハーネス | ブリッジの起動 | tahcode ops の渡し方 |
| --- | --- | --- |
| Claude | `claude -p --output-format stream-json --verbose` | **`--mcp-config`** + **`--allowedTools mcp__tahcode__*`**（stdio: `tahcode tool-mcp`。`-p` の既定 permission だと MCP が権限未承認になる） |
| Cursor | `agent -p --trust --output-format stream-json` | **未配線。** `agent -p` に `--mcp-config` 相当はない。`tahcode tool` + プロンプトカタログ |
| Codex | `codex exec --json` | `tahcode tool` + プロンプトカタログ |
| OpenCode | `opencode run` | 同上 |
| Grok | `grok --prompt` | 同上 |
| Antigravity | headless CLI なし | 非対応 |

ジョブ claim（`jobs:claimNext`）が `opsBundle` を返します。中身は:

- `connectors` — ジョブ Org で acting user が見える `connectorConnections`（シークレットなし）
- `mentionedConnectors` — プロンプトの `@linear` / `@linear/<slug>`
- `mcp.attachment` — `mcp-config` / `cli` / `unsupported`
- `mcp.servers` — `tahcode` ops は常に `inject: true`。Linear は **メンション ∩ `connected`** のときだけ `inject: true`

ブリッジは `shared/opsMcp.ts` の `buildJobMcpConfig` で `tahcode-mcp.json` を書きます。tahcode ops に加え、注入対象の Linear サーバ（名前 `tahcode-linear-<connectionId 末尾8文字>`）が同じファイルに入ります。どちらも `tahcode tool-mcp`（ジョブ認証 env）。Linear 側だけ `TAHCODE_CONNECTOR_CONNECTION_ID` が付きます。Linear / ゲートウェイのトークンと URL はファイルに出さず、Convex `invokeConnector` 側に残します。

## エージェントから見えるコネクタツール

| 名前                   | 動き                                              |
| ---------------------- | ------------------------------------------------- |
| `list_connectors`      | 見えるコネクタ。`orgId` / `provider` で絞り込み可 |
| `get_connector_status` | `connectionId` 1 件、または `provider` で一覧     |

認可は UI と同じ（org スコープはメンバー全員、user スコープは本人または Admin）。`connectedAccountId` は claim の内部スナップショットにだけ載せ、ツール応答には出しません。

## TAH-54 の載せ方

`@linear` で tahcode コネクタの Linear ツールを渡すときは、**この基盤の上に載せる**。Linear 専用の起動フラグや Cursor マーケットプレイス MCP は足さない。

1. `resolveConnectorMcpServer` は `provider === "linear"` かつ `status === "connected"` のときだけ MCP サーバ仕様を返す（ホストは `tahcode tool-mcp`）。
2. 実際にファイルへ入れる対象は `mentionedConnectors ∩ connectors`（connected のみ）。`buildJobMcpConfig` が tahcode ops と同じ `mcpServers` にマージする。
3. Claude は既存の `--mcp-config` で両方を読む。`jobMcpCliFlags` は `mcp__tahcode__*` に加え、注入名ごとに `mcp__<name>__*` をカンマ連結する。
4. Cursor / Codex / ほかは `--mcp-config` が無いあいだ `tahcode tool` カタログに同じ Linear ツールを出す。実行は Convex `agentTools:invokeConnector`（ops の `invoke` と同じランタイムトークン + ジョブリース）。
5. トークン・ゲートウェイ URL・OpenConnector / OOMOL / workers.dev はプロンプト・UI・ツール応答に出さない。

### `@linear`（slug なし）の既定アカウント

コンポーザが素の `@linear` に割り当てるアカウントと同じ優先順位:

1. ラベルなしの接続済みアカウント（複数なら mention ハンドル割り当て順の先頭）
2. それが無いときは、その provider の接続済みが 1 件だけならそれ
3. 複数で全部ラベル付きなら **org スコープ優先**、同列なら `connectionId`

`@linear/<slug>` は displayLabel の slug、または `connectionId` そのもの。切断済み・未メンションは注入しない。

Linear ツール（最低限の issue 面）: `list_linear_issues` / `search_linear_issues` / `create_linear_issue` / `update_linear_issue`。実体は OpenConnector Action（`linear.list_linear_issues` など）だが、エージェントから見える名前と説明は Linear だけ。

## Preview での確認

1. preview / staging にログイン（`test@test.com` / `test1234`）。
2. `/o/preview/connectors` で Linear を接続（未接続でも claim の `opsBundle.connectors` は空配列で返る）。
3. Claude が検出されているマシンで `@claude` ジョブを流す。思考トレースに `tahcode ops MCP attached (--mcp-config)` が出る。起動 argv に `--allowedTools mcp__tahcode__*` が付き、MCP の `list_connectors` は権限未承認にならない（`bypassPermissions` は使わない）。
4. 同じジョブ中に `tahcode tool list_connectors` がカタログに出ること。Cursor ジョブでは `--mcp-config` / `--allowedTools` は付かず、`tahcode tool` 案内になる。
5. Linear を接続したうえで `@claude @linear 課題を一覧` を流す。思考トレースの injected が 1 以上、起動 argv に `mcp__tahcode-linear-<last8>__*` が付き、課題一覧は tahcode コネクタ経由（Cursor 内蔵 Linear MCP ではない）。Cursor ジョブでは `tahcode tool list_linear_issues` がカタログに出る。

Cloudflare の preview Worker は `pr-<number>` で分かれている。Convex も同じ `pr-<number>` 識別子に載せる。チームの deployment 上限（40）で新規作成できないときは、閉じた PR の残りプレビューを 1 件消してから `pr-<number>` を取り直す。マージ済みブランチ名へ関数だけ載せて他 PR と共有すると、後から来た preview が `agentTools:invoke` のバリデータを上書きする。
