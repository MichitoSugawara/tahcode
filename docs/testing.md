# テスト戦略（TAH-20）

Status: Proposed  
Date: 2026-09-13（棚卸しは 2026-09-14 の main に合わせて再計測）  
Issue: [TAH-20](https://linear.app/tahcode/issue/TAH-20)  
Repo: [https://github.com/MichitoSugawara/tahcode](https://github.com/MichitoSugawara/tahcode)

スケールに備えたテストの層分け・優先順位・CI 方針。**この文書は設計のみ。** テストコードの大量追加は後続 issue。カバレッジ％の目標は置かない。

実装の着手先は「[Phase 1 で最初に書くテスト](#phase-1-で最初に書くテスト)」をコピーして別 issue にする。

再ベース後も層分け・優先・末尾の 4 判断は据え置き。§3 の件数とギャップ表だけ最新 main に合わせた。

---

## 1. テストピラミッド / 層分け

tahcode は「Web UI → Convex →（チケット）Cloudflare Worker / R2 → 手元 CLI ブリッジ → 本物の provider CLI」が一本のジョブになる。全部を E2E でつなぐと、OAuth・マシン登録・vendor CLI が必須になり、PR では回らない。**契約は下の層で固定し、殻の起動だけを上の層で見る。**

```
        ┌─────────────────────────┐
        │  Desktop smoke（殻）     │  起動・deep link・offline。件数はごく少数
        ├─────────────────────────┤
        │  E2E（後回し・任意）      │  preview の黄金経路。Phase 1–2 では作らない
        ├─────────────────────────┤
        │  Process / 契約結合      │  runner / Worker / CLI をモック境界でつなぐ
        ├─────────────────────────┤
        │  convex-test             │  権限・ジョブ状態機械・チケット。バックエンドの主戦場
        ├─────────────────────────┤
        │  Unit（Vitest）          │  パーサ・ACL 述語・MIME・CLI 設定。最厚く最速
        └─────────────────────────┘
```

| 層 | 役割 | 動かしてよいもの | 動かさないもの | いまの置き場 |
| --- | --- | --- | --- | --- |
| **Unit** | 純関数と argv / MIME / メンション契約。失敗は「仕様が壊れた」と読めること | メモリ・一時ディレクトリ | ネットワーク、本物の CLI、Convex デプロイ | `tests/*.test.ts` |
| **convex-test** | 公開 query/mutation と internal の権限・状態遷移。Org 隔離の正本 | インメモリ Convex、`t.withIdentity`、`Date.now()` を mutation 内で使うこと | ライブデプロイ、R2、HTTP Action の TCP、provider CLI | `tests/convex/*.test.ts` |
| **Process / 契約結合** | ブリッジと Worker が Convex / R2 の**形**に正しく乗ること | 注入した fake `RuntimeClient`、fake `Env`（R2 + `callConvexJson`） | 本番 URL、本物の `codex` / `claude`、実バケット | ほぼ未着手（後続） |
| **Desktop smoke** | Electron が開き、OAuth 戻りと offline フォールバックが描画されること | ビルド済みシェル、xvfb、スクショ | ログイン後のチャット、ジョブ実行 | `apps/desktop/scripts/smoke.mjs` + `desktop.yml` |
| **E2E** | 人が踏む黄金経路の回帰（後回し） | preview URL、テスト専用 Org | 手元の vendor CLI、本番データ | なし。Phase 1–2 では導入しない |

### 各層の判定

- **権限・隔離・ジョブ状態**は必ず convex-test。`shared/access.ts` の unit は述語の固定用で、エンドポイントの拒否まで代替しない。
- **ランタイムループ**（claim → spawn → heartbeat → cancel poll → complete）は Convex をモックした process テスト。`convex-test` は HTTP クライアントを生やさない。
- **ファイル**はチケット状態を convex-test、バイト経路を Worker の fake Env。実 R2 は CI 必須にしない。
- **Composer** は「サーバと同じメンション境界」「プロジェクト送信時の自動 `@provider/model`」を unit に切り出す。PromptBar の見た目は E2E まで持たない。
- **本物の provider CLI** は CI 必須にしない。ハーネス固有フラグは `headlessArgs` の unit で固定する（製品ルール: LCM パイプに潰さない）。

### やらないこと（この戦略）

- カバレッジ％ゲート（Istanbul / c8 を PR 必須にしない）
- 全 PR でのブラウザ E2E
- Jest / Cypress / Testing Library の新規導入（Phase 1–2）
- pre-commit での `npm test`（lefthook は Ultracite のみ）

---

## 2. 優先領域（リスク順）

回帰コストが高い順。件数より「壊れたときのblast radius」。

| 順位 | 領域 | なぜ先か | 主戦場 | いま |
| --- | --- | --- | --- | --- |
| 1 | **Authz / Org isolation** | 他 Org のチャット・ファイル・ジョブが見えると製品事故 | convex-test | 拒否ケースは一部ある。ロール変更・ランタイム権限・メンテコマンド・一覧の隠れ方が薄い |
| 2 | **Jobs lifecycle** | cancel 以外（queue → claim → heartbeat → stale → complete / abort）が一本の状態機械 | convex-test | `jobs-cancel` は厚い。`jobs-complete`（finalText 置換）と `jobs-lease`（lease 省略互換 + 不一致拒否）が後から増えた。heartbeat / stale / 試行上限 / 一覧の隔離はまだ無い |
| 3 | **Runtime bridge** | 中断がサーバにだけ残り、プロセスが走り続ける | process + 既存の abort unit | `shouldAbort` ポーリングと `executeJob` が未テスト |
| 4 | **Files / R2** | チケット再利用・期限切れ・key 不一致はデータ漏れ | convex-test + Worker unit | MIME、「consume 後だけ record」、ハーネス成果物の ingest / `getByKey` / storage `ticketForKey` はある。R2 チケットの期限・再利用・Worker 本体は無い |
| 5 | **Composer / UI 契約** | UI がメンションを付け忘れるとサーバはジョブを飛ばさない（プロジェクトチャット） | unit（関数切り出し） | ハイライト / `hasAgentMention` はある。自動付与と optimistic id が無い |
| 6 | **CLI `link` / `start`** | 一発登録の直後にブリッジが旧トークンのまま、など | unit（`TAHCODE_HOME`） | デスクトップの**リクエスト検証**はある。`config.ts` / 起動シーケンスが無い |

### 各領域の契約（テストが守る文）

**Authz.** 非メンバーには「無い」ように見せる（`hidden`）。メンバーだが権限不足は明示拒否（`forbidden`）。private project / private chat / DM（Phase 1 は owner-only）/ ファイル key の偽造 / 他 Org の `memberIds`。

**Jobs.** 状態は `queued → running → done | failed | cancelled`。`STALE_JOB_MS`（90s）で running を再キュー、`MAX_JOB_ATTEMPTS`（3）で failed。cancel 中の queued は claim しない。`leaseId` 不一致は append/complete を拒否し、`shouldAbort` は true。終了後の cancel はエラー。

**Bridge.** `jobs.shouldAbort === true` なら AbortSignal と Multica `cancel-task`。能力ビット `jobCancel` を heartbeat する。サーバが cancelled でもブリッジが complete で上書きしない。

**Files.** upload チケットは単回・期限付き。`record` は consume 済みかつ同一 user/org/chat の key だけ。download は key とチケットが一致し期限前。Worker はチケット無し / Convex 拒否 / 空ファイル / 20MB 超を 4xx。

**Composer.** プロジェクト送信でエージェント言及が無ければ `agentMention(driver, model)` を先頭に付ける。DM は付けない（サーバが常時 dispatch）。プレースホルダ id（`pending-…`）は mutation に載せない。

**CLI.** `link` は `~/.tahcode/config.json`（mode 0600）。未設定時のみ `~/.dalecode/config.json`。環境変数 `TAHCODE_*` がファイルより優先。`start` はリンク必須、bridge.json に pid を書く。本物の daemon は CI で起こさない。

main に後から入った **Connectors（Linear OAuth / マルチアカウント）** は `connectorConnections` + `connectorConnect` で CRUD・authz・OAuth 往復が厚い。Phase 1 の範囲には入れない（既存カバー）。

---

## 3. 既存テストの棚卸しとギャップ

計測（再ベース後の main、`npm test`）: **48 ファイル / 374 例 / 約 3.8 秒**（codegen 込み。Vitest 本体は約 2 秒）。当初案の 25 / 179 / 2.1 秒から増えたのはコネクタ・preview ログイン・成果物・lease 互換などの後続 PR。CI `check` ジョブの timeout は 15 分で、テスト自体は十分短い。

### 層ごとの現状

| 層 | ファイル数 | おおよその例 | カバーしているもの | 欠け |
| --- | --- | --- | --- | --- |
| Unit | 38 | 310 | メンション / モデル / effort / Cursor 家族、ACL 述語、デスクトップ register・更新チェック、preview Wrangler 分類と preview ログイン契約、コネクタカード / OpenConnector、スキル MD、MIME、JWKS、abort spawn、成果物パス、fuzzy suggest | CLI `config` / `parseArgs`、Composer 自動メンション、optimistic id、Worker `fetch` |
| convex-test | 10 | 64 | 上記に加え **jobs.complete の finalText**、**lease 省略互換**、ハーネス成果物 ingest、Linear connect / connections の CRUD・authz、preview seed | heartbeat / stale / 試行上限、残 authz、`runtimeCommands` |
| Process | 0 | 0 | — | runner ループ、Worker アップロード、CLI start |
| Desktop smoke | スクリプト 1 | CI 3 経路 | 起動スクショ、`tahcode://` コールバック、offline | ログイン後 UI |
| E2E | 0 | 0 | — | 意図的（Phase 1–2 対象外）。preview password ユーザは後から用意済み |
| Worker / CLI パッケージ単体 | 間接のみ | — | MIME は `shared/files.ts` | `worker/index.ts`、`packages/cli/src/config.ts` |

### convex-test 10 本の中身

| ファイル | 見ている公開面 | 見ていない隣接面 |
| --- | --- | --- |
| `authz.test.ts` | `chats.createProjectChat`（見えない private）、`addMember`（他 Org user）、`files.record`（偽 key / 未 consume）、`orgs.acceptInvite`（未検証メール）、`messages.list`（部外者・private） | `orgs.setRole`、`createInvite`、`projects.list` / `setProfile`、`chats.ensureDm` / `setAgent` / `addMember`、`runtimes.*`、`files.prepareUpload` / R2 チケット期限 |
| `jobs-cancel.test.ts` | cancel 権限（requester / admin / runtime owner / 部外者 / 未認証）、queued の非 claim、running の `shouldAbort`、完了後 cancel | `claimNext` 成功の専用ケース、heartbeat、stale 再キュー / 試行上限、`get` / `activeForChat` の隔離 |
| `jobs-complete.test.ts` | `complete` が stream 本文を `finalText` で置換する | `error` → `failed`、cancelled / 既終了の no-op |
| `jobs-lease.test.ts` | published CLI が `leaseId` を省略しても append / complete できる。不一致は拒否 | heartbeat 付き lease 更新、stale 後の再 claim |
| `artifacts.test.ts` | `ingestFromRuntime`、storage `ticketForKey` / `getByKey` / `listByMessage`、部外者隠れ、悪いトークン | R2 アップロードチケットの期限・再 consume、`authorizeDownloadTicket` |
| `skills.test.ts` | ライブラリ CRUD、プロファイル取り付け、クロス Org、member の書き込み拒否 | `skillImport` action（ネットワーク）、プロジェクト / チャットへの profile 継承 |
| `agentTools.test.ts` | ジョブスコープの list、private の隠れ、悪いトークン / 他人の lease、session switch、トークン非返却 | ツールごとの書き込み副作用の網羅 |
| `connectorConnections.test.ts` | org/user スコープの upsert / list / rename / disconnect / remove、他 Org・member の境界 | なし（この面は厚い） |
| `connectorConnect.test.ts` | Linear `start` / `complete` の OAuth 往復、未設定 env、member 拒否 | 実 OpenConnector ネットワーク |
| `seed.test.ts` | Preview org 作成、本番 `SITE_URL` 拒否、preview password ユーザ | production / staging 以外の誤設定 |

### 公開 Convex 面とテスト（ギャップ表）

| モジュール | 公開関数 | 自動テスト |
| --- | --- | --- |
| `orgs` | create, listMine, get, members, setRole, createInvite, acceptInvite | create は fixture、acceptInvite の verified のみ |
| `projects` | create, list, get, members, addMember, setProfile | create + addMember 拒否 |
| `chats` | ensureDm, createProjectChat, list, get, setAgent, setProfile, members, addMember | createProjectChat 拒否のみ |
| `messages` | list, send | list の隠れ。send は job を作るためだけ |
| `jobs` | claimNext, heartbeat, appendEvent, complete, get, listByChat, activeForChat, cancel, shouldAbort | cancel / shouldAbort / 非 claim。complete の finalText。lease 省略と不一致。claim は fixture として使うだけ |
| `files` | prepareUpload, record, getByKey, listByMessage, listByChat, ticketForKey, ingestFromRuntime + internal consume/authorize | record + consume 成功。成果物 ingest / storage URL。R2 期限・再 consume は無い |
| `runtimes` | register, list, grant, revokeGrant, remove, setMaintenancePolicy, report | 行を直接 insert するだけ |
| `runtimeCommands` | request, cancel, list, claimNext, appendLog, complete | **ゼロ**（unit の `canRequestMaintenance` のみ） |
| `agentTools` | invoke | 代表的な認可 |
| `skills` / `skillProfiles` | CRUD + attach | 厚い |
| `connectorConnections` | listByOrg, upsert, disconnect, rename, remove | 厚い（後続 PR） |
| `connectorConnect` | startLinearConnect, completeLinearConnect, startGithubConnect, completeGithubConnect | 厚い（fetch は mock。GitHub は Linear と同じ start+complete） |
| `seed` | ensurePreviewLogin / ensurePreviewWorkspace | preview のみ。本番拒否あり |
| `users` | me, updateProfile, ensureHandle | なし |
| `http.ts` | `/files/consume-upload`, `/files/authorize-download` | なし（internal を呼べば足りる） |

### ブリッジ / CLI / Worker / UI

| 面 | あるもの | ギャップ |
| --- | --- | --- |
| `runtime/src/runner.ts` | なし | `runLoop` / `executeJob` の cancel poll、cancelled 後の complete 抑制 |
| `runtime/src/convexClient.ts` | なし | 文字列名 `"jobs:heartbeat"` などの結合は型で固定し、挙動は convex-test 側 |
| `runtime/src/providers.ts` | stream 重複 drop、プロセス abort、`headlessArgs`、Cursor 家族 / effort | 実 CLI は呼ばない（正しい） |
| `packages/cli` | なし | `link` / legacy dalecode / env override / `maskToken` / `parseArgs` |
| `worker/` | MIME / disposition / ファイル名サニタイズ | `handleUpload` / `handleDownload`（チケット欠落、Convex 401、空、サイズ） |
| Composer | `segmentMentions` / `hasAgentMention` / fuzzy suggest / コネクタ言及 / ログイン文言 | `useSendMessage` の自動 `@`、`isPlaceholderId` |
| Desktop | register ペイロード、更新チェック、deep link、smoke 3 本 | IPC の成功パス（実 `tahcode link` は必須にしない） |
| Connectors UI | カード CTA、OpenConnector URL、マルチアカウント表示契約 | ブラウザでの OAuth 実クリック |

### 構造上の負債（実装 Phase 1 の最初に直す）

10 本の convex-test が `fresh` / `insertUser` / `asUser` / org+runtime seed をコピーしている（helpers はまだ無い）。`tests/convex/helpers.ts` に寄せてからケースを足す。

Identity は Convex Auth の `getAuthUserId` に合わせ、`${userId}|test-session` を helpers に固定して書く。

---

## 4. ツール選定

**現状を維持するのが前提。** 足すなら理由を書く。

| ツール | 判断 | 理由 |
| --- | --- | --- |
| **Vitest 3** | 継続 | 374 例が約 4 秒。アプリ / runtime / CLI / Worker 補助を一つの `tests/**/*.test.ts` で足りている |
| **convex-test 0.0.58** | 継続・主戦場をここに増やす | 公式スキルどおりインメモリ。auth / index / スケジュールをライブデプロイ無しで固定できる |
| **既存 Desktop smoke（Electron + xvfb）** | 継続、パスフィルタ維持 | 殻の起動回帰。Web E2E の代替にはしない |
| **Playwright / `@playwright/test`** | **今は足さない** | `playwright-core` は依存にあるがソースから未使用。preview password ログインと Preview org は後から用意された。導入は Phase 3 以降で「黄金経路 3 本」に限定するときだけ |
| **React Testing Library** | **今は足さない** | PromptBar は大きい。契約は `hasAgentMention` / `agentMention` / 切り出した `composeOutboundBody` で足りる |
| **`@cloudflare/vitest-pool-workers` / Miniflare** | **Phase 2 まで保留** | Worker は `default.fetch` に fake `Env`（in-memory R2 + stub `fetch`）を渡せば足りる見込み。足りなければそのときだけ入れる |
| **カバレッジゲート** | **入れない** | 数値目標は TAH-20 の対象外。必要ならローカルの任意レポートに留める |
| **lefthook で test** | **入れない** | コミットは Ultracite。テストは CI |

### テスト可能な継ぎ目（実装時に先に切る）

新しいランナーやフレームワークより、境界を注入可能にする。

1. `tests/convex/helpers.ts` — `fresh`, `asUser`, `seedOrgChat`, `seedOrgWithRuntime`, `sendJob`
2. Composer — `composeOutboundBody({ kind, draft, driverKind, model })` を `src/lib` か `src/harness` の純関数に出す
3. Runner — `executeJob` が `RuntimeClient` 相当（`claimNext` / `shouldAbort` / `appendEvent` / `complete`）を受け取る
4. Worker — `handleUpload` / `handleDownload` を export するか、`default.fetch` を fake Env で呼ぶ
5. CLI — `config.ts` は既に純。`TAHCODE_HOME` を tmp にして `link` / `unlink` / legacy を unit する。`parseArgs` は export する

### convex-test の境界

- **使う:** `t.query` / `t.mutation` / `t.run`、internal（`consumeUploadTicket` 等）、`t.withIdentity`
- **使わない:** ライブ `CONVEX_URL`、実 R2、`http.ts` の TCP。HTTP Action は thin なので internal を直接呼ぶ
- mutation 内の `Date.now()` は問題ない。stale テストは `t.run` で `lastHeartbeatAt` を過去にずらす
- query に `Date.now()` を足さない（既存の Convex ルールどおり）

---

## 5. CI での実行方針

### いま

| Workflow | トリガ | 中身 | timeout |
| --- | --- | --- | --- |
| `ci.yml` **Lint, typecheck, test** | 全 PR + `main` | Ultracite → `lint:convex` → `typecheck` → `npm test` | 15 分 |
| `desktop.yml` Linux | `apps/desktop` / `packages/core` / lockfile | typecheck + **もう一度 `npm test`** + smoke 3 + linux dir | 20 分 |
| `desktop.yml` macOS | tag / dispatch | .dmg。テストではない | 30 分 |
| `deploy.yml` preview | 同一 repo の PR | Convex + CF。**テストゲートではない** | 20 分 |

lefthook は format/lint のみ。テストは載せない。

### 方針（PR 必須を増やさない）

**すべての PR で必須（`ci.yml` の 1 ジョブのまま）**

1. Ultracite（`--deny-warnings`）
2. Convex ESLint
3. Typecheck（app / convex / runtime / cli / core / desktop）
4. `npm test`（unit + convex-test。今後増やす分も含む）

時間予算: テスト単体は **ローカル 60 秒以内を目安**（現状約 4 秒）。ジョブ全体は **実測 10 分以内、timeout 15 分のまま**。vitest が 3 分を超えたら同一ジョブ内で `unit` / `convex` の project 分割を検討する。ジョブ分割はさらに遅くなってから。

**パスがあるときだけ（現状維持）**

- Desktop Linux smoke。Web だけの PR で macOS 分も Electron も回さない

**PR 必須にしない**

- ブラウザ E2E
- 実 R2 / 実 Convex preview への自動クリック
- 実 provider CLI
- カバレッジアップロード
- Desktop macOS ビルド

**preview デプロイ**は人手確認用。失敗しても「テストが赤」とは別（既存どおり、資格情報欠如は skip）。将来 E2E を足すなら preview URL を入力にするが、デプロイ成功を test job の `needs` にはしない（secret の無い fork が詰まる）。

**任意の後続（Phase 3+）**

- `workflow_dispatch` / nightly: desktop smoke をパス無視で 1 回、または preview に対する短い Playwright
- `desktop.yml` の重複 `npm test` は削ってよい（`ci.yml` と二重）。動作変更なので実装 issue で扱う

### 失敗の読み方

| 赤                    | 意味                                       |
| --------------------- | ------------------------------------------ |
| Ultracite / typecheck | マージしない。テストより先に直す           |
| unit                  | 契約（メンション、ACL 述語、MIME）が壊れた |
| convex-test           | 権限またはジョブ状態機械が壊れた。最優先   |
| desktop smoke         | 殻。Web の authz とは切り分ける            |
| preview               | インフラ。テスト戦略の外                   |

---

## 6. Phase 分けの実装ロードマップ

実装は別 issue。この文書はリストの正本。

### Phase 0（この PR）

- 本戦略のレビュー
- 実装 issue を切る（下の Phase 1 リストを本文に貼る）

### Phase 1 — 権限とジョブ状態機械（最初に書く）

目的: 直近で増えた authz / cancel / チケットの**隣**を埋める。新ツールなし。helpers 抽出が先。

予想規模: convex-test 20–30 例、helpers 1 ファイル。`npm test` は数秒のまま。

### Phase 2 — ブリッジ / CLI / Worker の契約

目的: プロセス境界をモックで固定。`link` / チケット HTTP / cancel poll。

予想規模: unit 15–25 例。Worker は fake Env。足りなければそのとき Miniflare を検討。

### Phase 3 — Composer 契約と（任意）薄い E2E

目的: 自動メンションと placeholder を unit 化。preview password ユーザ（`test@test.com`）と Preview org は後から用意済み。E2E を入れるなら黄金経路 3 本だけ。Phase 1–2 では作らない。

### Phase 4 — 棚の維持（常時）

- 新しい公開 mutation は「成功 1 + 拒否 1（他 Org またはロール不足）」を同じ PR に入れる
- ジョブ状態を足したら `jobs-lifecycle` に遷移を 1 本足す
- カバレッジ％は依然としてゲートにしない

---

## Phase 1 で最初に書くテスト

実装 issue のチェックリスト。ファイル名は目安。

### 0. 足場

- [ ] `tests/convex/helpers.ts` に `fresh` / `insertUser` / `asUser` / `seedOrgChat` / `seedOrgWithRuntime` / `addMember` / `sendJob` を集約
- [ ] 既存 10 ファイルを helpers に切替（挙動変更なし）

再ベース時点の部分カバー（チェックは外したまま。専用 lifecycle ファイルは未着手）:

- `claimNext` 成功は fixture として複数ファイルが呼ぶ。悪いトークン / 空キュー / skills 搭載の専用ケースは無い
- `appendEvent` の stream と lease 不一致は `jobs-lease` にある。`cancelled` no-op は無い
- `complete` の finalText 置換は `jobs-complete`。`error` / 既終了 no-op は無い
- `files.getByKey` の部外者隠れと storage `ticketForKey` は `artifacts`

### 1. Jobs lifecycle — `tests/convex/jobs-lifecycle.test.ts`

- [ ] `claimNext`: queued を running にし `leaseId` を返す。skills がチャットの profile から載る
- [ ] `claimNext`: 悪いトークンは throw。キュー空は `null`
- [ ] `claimNext`: cancel 済み queued は拾わない（既存の再掲でも可）
- [ ] stale: `lastHeartbeatAt` を `STALE_JOB_MS` より過去にし、heartbeat または claim で `queued` に戻る
- [ ] stale: 試行が `MAX_JOB_ATTEMPTS` を超えたら `failed`、「Runtime lost contact…」、assistant が `error`
- [ ] `appendEvent`: `text` が assistant body に載り `streaming` になる
- [ ] `appendEvent`: `cancelled` は no-op。lease 不一致は throw
- [ ] `complete`: 成功で `done`、`error` ありで `failed`。`cancelled` / 既終了は no-op
- [ ] `shouldAbort`: 欠落ジョブは `true`、他 runtime は throw、lease 不一致は `true`、通常 running は `false`
- [ ] `jobs.get` / `listByChat` / `activeForChat`: 他 Org・private の部外者は `null` / 空 / throw（既存の list メッセージと同じ「無い」）

### 2. Authz の残り — `tests/convex/authz.test.ts` または分割

- [ ] `messages.send`: プロジェクトで言及なし → `dispatched: false`、job なし
- [ ] `messages.send`: DM は言及なしでも dispatch（runtime 無しなら日本語の欠落メッセージ）
- [ ] `orgs.setRole`: member は昇格できない。owner は admin を下げられる
- [ ] `chats.addMember` / `setAgent`: 見えないチャットは拒否
- [ ] `runtimes.grant` / `revokeGrant` / `remove` / `setMaintenancePolicy`: owner 以外の境界
- [ ] `runtimeCommands.request`: member は `updateCli` 不可。owner は可。`refreshModels` は job 利用可なら可（`canRequestMaintenance` と一致）
- [ ] `files`: consume の期限切れ・再 consume はエラー。`authorizeDownloadTicket` は key 不一致 / 期限切れで `null`
- [ ] `files.ticketForKey` / `listByChat`: 他 Org から見えない

### 3. Phase 1 では書かない（次 issue）

- `runLoop` / 実プロセスの `tahcode start`
- Worker `fetch` の結合
- Playwright
- `skillImport` のネットワーク
- Desktop IPC の成功パス（実 CLI インストール）

---

## レビューしてほしい判断

1. **E2E を Phase 1–2 で導入しない**（preview は人手、Desktop smoke は殻のみ）
2. **必須 CI を増やさない**（今の `ci.yml` 1 ジョブ + パス付き desktop）
3. **カバレッジ％をゲートにしない**
4. **Phase 1 の具体リスト**が次 issue の範囲として妥当か（jobs + 残 authz + helpers）

反対が無ければ、Phase 1 実装 issue にこのチェックリストを移して着手する。
