# Agent Tools（Phase 1）

tahcode 上で動いているエージェント（ジョブ中のハーネス CLI）が、**同じユーザー権限**で Org / プロジェクト / チャット / ランタイムを操作するためのネイティブツールです。外部向け MCP パッケージが正本ではありません。Convex の `agentTools:invoke` が正本で、既存の membership / `assertChatVisible` / `assertProjectVisible` / `canUseRuntime` をそのまま使います。

スキル本文はシステムプロンプトに入れません。カタログはツール名と説明だけです。

## エージェントからの呼び方

ジョブ実行中、ブリッジが次をセットします。

| 環境変数             | 意味                    |
| -------------------- | ----------------------- |
| `TAHCODE_URL`        | Convex URL              |
| `TAHCODE_RUNTIME_ID` | このマシンの runtime id |
| `TAHCODE_TOKEN`      | ランタイムトークン      |
| `TAHCODE_JOB_ID`     | 実行中ジョブ            |
| `TAHCODE_LEASE_ID`   | ジョブのリース          |

Linear 課題ツールは同じ CLI から `tahcode tool list_linear_issues` で呼び、Convex は `agentTools:invokeConnector` に届く（ops の `invoke` と同じ認証）。

呼び出し:

```bash
tahcode tool                  # カタログ
tahcode tool list_orgs
tahcode tool list_sessions --args '{"projectId":"…"}'
tahcode tool switch_session --args '{"chatId":"…"}'
tahcode tool send_message --args '{"body":"メモ"}'
```

Claude の headless CLI には、同じツールを stdio で渡すための一時 `--mcp-config` と、無対話で MCP を実行するための `--allowedTools mcp__tahcode__*` も付けます（`tahcode tool-mcp`）。他のハーネスは `tahcode tool` をシェルから呼びます。PATH 先頭に、このジョブ用の `tahcode` ラッパを置きます。ジョブ claim の `opsBundle` と MCP 生成の共通経路は [ops MCP（TAH-55）](ops-mcp.md)。

ジョブ外（対話ターミナルだけ）では呼べません。ユーザー JWT ではなく、**ランタイムトークン + ジョブリース**で認証し、トリガーしたユーザーとして認可します。

## 必要な CLI バージョン

`tahcode tool` / `tahcode tool-mcp` は **0.1.1 以降**。npm の `tahcode@0.1.0` にはサブコマンドが無く、Cursor ジョブは 「不明なコマンド: tool」で止まります（`--mcp-config` が無いため Claude より先に壊れます）。更新: `npm i -g tahcode@0.1.1` のあと `tahcode restart`。バイナリを拾うだけなら `tahcode service install` は不要（TAH-60: 再登録しても `CURSOR_API_KEY` 等は消さない）。`tahcode doctor` の「エージェントツール」が ✗ なら未更新です。

## ツール

| 名前 | 動き |
| --- | --- |
| `list_orgs` | acting user が所属する Org |
| `list_projects` | 見えるプロジェクト。`orgId` 省略時はジョブの Org |
| `list_sessions` | 見えるチャット。`orgId` / `projectId` / `kind` で絞り込み可 |
| `get_session` | 1 チャット + 直近メッセージ。省略時はアクティブなツールセッション |
| `create_session` | プロジェクトチャット作成、または `kind: "dm"` で Personal DM |
| `switch_session` | このジョブのアクティブセッションを切替（以降の省略 `chatId` に使う） |
| `send_message` | acting user として送信。実行中ジョブと同じチャットでは、明示しない限り新しいジョブを起こさない |
| `list_runtimes` | Org のマシン。`canUse` は default-deny の許可 |
| `get_runtime_status` | 1 台の online/offline・stale・検出 CLI。`tokenHash` は返さない |
| `list_connectors` | 見えるコネクタ（tahcode の接続状態。マーケットプレイス MCP ではない） |
| `get_connector_status` | 1 件（`connectionId`）または `provider` で一覧 |
| `list_linear_issues` | ジョブでメンションされた tahcode Linear の課題一覧（未メンション / 未接続では呼ばない） |
| `search_linear_issues` | 同上の全文検索 |
| `create_linear_issue` | 課題作成（`teamId` + `title`） |
| `update_linear_issue` | 課題更新（`issueId`） |

Linear の 4 ツールは `@linear` / `@linear/<slug>` があるジョブだけでカタログと MCP に載る。Claude では注入サーバ `tahcode-linear-<last8>`、ほかのハーネスでは `tahcode tool`。トークンは Convex action 側に残す。

他 Org の id を渡した場合は、その Org のメンバーであり、かつ既存の可視ルールを満たすときだけ通ります。メンバーでない Org や非公開プロジェクト／プライベートチャットは拒否します。
