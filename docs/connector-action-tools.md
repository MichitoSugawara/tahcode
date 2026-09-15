# コネクタ Action のエージェントツール自動露出（TAH-65）

Status: Phase 1  
Issue: [TAH-65](https://linear.app/tahcode/issue/TAH-65/コネクタ-action-をエージェントツールに自動露出する)  
Repo: [https://github.com/MichitoSugawara/tahcode](https://github.com/MichitoSugawara/tahcode)

関連: [TAH-54](https://linear.app/tahcode/issue/TAH-54) / [TAH-55](https://linear.app/tahcode/issue/TAH-55) / [ops MCP](ops-mcp.md) / [Agent Tools](agent-tools.md)

---

## 問題

Linear 課題ツール（`list_linear_issues` など）は tahcode 本体に手書きしていた。コネクタを約 30 サービスまで伸ばすと同じ形のラッパを N 本維持することになり、ユーザーはそれを拒否している。

受け入れ:

1. 下記エビデンスを引用した設計（この文書）
2. Linear 特例を「コネクタ Action の汎用露出」に寄せる
3. 新しい Linear Action を足すとき、サービス専用ツールファイルを増やさない
4. UI にベンダーホスト名を出さない

---

## エビデンス

ホストがアプリごとにツール実装を量産しない、という点が共通している。

1. **Composio** — toolkit 接続後、メタツール（`COMPOSIO_SEARCH_TOOLS` / `COMPOSIO_GET_TOOL_SCHEMAS` / `COMPOSIO_MULTI_EXECUTE_TOOL`）または session MCP URL でツールを露出する。ホストが Gmail / Linear 用の関数を持たない。
   - [https://github.com/composiohq/composio](https://github.com/composiohq/composio)
   - [https://docs.composio.dev/docs/sessions-via-mcp](https://docs.composio.dev/docs/sessions-via-mcp)
   - [https://docs.composio.dev/docs/composio-connect](https://docs.composio.dev/docs/composio-connect)
2. **OpenClaw** — `mcp.servers` を登録し、catalog をエージェントツールへ materialize する（手書き `list_*` ではない）。
   - [https://docs.openclaw.ai/tools/mcp](https://docs.openclaw.ai/tools/mcp)
   - [`agent-bundle-mcp-materialize.ts` @ `525db34f`](https://github.com/openclaw/openclaw/blob/525db34f/src/agents/agent-bundle-mcp-materialize.ts) — `buildBundleMcpToolsFromCatalog` / `materializeBundleMcpToolsForRun`
3. **Claude Code** — `--mcp-config` でサーバを注入する。ツール定義はサーバ側。
   - [https://code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)
4. **Continue.dev** — MCP サーバ設定を足すだけ。本体が Sentry / Supabase 用ツールを持たない。
   - [https://docs.continue.dev/customize/deep-dives/mcp](https://docs.continue.dev/customize/deep-dives/mcp)

---

## 一次パターン: OpenClaw 型の materialize

tahcode は **multi-harness** である。同じカタログを、ハーネスごとの受け口に投影する。

| ハーネス | 受け口 | 根拠 |
| --- | --- | --- |
| Claude | `--mcp-config` + `tools/list` | Claude Code / Continue と同じ「サーバ側定義をそのまま注入」 |
| Cursor / Codex / OpenCode / Grok | `tahcode tool` カタログ | Cursor `agent -p` に `--mcp-config` が無い（TAH-55 / TAH-63） |

OpenClaw の `buildBundleMcpToolsFromCatalog` と同じ形: **カタログが正本 → エージェントツールに投影**。Claude が見る MCP ツール名と、Cursor が呼ぶ `tahcode tool <name>` は同一の `shared/connectorActionCatalog.ts` から出る。

### なぜ Composio 型メタツールを一次にしないか

Composio Connect の 7 メタツール（SEARCH / GET_SCHEMAS / MULTI_EXECUTE …）は、ホストがアプリ別ツールを持たない点では正しい。tahcode では次の理由で二次にする。

1. Claude はすでに `--mcp-config` で **一次ツール名**（`list_linear_issues`）を受け取る。メタツールだけにすると Claude と Cursor の見え方が割れる。
2. Cursor はシェルの `tahcode tool` 一発で呼びたい。発見 → スキーマ取得 → 実行の 3 ホップは headless で壊れやすい。
3. TAH-54 の既存契約（メンション ∩ connected だけ注入、トークンは Convex）を壊さない。

メタツールは、カタログが数百 Action に膨らんだあとの **検索面** として残す（Phase 2 候補）。Phase 1 の正本は materialize。

```
connector Action catalog
        │
        ├─ materialize → MCP tools/list   (Claude --mcp-config)
        └─ materialize → tahcode tool     (Cursor / ほか)
                    │
                    └─ Convex agentTools:invokeConnector
                       (runtime token + job lease; トークンはサーバ側)
```

---

## Phase 1（この PR）

最小経路は TAH-54/55 の上に載せる。新しい MCP ランタイムも、サービス専用ファイルも増やさない。

| 正本 | 役割 |
| --- | --- |
| `shared/connectorActionCatalog.ts` | Action 1 行 = ツール 1 つ。`materializeConnectorTools` / `mapConnectorActionInput` |
| `shared/linearAgentTools.ts` | Linear スライスの薄いエイリアス。新しい Linear Action はここへ書かない |
| `convex/lib/connectorActionTools.ts` | カタログ lookup → 既存 Action HTTP。ツール別 handler なし |
| `convex/agentTools.ts` `invokeConnector` | ツール名はカタログ由来の union。`prepare` は provider をカタログから取る |
| `shared/opsMcp.ts` | `hasConnectorActions(provider)` なら MCP サーバ spec を返す（Linear ハードコードを外す） |
| `tahcode tool` / `tool-mcp` | 同じ `materializeConnectorTools` |

Linear の既存 4 課題ツールに加え、コネクタ上に既にある `linear.list_linear_teams` を **カタログ行だけ** で `list_linear_teams` として出した。新しい `linearAgentTools` スイッチも、Convex handler も増えていない。

メンション ∩ connected の注入条件、トークンをプロンプトに出さない、Cursor マーケットプレイス MCP を使わない、は TAH-54 のまま。

### 新しい Linear Action の足し方

1. `CONNECTOR_ACTION_CATALOG` に 1 行足す（`toolName` / `actionId` / `fields` / 説明）
2. Convex の `connectorActionToolName` union はカタログから生成される
3. Claude MCP と `tahcode tool` の両方に同じ名前が出る

サービス専用ファイル・`invokeConnector` の case・MCP host の分岐は不要。

### やらないこと（Phase 1）

- 接続時にリモート Action 一覧を毎回 fetch して全件露出する（スキーマと入力マッピングが未安定）
- Composio 型メタツールをジョブに載せる
- UI にベンダーホスト名を出す
- Cursor 内蔵 / マーケットプレイス MCP に戻す

---

## Phase 2 候補

- リモート Action 一覧をカタログの入力にする（curated allowlist は残す）
- カタログ肥大時だけ SEARCH / GET_SCHEMAS を足す（Claude の一次ツールは維持）
- Linear 以外の provider 行をカタログに足す。`resolveConnectorMcpServer` と `invokeConnector` はそのまま使う
