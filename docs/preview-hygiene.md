# Preview 資源の掃除と手元デプロイ

> 2026-10-13 時点でインフラは一時停止中。週次 prune と PR preview デプロイは止まっている。[docs/infra-pause.md](infra-pause.md) を先に読む。

Convex チームの **deployment quota（例: 40）** に当たると新しい preview が作れない。GitHub Actions が課金切れで止まっても、PR レビュー用の preview は必要になる。Cloudflare の `tahcode-preview` にも version / preview-alias が溜まる。この文書は **課金や枠で止まらない** ための掃除と、Actions なし手元デプロイの手順。

本番 Convex / 本番 Worker / staging は対象外。開いている PR の `pr-N` は消さない。

## Quota の仕組み

| 資源 | 何が溜まるか | 上限の目安 | 消してよいもの |
| --- | --- | --- | --- |
| Convex preview | `npx convex deploy --preview-name …` が作る preview deployment。昔のブランチ slug（`cursor-…`）も 1 枠 | チームあたり約 40 | 閉じた / マージ済み PR の `pr-N` と leftover ブランチ slug |
| Cloudflare `tahcode-preview` | `wrangler versions upload --preview-alias pr-N` の version と alias | alias は直近 1000 件。version も増え続ける | 閉じた PR の alias と、デプロイ中でない古い version |
| GitHub Actions | `deploy.yml` の preview ジョブ | アカウントの分課金 | ジョブ自体は消せない。止まっているときは手元デプロイ |

守るもの:

- 開いている PR の `pr-N` と、そのブランチ slug
- 共有 fallback 名 `ci`（`--include-ci` なしでは消さない）
- Convex の `prod` / `dev` / `custom` / `production` / `staging`
- Worker `tahcode` と `tahcode-staging`（スクリプトは `tahcode-preview` 以外を拒否する）

削除の流れ（Convex）は既存の isolate と同じで、preview deploy key で identifier を claim（reuse）してから Management API `POST /v1/deployments/{name}/delete` する。存在確認だけなら `GET /teams/{team}/projects/{project}/deployment?reference=preview/{id}` を先に使う。

## 掃除コマンド

既定は **dry-run**。削除するには `--apply`。`.env.preview.enc` の復号は `--decrypt` を付けたときだけ走る（無いと CONVEX / Cloudflare 資格情報が読めず、その側はスキップする）。

```bash
export DOTENV_PRIVATE_KEY_PREVIEW=…   # GitHub secret と同じ復号鍵

# 何が消えるか見る（gh で open / closed PR を読む）
npm run preview:prune
# または
node scripts/preview-prune.mjs --dry-run --decrypt

# 実際に消す
node scripts/preview-prune.mjs --apply --decrypt --sweep-unmapped
```

よく使うフラグ:

| フラグ | 意味 |
| --- | --- |
| `--dry-run` | 計画だけ出す（省略時の既定） |
| `--apply` | 同じガードのうえで削除する |
| `--decrypt` | `.env.preview.enc` を先に復号する |
| `--convex-only` / `--cloudflare-only` | 片方だけ |
| `--exclude-names a,b` | 追加で守る identifier（open PR の `pr-N`） |
| `--prune-names a,b` | 追加の stale identifier |
| `--sweep-unmapped` | 一覧できた leftover preview deployment も、open PR に紐づかないものだけ消す |
| `--skip-github` | `gh` を呼ばない。`--apply` するなら `--exclude-names` 必須 |
| `--keep-versions N` | Cloudflare で残す新しい version 数（既定 10） |

`--apply` は **open PR の一覧が取れたとき**（または `--exclude-names` を明示したとき）だけ通る。`gh` が失敗した空リストで全消ししない。

## GitHub Actions が使えるとき

`.github/workflows/preview-prune.yml` が次で同じスクリプトを回す。

- `pull_request` が `closed` のとき `--apply`
- 週次 cron `--apply`
- `workflow_dispatch` は既定 dry-run。`apply` をオンにしたときだけ削除

Actions が未払い / 復号鍵が無いときはジョブをスキップする（失敗で main を赤くしない）。その場合は上の手元ワンコマンドが正本。

## GHA なし手元 preview（Actions が死んだとき）

CI の `deploy-stack` と同じ順を、1 コマンドにまとめてある。

```bash
export DOTENV_PRIVATE_KEY_PREVIEW=…

node scripts/preview-deploy-local.mjs --pr 62
# または
npm run preview:deploy -- --pr 62
```

中身:

1. `node scripts/env.mjs decrypt preview`
2. （`--prune` 時）Convex の stale preview を `--apply` で掃除
3. `scripts/convex-preview-deploy.mjs --preview-name pr-62`（quota なら leftover を claim → DELETE して `pr-62` を取り直す）
4. `wrangler versions upload --env preview --preview-alias pr-62`（Worker は `tahcode-preview` のみ）
5. `scripts/sync-convex-auth-env.mjs`（`SITE_URL` を preview origin に向ける）
6. `scripts/seed-preview-login.mjs`（`test@test.com` / `test1234`）

`--dry-run` で手順だけ確認できる。`--skip-cloudflare` は Convex だけ。Google OAuth は preview では使えない。

手動でバラして回す場合も同じ順で、production / staging の `wrangler deploy` や `convex deploy --prod` は呼ばない。

## 関連スクリプト

- `scripts/convex-preview-isolate.mjs` — claim / Management API delete / list
- `scripts/convex-preview-deploy.mjs` — CI と手元の Convex preview デプロイ
- `scripts/preview-prune.mjs` — Convex + Cloudflare 掃除 CLI
- `scripts/preview-deploy-local.mjs` — 手元ワンコマンド
- `scripts/wrangler-deploy.mjs` — preview の versions upload（本番 Worker は触らない）
