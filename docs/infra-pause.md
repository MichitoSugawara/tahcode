# インフラ一時停止（2026-10-13）

tahcode の公開面と自動デプロイを **一旦すべて止める**。データは消さない。

## 止めるもの / 残すもの

| 対象 | 停止時 | 残す |
| --- | --- | --- |
| Cloudflare `tahcode` / `tahcode-staging` / `tahcode-preview` | 503 ページに差し替え | Worker 名、カスタムドメイン `tahcode.com` |
| Convex prod / staging | cron を空にする（30 秒 sweep を止める） | テーブル・ファイル・Auth |
| Convex preview（`pr-N` など） | 削除して枠を空ける | — |
| R2 `team-harness-files*` | 触らない | バケットとオブジェクト |
| GitHub Actions Deploy / Preview prune / Publish CLI / Desktop | 自動トリガーを外す | `workflow_dispatch` と `ci.yml` |
| npm `tahcode` | 公開済みパッケージは消さない | — |

Convex の **プロジェクト自体** は残る。月額をゼロにするなら [Convex Dashboard](https://dashboard.convex.dev) でプロジェクトを Pause / 削除する（このリポジトリからはやらない）。

## この PR / 手元で止める

マーカー `infra/PAUSED` があるときだけ `--apply` が通る。

```bash
export DOTENV_PRIVATE_KEY_PRODUCTION=…
export DOTENV_PRIVATE_KEY_STAGING=…
export DOTENV_PRIVATE_KEY_PREVIEW=…

# 計画だけ
npm run infra:pause

# ライブを止める（Worker 503 + Convex cron 空 + preview 削除）
npm run infra:pause -- --apply --decrypt
npm run infra:pause -- --apply --decrypt --target production
```

CI は `.github/workflows/infra-pause.yml` が同じコマンドを production / staging / preview 環境の復号鍵で回す。

## 再開

1. `infra/PAUSED` を消す。
2. `convex/crons.ts` に `failUnclaimedSweep` の interval を戻す。
3. `deploy.yml` / `preview-prune.yml` / `publish-cli.yml` / `desktop.yml` の `on:` を git 履歴から戻す。
4. `infra-pause.yml` の PR 自動 apply を止めるかファイルを消す。
5. 通常どおり staging → production をデプロイする。

```bash
npx dotenvx run -f .env.production -- npx convex deploy --yes
npx dotenvx run -f .env.production -- npx wrangler deploy
```
