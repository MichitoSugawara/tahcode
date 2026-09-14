# tahcode ops MCP / tools（TAH-55 Phase 1）

ジョブ中の各ハーネス（Claude / Cursor / Codex / OpenCode / Grok）に、**tahcode 自身を操作するツール面**を渡す共通基盤です。コネクタの状態も同じ経路です。Cursor 内蔵の Linear MCP やマーケットプレイス MCP は使いません。

正本は Convex の `agentTools:invoke` と、ジョブ claim 時の `opsBundle` です。ブリッジが一時 MCP 設定を書き、Claude だけ `--mcp-config` で渡します。

## 今日のジョブ起動（調査メモ）

| ハーネス | ブリッジの起動 | tahcode ops の渡し方 |
| --- | --- | --- |
| Claude | `claude -p --output-format stream-json --verbose` | **`--mcp-config <tmpdir>/tahcode-mcp.json`**（stdio: `tahcode tool-mcp`） |
| Cursor | `agent -p --trust --output-format stream-json` | **未配線。** `agent -p` に `--mcp-config` 相当はない。`tahcode tool` + プロンプトカタログ |
| Codex | `codex exec --json` | `tahcode tool` + プロンプトカタログ |
| OpenCode | `opencode run` | 同上 |
| Grok | `grok --prompt` | 同上 |
| Antigravity | headless CLI なし | 非対応 |

ジョブ claim（`jobs:claimNext`）が `opsBundle` を返します。中身は:

- `connectors` — ジョブ Org で acting user が見える `connectorConnections`（シークレットなし）
- `mentionedConnectors` — プロンプトの `@linear` / `@linear/<slug>`（TAH-54 が対象を決めるフック）
- `mcp.attachment` — `mcp-config` / `cli` / `unsupported`
- `mcp.servers` — `tahcode` ops は `inject: true`。コネクタは Phase 1 では `inject: false`

ブリッジは `shared/opsMcp.ts` の `buildJobMcpConfig` でファイルを生成します。Phase 1 のファイルには **tahcode ops サーバだけ**が入ります。コネクタ行はプランに載るだけで、MCP サーバにはなりません。

## エージェントから見えるコネクタツール

| 名前                   | 動き                                              |
| ---------------------- | ------------------------------------------------- |
| `list_connectors`      | 見えるコネクタ。`orgId` / `provider` で絞り込み可 |
| `get_connector_status` | `connectionId` 1 件、または `provider` で一覧     |

認可は UI と同じ（org スコープはメンバー全員、user スコープは本人または Admin）。`connectedAccountId` は claim の内部スナップショットにだけ載せ、ツール応答には出しません。

## TAH-54 の載せ方（未実装・フックのみ）

`@linear` で tahcode コネクタの Linear ツールを渡すときは、**この基盤の上に載せる**。Linear 専用の起動フラグや Cursor マーケットプレイス MCP は足さない。

1. `shared/opsMcp.ts` の `resolveConnectorMcpServer`（または `buildJobMcpConfig` の `resolveConnector`）で、`provider === "linear"` かつ `status === "connected"` のスナップショットから MCP サーバ仕様を返す。
2. `buildJobMcpConfig` が `tahcode` ops と同じ `mcpServers` にマージする。Claude は既存の `--mcp-config` で両方を読む。
3. Cursor は CLI に MCP フラグが無いあいだ `tahcode tool`（または後続の stdio ホスト）で同じ Convex 経路を呼ぶ。`agent` が `--mcp-config` 相当を持ったら `jobMcpCliFlags` に足す。
4. 対象アカウントは `opsBundle.mentionedConnectors`（`@linear` / `@linear/pottos`）と `opsBundle.connectors` を突き合わせる。メンション解決は `shared/mentions.ts` + `src/lib/connectorMentions.ts` が既にある。
5. トークンやゲートウェイ URL をプロンプトや UI に出さない。UI 文言は「コネクタ」のまま。

Phase 1 では `resolveConnectorMcpServer` は常に `null` です。テスト `tests/ops-mcp.test.ts` が、リゾルバを渡したときにサーバがマージされることだけ保証します。

## Preview での確認

1. preview / staging にログイン（`test@test.com` / `test1234`）。
2. `/o/preview/connectors` で Linear を接続（未接続でも claim の `opsBundle.connectors` は空配列で返る）。
3. Claude が検出されているマシンで `@claude` ジョブを流す。思考トレースに `tahcode ops MCP attached (--mcp-config)` が出る。
4. 同じジョブ中に `tahcode tool list_connectors` がカタログに出ること。Cursor ジョブでは `--mcp-config` は付かず、`tahcode tool` 案内になる。
5. Linear の課題ツール（作成・検索など）は **まだ付かない**。それが TAH-54。
