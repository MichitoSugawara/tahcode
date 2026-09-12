# Team Harness — チーム作業場 Phase 1

Multica-based チーム作業場と同じプロダクト構想の、最小チームチャット + オンマシン・コーディングエージェント。
Phase 1 の垂直スライス: Org / Project 作成、Personal DM + プロ젝트チャット、メンション応答、
履歴 + メンション + プロジェクトリンクのコンテキスト、t3code 由来プロバイダのマシンランタイム、
最小ロール + ランタイム許可。Convex（データ/リアルタイム）+ Cloudflare（ホスティング/ファイル）。

UI は https://www.beautifului.dev/harness の chat-first な見た目を手本にしたもの。
プロバイダ配線は https://github.com/pingdotgg/t3code の `builtInDrivers.ts`
（Codex / Claude / Cursor / Grok / OpenCode / Antigravity の6種）を移植。
Multica からは Org / member / chat の考え方だけ借りた新規実装（フォークではない）。

## Scope（Phase 1）

- ✅ Org → Project 階層、プロジェクト可視性（org / private）+ プライベートチャットの per-chat 追加
- ✅ Personal DM（Phase 1 は owner-only）+ プロジェクトチャット
- ✅ エージェント応答: DM は常時、他は @mention（@agent / @codex / @claude / @cursor / @grok / @opencode / @antigravity / @rt-…）時のみ
- ✅ コンテキスト = 直近履歴 + メンション + プロジェクトリンク（Focus なし）
- ✅ マシンランタイム（t3code 由来の headless CLI 実行）+ default deny のランタイム ACL（user / role 混在可）
- ✅ ロール: owner（全体）/ admin（招待 + 権限）/ member（見える範囲のみ）
- 🚫 対象外: Kanban/Issue、Focus モード、Codex Cloud / Cursor Cloud Agent、DM の後から共有 UI、Linear 連携、Cloudflare 上でのエージェント実行

## Stack

- UI: Vite + React 19 + Tailwind v4 + Convex Auth（Password）+ react-router
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

# 2) Web（別ターミナル）
npm run dev        # http://127.0.0.1:43173

# 3) ファイル Worker（別ターミナル、R2 ローカル永続化）
npm run dev:files  # http://127.0.0.1:43174（Vite が /api/files をプロキシ）
```

`.env.local` は `npx convex dev` が生成（`VITE_CONVEX_URL=http://127.0.0.1:3210`）。
本番相当の確認: `npm run build` → `npm run preview:cf`（dist を Worker で配信）。

### マシンランタイム

1. Web UI で登録 → Runtimes ではなく右パネル **Runtime** タブ →「Register this machine」。
   トークンは一度だけ表示されるので保存する。
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

1. Org / Project 作成 → サイドバー（Org 作成、Project 作成 org/private）
2. DM / プロジェクトチャット → DM は初回自動作成、プロジェクトチャットは +chat
3. DM 常時 / 他はメンション時のみ → `shared/mentions.ts` + `convex/messages.ts:send`
4. Context = 履歴 + メンション + プロジェクトリンク → `convex/lib/context.ts`（ジョブに JSON 同梱、ランタイムがプロンプトに付与）
5. t3code 由来プロバイダで実行 → `runtime/src/providers.ts`（6種カタログ、`codex exec` / `claude -p` / `agent -p` / `grok` / `opencode run`）
6. 最小ロール + ランタイム許可 → Org ロール + `runtimeGrants`（default deny、machine owner 付与）
7. Convex + Cloudflare → Convex が全データ/リアルタイム、Worker + R2 がホスティング/ファイル

## スタブ・既知の制限

- **Antigravity**: headless CLI がないためランタイムは「未対応」表示 + ガイド文。カタログには含む。
- **Grok headless flags**: CLI の headless 引数は暫定（`grok --prompt`）。手元に CLI があれば `providers` コマンドで確認し、ずれていたら `runtime/src/providers.ts` の1箇所を直す。
- **プロジェクトメンバー追加 UI なし**: private project への追加は現状 `projects:addMember` 関数呼び出し（`npx convex run` 等）。UI は Org メンバー + プライベートチャット追加のみ。
- **ファイル配信**: 本番は R2 バインディング必須（`wrangler deploy` 前に `team-harness-files` バケット作成）。ローカルは `wrangler dev` のローカル永続化。
- **Convex デプロイ**: ローカルは匿名モード。本番 Convex へのリンクは未実施（`npx convex login` → 通常 `dev`/`deploy`）。
- **承認フロー**: headless 実行は非対話（権限は各 CLI 側の事前設定に委譲）。t3code の approval デシジョン同期は Phase 1 外。

## 開発コマンド

```bash
npm run typecheck  # TS（app / convex / runtime）
npm run lint       # eslint（Convex プラグイン含む）
npm test           # vitest（mentions / access）
npm run build      # 本番ビルド
```
