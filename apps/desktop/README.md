# tahcode Desktop（macOS シェル）— `@tahcode/desktop`

tahcode の Web アプリ（https://tahcode.gawara.workers.dev）を包む **Electron + electron-vite** 製のデスクトップシェル。 [Multica](https://github.com/multica-ai/multica) と同じく **1 つのモノレポに Web と Desktop を置き、共有パッケージ + 薄いシェル**で構成する（レイアウトの対応表はルート README の「リポジトリ構成」）。UI は一切バンドルせず、デプロイ済みの Web をそのまま読み込む（既定は production。環境変数で staging / local に切替）。シェル側が持つのは「ハード化した BrowserWindow」「ナビゲーションの境界」「Google OAuth をシステムブラウザで回して `tahcode://` で戻す仕組み」の 3 点だけで、Web と共有する契約は `@tahcode/core/desktop` にある。

![Home (3 ペイン) を Electron で表示](../../docs/desktop-screenshots/04-home-three-pane.png)

## Mac でビルドして動かす（Apple Silicon）

前提: macOS 12+、Node 22+、npm、Xcode Command Line Tools（`xcode-select --install`。dmg 作成に `hdiutil` を使う）。

```bash
# リポジトリのルートで（npm workspaces: apps/* と packages/* が 1 つの lockfile に入る）
npm install --legacy-peer-deps   # Electron 本体は初回起動時に取得される

# 開発起動（electron-vite dev: main / preload を watch、production の Web を読み込む）
npm run desktop:dev

# .app（未署名、apps/desktop/release/mac-arm64/tahcode.app）— Google ログインの deep link 検証はこちらで
npm run desktop:pack

# 配布物: apps/desktop/release/tahcode-0.1.0-mac-arm64.dmg / .zip（未署名）
npm run desktop:build
# Developer ID + 公証（CSC_* / APPLE_* が必要。下記「署名と公証」）
# npm run desktop:build:signed
open apps/desktop/release/tahcode-0.1.0-mac-arm64.dmg
```

ワークスペース指定で直接叩く場合: `npm run <script> -w @tahcode/desktop`（`dev` / `build` / `pack` / `dist:mac`（未署名 arm64）/ `dist:mac:signed`（Developer ID + 公証）/ `dist:mac:universal`（arm64 + x64）/ `dist:mac:intel` / `smoke`）。ルートからは `npm run desktop:build`（未署名）と `npm run desktop:build:signed`。

未署名の .app なので、初回は Finder で **右クリック → 開く**（または `xattr -dr com.apple.quarantine <path>.app`）。自分の Mac でビルドした .app には quarantine 属性が付かないため、そのまま開ける。Apple Silicon 向けには electron-builder が ad-hoc 署名を自動で施す。

### 接続先の切替

| 方法 | 例 |
| --- | --- |
| メニュー **Server**（設定は `~/Library/Application Support/tahcode/settings.json` に保存） | Production / Staging / Local |
| `TAHCODE_DESKTOP_ENV` | `TAHCODE_DESKTOP_ENV=staging npm run desktop:dev`（`npm run dev:staging` / `dev:local` も同じ） |
| `TAHCODE_DESKTOP_URL` または `--url=` | `TAHCODE_DESKTOP_URL=https://tahcode-pr-12.gawara.workers.dev npm run desktop:dev` |

`local` は `http://127.0.0.1:43173`（`npm run dev` の Vite）。Vite / Convex / files Worker はどれも loopback なので同一オリジン扱い。

その他の環境変数: `TAHCODE_DESKTOP_DEVTOOLS=1`（起動時に DevTools を開く）、 `TAHCODE_DESKTOP_OAUTH=in-app`（後述、開発用）、`TAHCODE_DESKTOP_SMOKE=<png>`（CI 用のスクリーンショット即終了モード）。

## Electron を選んだ理由（vs Tauri）

| 観点 | Electron（採用） | Tauri |
| --- | --- | --- |
| レンダリング | Chromium 同梱。Web アプリは Chromium 系で検証済みなので**見え方が完全に一致**（Beautiful UI の `oklch` / `color-mix` / backdrop など） | macOS は WKWebView（Safari 系）。CSS/JS の差分検証が別途必要、DevTools も限定的 |
| OAuth / deep link | `open-url` + `setAsDefaultProtocolClient` + `will-navigate` で完結。実績が多い | plugin-deep-link + plugin-opener で可能だが Rust 側の配線が必要 |
| ツールチェーン | Node + npm のみ。既存の TS/ESLint/Vitest にそのまま乗る。**Linux CI でも起動・スクショが撮れる**（xvfb） | Rust toolchain + `cargo`、Linux では webkit2gtk 一式。この VM では Mac バイナリも Linux 検証も重くなる |
| セキュリティ既定 | `contextIsolation` + `sandbox` + preload 経由の最小ブリッジで、Web 側は `window.tahcodeDesktop` しか見えない | IPC allowlist（capabilities）。同等の隔離は可能 |
| 配布サイズ | ~200 MB（Chromium 込み） | ~10 MB |
| 署名 / 公証 | electron-builder に `notarize` 内蔵 | tauri-bundler でも可能 |

判断: このシェルは**「Web アプリを 1 枚のウィンドウに載せて OAuth / deep link / この Mac の登録を正しく扱う」**ことが仕事で、Rust で書くネイティブ機能がない。Chromium との描画一致と、Linux CI で実機相当の起動確認（本 PR のスクリーンショットはすべて Ubuntu の xvfb 上で撮影）ができる点を優先し、サイズの不利は許容した。ローカル CLI の起動は Electron の main プロセス（下記）で行う。

## アーキテクチャ

```
apps/desktop/                       # @tahcode/desktop（Multica の apps/desktop と同じ electron-vite 構成）
├── electron.vite.config.ts         # main / preload のみビルド（renderer はデプロイ済み Web を URL で読む）
├── src/main/index.ts               # app ライフサイクル、BrowserWindow、ナビゲーション境界、deep link、smoke モード
├── src/main/config.ts              # 接続先の解決（--url / env / settings.json / production）
├── src/main/deepLink.ts            # @tahcode/core/desktop の re-export（parse / loginReturnUrl）
├── src/main/ipc.ts                 # allow-list IPC（hostname / CLI / register / アップデート）
├── src/main/localRuntime.ts        # main が tahcode CLI を探して link + start（任意シェルは不可）
├── src/main/menu.ts                # macOS メニュー（Edit/View/Server/Window/Help + 更新）
├── src/main/updateService.ts       # GitHub Releases の確認 / .dmg ダウンロード（Electron 非依存）
├── src/main/updater.ts             # 自動確認、ネイティブダイアログ、IPC 通知
├── src/main/fallback.ts            # オフライン時の data: URL ページ（再接続ボタン）
├── src/preload/index.ts            # contextBridge → window.tahcodeDesktop（TahcodeDesktopBridge 型を実装）
├── electron-builder.yml            # appId, protocols(tahcode), mac dmg/zip, entitlements, GitHub publish
├── build/                          # icon.png（scripts/make-icon.mjs が生成）, entitlements.mac.plist
└── scripts/
    ├── smoke.mjs                   # 起動 → 描画 → PNG 保存 → 終了（CI / VM 用）
    ├── desktop-signing.mjs         # Developer ID / 公証 env の検出と electron-builder 上書き
    └── run-electron-builder.mjs    # 未署名は identity=null、署名時は dmg.sign + notarize
out/                                # electron-vite の出力（main/index.js, preload/index.js。CJS）

packages/core/src/desktop/index.ts  # @tahcode/core/desktop — Web / Convex / Desktop が共有する契約:
                                    #   DEEP_LINK_SCHEME, DESKTOP_OAUTH_CALLBACK, TahcodeDesktopBridge,
                                    #   desktopOAuthRedirectTo, parseAuthCallback, loginReturnUrl, resolveRedirectTo,
                                    #   DESKTOP_IPC + registerLocalRuntime の引数検証
```

`@tahcode/core` は TS ソースをそのまま `exports` する（Multica の `@multica/core` と同じ、ビルド工程なし）。Vite / Convex のバンドラ / electron-vite がそれぞれ取り込む。preload は sandbox で `require("electron")` 以外を読めないため、 `externalizeDepsPlugin({ exclude: ["@tahcode/core"] })` で単一 CJS にインライン化している。

Web / Convex 側（同じ PR）:

- `src/lib/desktop.ts` — `window.tahcodeDesktop` を読む薄いアクセサ。型は `@tahcode/core/desktop`。ブラウザでは undefined → 従来動作（コピペ 3 行）。デスクトップでは「この Mac を登録」。
- `src/pages/LoginPage.tsx` — 「Google で続ける」が `redirectTo` にシェル用アドレスを渡す。待機中のラベルとキャンセル。
- `convex/lib/authRedirect.ts`（`@tahcode/core/desktop` の re-export）+ `convex/auth.ts` — Convex Auth の `callbacks.redirect` で `tahcode://auth/callback` を**厳密一致**で許可（それ以外は既定ルール = 相対パス / `SITE_URL` のまま。`tests/authRedirect.test.ts`）。

### この Mac を登録（ワンクリック）

`window.tahcodeDesktop` があるときだけ、Register Runtime と空状態 CTA の主ボタンは **この Mac を登録** になる。流れ:

1. マシン名の初期値は OS の hostname（末尾 `.local` は除く）。取れなければ従来の `guessMachineName`。
2. レンダラが Convex `runtimes.register` を呼び、`runtimeId` + ワンタイムトークンを受け取る（ブラウザと同じ mutation）。
3. preload が `registerLocalRuntime({ convexUrl, runtimeId, token, name }, onProgress?)` を **invoke するだけ**。コマンド文字列は渡せない。
4. main（`localRuntime.ts`）が引数を `@tahcode/core/desktop` で検証し、`tahcode` を探す。無ければ `npm install --global tahcode --prefix ~/.tahcode/npm`（管理者権限不要のユーザ prefix）。`TAHCODE_CLI` でバイナリを上書きできる。
5. 同じプロセスが `tahcode link --url … --runtime … --token … --name … --no-restart` を **argv 配列で spawn**（shell なし）。その後、既存ブリッジがいれば `tahcode restart bridge`、なければ `tahcode start`。トークンはログに出さない。
6. UI は 登録中 → CLI 準備 → ブリッジ再起動（または起動）→ 接続待ち。既存のハートビート検出でオンラインに切り替わる。
7. `link` + `start`/`restart` が成功すれば完了。失敗時はブラウザと同じ 3 行をフォールバック表示。

ブラウザ（橋なし）のコピペ 3 行は従来どおり。default deny の「他のメンバーに許可」もそのまま。

インストールに `EACCES` が出たとき（グローバル prefix が書けない等）は、手動コマンドを案内して止める。

### セキュリティ境界

- `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`。preload は `contextBridge` で OAuth 用の読み取り値と、allow-list の invoke（`getHostname` / `getCliStatus` / `registerLocalRuntime` / アップデート一式）と進捗イベントだけ公開。任意のシェルは無い。ダウンロード URL は GitHub 系ホストに限定。
- IPC の送信元 URL は `isAppOrigin` で検証する（アプリのオリジン以外は拒否）。
- `will-navigate` / `will-redirect` / `setWindowOpenHandler`: **アプリのオリジン以外へは一切遷移しない**。http(s) は `shell.openExternal`（システムブラウザ）、それ以外はブロック。
- `setPermissionRequestHandler`: notifications / clipboard / fullscreen 以外の権限要求は拒否。
- 単一インスタンス（`requestSingleInstanceLock`）。2 つ目の起動は deep link を既存ウィンドウへ転送。

## 認証の設計（パスワード + Google OAuth）

**パスワード**: Web と完全に同じ。Convex Auth のトークンはレンダラの `localStorage`（Electron が `~/Library/Application Support/tahcode/` に永続化）に入るので、再起動後もログイン状態が保たれる。

**Google OAuth はシステムブラウザで行う（採用）**。理由:

1. Google は埋め込み WebView / Electron UA からのサインインを「安全でないブラウザ」として拒否することがある（policy: _Use secure browsers_）。
2. ユーザーは普段のブラウザで Google にログイン済みのことが多く、パスキーや 2 段階認証もそこで動く。
3. シェル内で Google のクッキーを持たないので、Chromium セッションに Google 資格情報を溜めない。

フロー（Convex Auth の PKCE 風 verifier をそのまま利用）:

```
Electron ウィンドウ (/login)                     システムブラウザ                         Convex (.convex.site)
─────────────────────────                        ─────────────────                        ─────────────────────
signIn("google", { redirectTo: "tahcode://auth/callback?next=…" })
  → auth:signIn が redirect URL + verifier を返す
  → verifier を localStorage に保存
  → window.location = https://<dep>.convex.site/api/auth/signin/google?…
main: will-navigate で外部と判定 → preventDefault
  → shell.openExternal(そのURL) ──────────────▶ Google 同意画面 ──────────▶ /api/auth/callback/google
                                                                             ← callbacks.redirect が
                                                                               tahcode://auth/callback を許可
                                            ◀── 302 tahcode://auth/callback?next=…&code=<one-time>
macOS: open-url → main.handleDeepLink
  → win.loadURL(https://<app>/login?next=…&code=<one-time>)
ConvexAuthProvider が URL の code と localStorage の verifier で auth:signIn → トークン取得 → next へ遷移
```

ポイント: **code の交換は Electron ウィンドウの中で行う**（verifier がそこにしかない）。ブラウザ側は `tahcode://` にリダイレクトされた時点で役目を終える。`next`（招待リンク等）は deep link のクエリで往復するので、Web と同じく `?next=` が維持される。

### 開発時の注意（macOS で deep link を試す）

`electron .`（未パッケージ）の実行ファイルは Electron.app なので、`Info.plist` に `tahcode` スキームがなく `open-url` が届かない。Google ログインまで確認したいときは:

- `npm run desktop:pack` で `release/mac-arm64/tahcode.app` を作って起動する（`protocols` が Info.plist に入る）、または
- `TAHCODE_DESKTOP_OAUTH=in-app npm run desktop:dev` — **開発専用**のフォールバック。Google をウィンドウ内で開き、UA から `Electron/…` を除いて `redirectTo` を Web と同じ `/login` に戻す。Google の policy 上グレーなので配布物では使わない。

production / staging の Convex に `callbacks.redirect` が入っていない間は、ブラウザ側で `Invalid redirectTo tahcode://auth/callback` になる（= この PR の Convex 側変更が対象デプロイに反映されてから有効）。Google Cloud Console 側の **Authorized redirect URIs は変更不要**（コールバック先は今までどおり `https://<deployment>.convex.site/api/auth/callback/google`）。

## Linux / CI（この VM で確認した範囲）

`.github/workflows/desktop.yml`:

- `linux-check`（PR / push で `apps/desktop/**` / `packages/core/**` / lockfile が変わったとき）: ルートの `npm ci`（共通 setup action）→ `packages/core` と shell の typecheck → `npm test` → `electron-vite build` → **xvfb 上で 3 回起動** （production 読み込み / `tahcode://` 疑似コールバック / オフラインフォールバック）→ スクリーンショットを artifact に → `electron-builder --linux dir --projectDir apps/desktop` で packaging 設定を検証。
- `mac-dmg`（`workflow_dispatch` または `desktop-v*` タグ）: `macos-latest` で arm64 `.dmg` / `.zip` を artifact に。GitHub secrets `CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` が **5 つ揃っている**ときだけ Developer ID 署名 + 公証 + `TAHCODE_DESKTOP_SIGNED=1`。欠けていれば従来どおり未署名で成功する（CI は落とさない）。`desktop-v*` タグは `apps/desktop` の version と一致必須で、GitHub Releases にも同じ成果物 + `latest-mac.yml` を publish する。

ローカルの同等コマンド: `npm run desktop:smoke -- /tmp/shell.png`（`DISPLAY` がなければ `xvfb-run` を自動使用）。

Linux でできなかったこと: `.dmg` / `.app` の生成（`hdiutil` と macOS 固有のバンドル処理が必要）。上の「Mac でビルドして動かす」か、`mac-dmg` ジョブを手動実行してください。

## アップデート（TAH-22）

配布ソースは GitHub Releases（タグ `desktop-v<semver>`、例 `desktop-v0.1.0`）。シェルは Releases API から `desktop-v*` を探し、新しい semver があれば「今すぐ更新」で相当アーキの `.dmg` を Downloads に落として開く。

- **UI**: Org 設定の「デスクトップ」、ワークスペースメニュー / ⌘K、macOS の tahcode / Help メニュー。進捗は「確認中 / ダウンロード / ディスクイメージを開く」。失敗は日本語。新しいシェル + 古い Web（未デプロイ）のときはメニュー確認がネイティブダイアログにフォールバックする。
- **自動アップデート**: `~/Library/Application Support/tahcode/settings.json` の `autoUpdateEnabled`。**既定オフ**（未署名のため安全側）。オンなら起動約 20 秒後と 4 時間ごとに確認し、更新があればトースト / ダイアログ。適用はユーザー確認のまま。
- **未署名の制約**: Gatekeeper 下ではアプリ内差し替え（electron-updater の `quitAndInstall`）が信頼できない。ダウンロードした `.dmg` を開き、tahcode を Applications にコピーする。初回は **右クリック → 開く**（または `xattr -dr com.apple.quarantine`）。
- **署名済み配布**（`TAHCODE_DESKTOP_SIGNED=1` を electron-vite がバンドルに焼き込む）: `canInstallInApp` が立ち、UI は「再起動して適用」になる。未署名ビルドのダウンロード → `.dmg` を開く経路はそのまま。
- **開発ビルド**（`npm run desktop:dev`）: 確認とダウンロードはできるが、実行中の Electron には適用しない。
- **Windows / Linux 配布**は対象外。手動で Releases を開く導線だけ出す。
- 新しいシェルを出すとき: `apps/desktop/package.json` の version を上げ、`desktop-v<その version>` タグを push する。

## 署名と公証（Developer ID）

Gatekeeper を通す配布と、アプリ内差し替え（`quitAndInstall`）は **Developer ID Application 署名 + Apple 公証（notarize）+ staple** が揃ってから有効になる。electron-builder 26 は `@electron/notarize` を内蔵しており、`mac.notarize` は Apple の資格情報が環境にあるときだけ実際に公証する（[Code signing](https://www.electron.build/code-signing)、[mac.notarize](https://www.electron.build/mac)）。

証明書・.p12・Apple ID パスワードは **リポジトリに入れない**。GitHub Actions の repository secrets か、手元の環境変数だけに置く。

### 必要なもの

| 項目 | 用途 | GitHub secret / 環境変数 |
| --- | --- | --- |
| Apple Developer Program 加入 | Developer ID を発行する | — |
| **Developer ID Application** 証明書 | `.app` / `.zip` の署名 | キーチェーン、または .p12 |
| 証明書の .p12 | CI に渡す | `CSC_LINK`（base64 または `file://` パス） |
| .p12 のパスワード | 証明書の復号 | `CSC_KEY_PASSWORD` |
| Apple ID | `notarytool` ログイン | `APPLE_ID` |
| アプリ用パスワード | Apple ID のログインパスワードではない | `APPLE_APP_SPECIFIC_PASSWORD` |
| Team ID（10 文字） | 公証のチーム指定 | `APPLE_TEAM_ID` |

5 つ揃ったときだけ CI は署名 + 公証する。1 つでも欠けると未署名のまま成功する。

### チェックリスト

1. [developer.apple.com](https://developer.apple.com/account) で **Certificates, Identifiers & Profiles** → **Developer ID Application** を作成する（Mac をキーチェーンに紐づけ、Xcode の Accounts から作ってもよい）。
2. キーチェーンアクセスでその証明書を選び、**書き出す**。.p12 に秘密鍵を含め、書き出しパスワードを付ける。中間証明書まで入れるかは任意（CI では短い base64 のほうが扱いやすい）。
3. Apple ID の [アプリ用パスワード](https://appleid.apple.com/)（Sign-In and Security → App-Specific Passwords）を発行する。ラベル例: `tahcode-notarize`。
4. Team ID を Membership の詳細から控える（10 文字）。
5. 手元で試す場合:

   ```bash
   export CSC_LINK="file://${HOME}/certs/DeveloperID.p12"   # または base64 文字列
   export CSC_KEY_PASSWORD="…"
   export APPLE_ID="you@example.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="ABCD123456"
   npm run desktop:build:signed
   ```

   `dist:mac:signed` は上記 5 変数が無いと失敗する。未署名のローカル確認は従来どおり `npm run desktop:build` / `dist:mac`（`mac.identity=null`）。

6. GitHub リポジトリの **Settings → Secrets and variables → Actions** に同じ 5 つを登録する。`CSC_LINK` は次のように base64 化してよい（値はコミットしない）:

   ```bash
   base64 -i DeveloperID.p12 | pbcopy
   ```

7. `apps/desktop/package.json` の version を上げ、`desktop-v<その version>` タグを push する。`mac-dmg` が secrets を見て署名 + 公証し、Releases に `.dmg` / `.zip` / `latest-mac.yml` を載せる。`workflow_dispatch` でも同じ分岐（artifact のみ、Release はタグ時）。
8. 成果物の検証（署名済み Mac で）:

   ```bash
   codesign -dv --verbose=4 /Applications/tahcode.app
   xcrun stapler validate /Applications/tahcode.app
   spctl --assess --type execute -v /Applications/tahcode.app
   ```

   公証済みなら `spctl` は `source=Notarized Developer ID` を返す。Finder でダブルクリックして開き、**右クリック → 開くは不要**なこと。

9. アプリ内更新: 署名ビルドを Applications に入れ、次の `desktop-v*` を出したあと「アップデートを確認」→ ダウンロード → **再起動して適用**。未署名ビルドでは従来どおり「ディスクイメージを開く」。

`hardenedRuntime: true` と `build/entitlements.mac.plist`（JIT / unsigned-executable-memory / disable-library-validation / network.client）は公証要件に合わせて既にある。`TAHCODE_DESKTOP_SIGNED=1` は `electron-vite` の `define` で main に埋め込まれる（CI の環境変数をユーザの Mac に持ち越せないため）。

## その他の既知事項

- ウィンドウの位置・サイズ、Server の選択、自動アップデートの on/off は `settings.json` に保存。macOS では赤ボタンで閉じると Dock に残る（⌘Q で終了）。
- 外部リンク（チャット内 Markdown の `target=_blank` など）はすべてシステムブラウザで開く。
- タイトルバーは標準（`hiddenInset` は Web 側サイドバーと traffic light の位置調整が必要になるため見送り）。
- アイコンは `scripts/make-icon.mjs` が生成する 1024px PNG（electron-builder が .icns に変換）。差し替えは `build/icon.png` を上書き。
