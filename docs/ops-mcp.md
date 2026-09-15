# tahcode ops MCP / tools（TAH-55 Phase 1）

ジョブ中の各ハーネス（Claude / Cursor / Codex / OpenCode / Grok）に、**tahcode 自身を操作するツール面**を渡す共通基盤です。コネクタの状態も同じ経路です。Cursor 内蔵の Linear MCP やマーケットプレイス MCP は使いません。

正本は Convex の `agentTools:invoke` と、ジョブ claim 時の `opsBundle` です。ブリッジが一時 MCP 設定を書き、Claude だけ `--mcp-config` で渡します。

## 今日のジョブ起動（調査メモ）

| ハーネス | ブリッジの起動 | tahcode ops の渡し方 |
| --- | --- | --- |
| Claude | `claude -p --output-format stream-json --verbose` | **`--mcp-config`** + **`--allowedTools mcp__tahcode__*`**（stdio: `tahcode tool-mcp`。`-p` の既定 permission だと MCP が権限未承認になる） |
| Cursor | `agent -p --trust --force --output-format stream-json` | **未配線。** `agent -p` に `--mcp-config` 相当はない。`tahcode tool` + プロンプトカタログ。`--force` が無いと headless のシェルが拒否され `tahcode tool` に届かない（TAH-63）。CLI が 0.1.0 だと `tool` 自体が 「不明なコマンド」になり `@linear` が届かない（0.1.1+）。`--force` 付きランタイムは **0.1.2+** |
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
4. Cursor / Codex / ほかは `--mcp-config` が無いあいだ、**同じカタログ**を `tahcode tool` に出す。実行は Convex `agentTools:invokeConnector`（ops の `invoke` と同じランタイムトークン + ジョブリース）。Claude の MCP `tools/list` と名前が一致する。
5. トークン・ゲートウェイ URL・OpenConnector / OOMOL / workers.dev はプロンプト・UI・ツール応答に出さない。

### `@linear`（slug なし）の既定アカウント

コンポーザが素の `@linear` に割り当てるアカウントと同じ優先順位:

1. ラベルなしの接続済みアカウント（複数なら mention ハンドル割り当て順の先頭）
2. それが無いときは、その provider の接続済みが 1 件だけならそれ
3. 複数で全部ラベル付きなら **org スコープ優先**、同列なら `connectionId`

`@linear/<slug>` は displayLabel の slug、または `connectionId` そのもの。切断済み・未メンションは注入しない。

Linear ツールは `shared/connectorActionCatalog.ts` から materialize する（[TAH-65](connector-action-tools.md)）。Phase 1 の Linear 面: `list_linear_issues` / `search_linear_issues` / `create_linear_issue` / `update_linear_issue` / `list_linear_teams`。実体はコネクタ Action（`linear.list_linear_issues` など）だが、エージェントから見える名前と説明は Linear だけ。新しい Linear Action はカタログ行を足す（サービス専用ツールファイルは増やさない）。

## Preview での確認

1. preview / staging にログイン（`test@test.com` / `test1234`）。
2. `/o/preview/connectors` で Linear を接続（未接続でも claim の `opsBundle.connectors` は空配列で返る）。
3. Claude が検出されているマシンで `@claude` だけの挨拶を流す。`tahcode ops MCP attached` は本文にも思考トレースにも出ない（TAH-76。ツール不要ターンは `--mcp-config` を付けない）。
4. Linear を接続したうえで `@claude @linear 課題を一覧` を流す。起動 argv に `--mcp-config` と `mcp__tahcode__*` / `mcp__tahcode-linear-<last8>__*` が付く。思考トレースに attach ステータス行は出さない。課題一覧は tahcode コネクタ経由（Cursor 内蔵 Linear MCP ではない）。Cursor ジョブでは `--mcp-config` は付かず、`tahcode tool list_linear_issues` がカタログに出る。

Cloudflare の preview Worker は `pr-<number>` で分かれている。Convex も同じ `pr-<number>` 識別子に載せる。チームの deployment 上限（40）で新規作成できないときは、閉じた PR の残りプレビューを 1 件消してから `pr-<number>` を取り直す。マージ済みブランチ名へ関数だけ載せて他 PR と共有すると、後から来た preview が `agentTools:invoke` のバリデータを上書きする。
