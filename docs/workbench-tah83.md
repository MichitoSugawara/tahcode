# TAH-83 — リモート: WebRTC ストリーム

Issue: [TAH-83](https://linear.app/tahcode/issue/TAH-83/)  
親: [TAH-69](https://linear.app/tahcode/issue/TAH-69/) / 続き: [TAH-81](https://linear.app/tahcode/issue/TAH-81/)（JPEG Agent Screen）

Remote の輸送を **JPEG + Convex `_storage` 往復**（[`shared/workbenchScreen.ts`](../shared/workbenchScreen.ts) の `SCREEN_POLL_MS = 500` ≈ 2fps）から、**WebRTC `<video>`** に上げる。見た目は [Beautiful UI Agent Screen](https://www.beautifului.dev/) のまま。製品はマルチ CLI 制御プレーンであり、RustDesk / RDP / VNC を本線にしない。

UI に OpenConnector / OOMOL / gateway / workers.dev は出さない。製品面のラベルは **プラグイン**。

---

## 1. この OSS / 製品ではこうできていた

### 現状 tahcode — JPEG ループ。デスクトッププロトコルではない

この製品ではこうできていた: ブリッジが JPEG / PNG を撮り、Convex `_storage` のファイル URL を Remote に出す。HID は同じセッションの Convex キュー。RDP は置かない。

- [`docs/workbench-tah81.md`](workbench-tah81.md)
- [`shared/workbenchScreen.ts`](../shared/workbenchScreen.ts) `SCREEN_POLL_MS = 500`

### t3code — 同じく JPEG。ローカルなら約 12fps

この OSS ではこうできていた: 右パネルは Chromium guest のページキャプチャ。PR #4397 は CDP screencast をやめ、共有 `capturePage` ループで JPEG を取る。ローカル IPC なので tahcode の `_storage` 往復より速い。

- [pingdotgg/t3code](https://github.com/pingdotgg/t3code) [#4397](https://github.com/pingdotgg/t3code/pull/4397)

### Beautiful UI — Agent Screen の見た目

この製品ではこうできていた: エージェント画面をカードで見せ、Connecting スピナーとカスタムカーソルを持つ。npm パッケージは無い。輸送は問わない。

- [beautifului.dev](https://www.beautifului.dev/) — 末尾 **Agent Screen**（`AgentScreen.tsx`）

### webrtc-streamer — ホストの `screen://` を WebRTC にする

この OSS ではこうできていた: ホスト側で `webrtc::DesktopCapturer::CreateScreenCapturer`（`screen://0`）を開き、ブラウザは HTTP シグナリングのあと `<video>` で受信する。Mac CI / Darwin arm64 リリースがある。

- [mpromonet/webrtc-streamer](https://github.com/mpromonet/webrtc-streamer)
- HTTP API: [`docs/api.md`](https://github.com/mpromonet/webrtc-streamer/blob/master/docs/api.md)
  - `POST /api/call?peerid=&url=` — offer JSON `{type,sdp}` → answer JSON（[webrtcstreamer.js](https://github.com/mpromonet/webrtc-streamer-html/blob/master/webrtcstreamer.js) と同じ。`peerid` と `url` はクエリ）
  - `POST /api/addIceCandidate?peerid=` / `GET /api/getIceCandidate?peerid=`
  - `GET /api/hangup?peerid=`
- ブラウザ実装: [webrtc-streamer-html](https://github.com/mpromonet/webrtc-streamer-html) `WebRtcStreamer` が **ブラウザで offer を作り** `/api/call` に POST する

### RustDesk — 本線にしない

この OSS ではこうできていた: 別デーモン + 独自プロトコルの遠隔デスクトップ製品。tahcode にコアを埋め込まない。後続で「外部で開く」は可。

- [rustdesk/rustdesk](https://github.com/rustdesk/rustdesk)

---

## 2. 仮説の検証（採用）

| 候補 | 判定 |
| --- | --- |
| **webrtc-streamer + ブリッジが HTTP API をプロキシ** | **採用。** 画面→WebRTC の実装が既にあり、シグナリング面だけ差し替えれば本番 Web から `localhost` を叩かずに済む。Darwin arm64 Release tarball が GitHub Releases にある（例: `webrtc-streamer-v0.8.20-Darwin-arm64-Release.tar.gz`）。Homebrew 公式 formula は無い。自動ダウンロードはしない（署名・供給源の問題）。 |
| 純 JS WebRTC（werift / node-datachannel） | **不採用（本線）。** エンコードと ScreenCaptureKit が無い。JPEG を DataChannel に載せるだけでは遅延目標に届かない。 |
| Electron `desktopCapturer` | デスクトップ殻だけ。`tahcode start` の npm ブリッジでは使えない。 |
| ブラウザ `getDisplayMedia` | **視聴者**の画面になる。Mac 側ではない。 |
| ブラウザが `http://127.0.0.1:8000` を直接叩く | **禁止。** 本番 `https://tahcode.com` はユーザ Mac の loopback に届かない。 |

Phase A の JPEG 締め（100ms 等）は本 issue の必須ではない。JPEG はフォールバックとして残す。

---

## 3. アーキテクチャ（散文の図）

本番 Web はユーザ Mac の loopback を見られない。映像の SDP / ICE だけを、**既存のブリッジ ↔ Convex チャネル**に載せる。映像パケット自体は WebRTC（可能なら P2P）でブラウザ↔ Mac を結ぶ。キー / マウスは TAH-81 の Convex HID キューのまま。

```
  ブラウザ (tahcode.com)
       │  Convex mutation/query（SDP / ICE だけ。映像バイトは置かない）
       ▼
     Convex
       │  ブリッジが claim / report（既存 runner ループ）
       ▼
  tahcode ブリッジ (Mac)
       │  127.0.0.1 だけの HTTP
       ▼
  webrtc-streamer サイドカー
       │  screen://0 （DesktopCapturer / ScreenCaptureKit）
       ▼
     ディスプレイ
```

1. Remote を開くと、既存どおり `workbenchScreen.open`（HID + JPEG フォールバック用）。
2. ハートビートに `screenWebRtc` があるときだけ、ブラウザが `RTCPeerConnection` を作り **recvonly の offer** を出す。
3. `workbenchScreenRtc.open` が offer SDP を短い行として保存する（`_storage` は使わない）。
4. ブリッジが `claimNext` し、サイドカーへ `POST /api/call?peerid=…&url=screen://0`（body は `{type,sdp}`）。返ってきた answer を `reportAnswer`。
5. ブラウザが answer を `setRemoteDescription`。ICE は `enqueueIce` / `claimIce` / `reportIce` / `listIce`。
6. `ontrack` → `<video srcObject>`。`playing` になるまで「接続済み」とは書かない。
7. サイドカーが無い / 失敗したら RTC を failed にし、JPEG が生きていれば **JPEG（低速）** と明示。フレームも映像も無ければ empty。

### 能力ビット

| ビット | CLI | 意味 |
| --- | --- | --- |
| `screen` | 0.1.4+ | JPEG フレーム |
| `screenInput` | 0.1.5+ | HID |
| `screenWebRtc` | **0.1.6+** かつ **バイナリ検出時だけ** | サイドカーを起動できる |

`screenWebRtc` を常時広告しない。`webrtc-streamer` が PATH / `TAHCODE_WEBRTC_STREAMER` / `~/.tahcode/bin` / Homebrew の定位置に無いマシンではビットが落ち、Remote は TAH-81 の JPEG のまま。

### サイドカーの起動

```
webrtc-streamer -H 127.0.0.1:<ephemeral> --stun=stun.l.google.com:19302 -a screen://0
```

上流 [README](https://github.com/mpromonet/webrtc-streamer/blob/master/README.md) と Darwin/Linux **v0.8.20 Release** `--help`（`H,http` / `s,stun` = Use an external STUN / `S,stun-server` = Start embedded STUN / `a,audio-layer` omit value for dummy / `[urls...]`）:

- **`-H/--http`:** HTTP bind（必須 `arg`）。必ず `127.0.0.1`。`0.0.0.0` は拒否。
- **`-s/--stun`:** **外部** STUN。cxxopts は `[=arg]` なので次トークンを値にしない。`-s host` は `host` を位置 URL にし、暗黙の `0.0.0.0:3478` を使う。短い `-s=host` と `-a=` は `Option '=' does not exist`。`-shost` は短いオプションの連結。Google 公開 STUN は **`--stun=stun.l.google.com:19302`**（`-s` の long）。`-S/--stun-server` は埋め込み STUN リスナーなので使わない。
- **`-a/--audio-layer`:** 音声キャプチャ層。値なしの `-a` で dummy。`screen://0` を `-a` の値にしない（このバイナリでは次トークンは位置引数になる）。
- **位置引数:** `screen://0`（`webrtc::DesktopCapturer::CreateScreenCapturer`）。

TURN は本 PR 外（対称 NAT では失敗しうる → 嘘をつかず error / JPEG）。マイクは取らない。

- **認証トークン:** HTTP はブリッジプロセスだけが叩く。ブラウザには base URL を渡さない。civetweb `-A` は起動失敗しやすいので本スライスでは付けない（localhost bind が境界）。
- **パッケージ:** 自動取得しない。手動で GitHub Release の Darwin arm64 を `~/.tahcode/bin/webrtc-streamer` に置くか、PATH に通す。

---

## 4. 脅威メモ

| 面 | 扱い |
| --- | --- |
| 本番 Web → Mac loopback | 届かない。シグナリングは Convex + ランタイムトークン。 |
| サイドカー bind | `127.0.0.1` のみ。LAN に画面ポートを晒さない。 |
| SDP / ICE の保存 | 短命テキスト。映像バイトは Convex に置かない。サイズ上限あり。 |
| 認可 | 画面セッションと同じ `requireUsableRuntime` + `screenWebRtc` ビット。他 Org には `null`。 |
| 古いブリッジ | ビット無し → JPEG または更新 CTA。WebRTC「接続済み」は出さない。 |
| サイドカー欠落 | ビット無し、または claim 時に failed。JPEG 明示フォールバック。 |
| TURN 不在 | 一部 NAT でメディアが届かない。playing しない限りライブ表示しない。 |

---

## 5. この PR の範囲

| 面 | この PR | 残すもの |
| --- | --- | --- |
| シグナリング | Convex の ephemeral SDP / ICE。`/api/call` をブリッジがプロキシ | TURN、データチャネル HID |
| サイドカー | 検出・起動・停止・loopback 固定 | バイナリ同梱、brew 自動 install |
| UI | `screenWebRtc` なら `<video>` 優先。Agent Screen クロム維持。HID は既存キュー | RustDesk を外部起動 |
| JPEG | フォールバック / 接続中の下地。answered な RTC があるセッションは JPEG claim を止める | Phase A の 100ms チューニング |
| 停止 | 既存ジョブ中断（TAH-13） | 画面専用の stop |

**嘘をつかない:** `<video>` が `playing` になるか、JPEG の `frameUrl` が無い限り「ライブ」は出さない。

---

## 6. 自動テスト

- 契約: `tests/workbench-screen-rtc.test.ts`（能力ビット、SDP / ICE サニタイズ、playing 前は未接続、bind が loopback）
- Convex: `tests/convex/workbench-screen-rtc.test.ts`（能力拒否、offer→answer、他 Org 隠し）
- ブリッジ: `tests/runtime-webrtc-streamer.test.ts`（argv、HTTP `/api/call` をモック sidecar で）
- シェル: `tests/workbench.test.ts`（Remote が WebRTC 面を参照し、禁止ラベルを出さない）

**主張しないこと:** この Cloud Agent 環境にオンラインの Mac と画面収録許可は無い。実 `<video>` の目視は手元の手動確認が正本。

---

## 7. 手動確認（Mac・ブリッジ online）

前提: CLI **0.1.6+**、`webrtc-streamer` を置き、画面収録を許可。Preview URL は **UI クロムの確認用**。映像は視聴者ブラウザ↔ Mac の P2P なので、preview を開くマシンとブリッジ Mac が同じ人の手元にあること。

```bash
# 例: GitHub Releases の Darwin arm64 Release
mkdir -p ~/.tahcode/bin
# tar から webrtc-streamer を ~/.tahcode/bin/webrtc-streamer へ
chmod +x ~/.tahcode/bin/webrtc-streamer
# または
export TAHCODE_WEBRTC_STREAMER=/path/to/webrtc-streamer

npm i -g tahcode@0.1.6
tahcode restart
tahcode doctor    # 「WebRTC 画面: …」が ✓
```

1. 右レール **リモート**。ハートビートに `screenWebRtc`。Connecting のあと `<video>` が動き、JPEG 0.5s より明らかに速い。
2. クリック / キーは従来どおり届く（HID は Convex）。
3. `webrtc-streamer` を PATH から外して再起動 → ビットが消える → JPEG（低速）またはフレーム待ち。接続済みとは出ない。
4. ブリッジ停止 → 「オンラインのマシンが必要です」。
5. ブラウザ DevTools の Network に `127.0.0.1:8000` へのリクエストが **無い**（シグナリングは Convex）。

---

## 8. 実装パス

- [`shared/workbenchScreenRtc.ts`](../shared/workbenchScreenRtc.ts) — 契約、能力、SDP / ICE
- [`convex/workbenchScreenRtc.ts`](../convex/workbenchScreenRtc.ts) + schema の `screenRtcSessions` / `screenRtcIce`
- [`runtime/src/webrtcStreamer.ts`](../runtime/src/webrtcStreamer.ts)（`webrtcStreamerArgv` / `/api/call`）
- [`runtime/src/runner.ts`](../runtime/src/runner.ts) / [`runtime/src/convexClient.ts`](../runtime/src/convexClient.ts)
- [`src/harness/workbench/screen/useScreenRtc.ts`](../src/harness/workbench/screen/useScreenRtc.ts)
- [`src/harness/workbench/screen/ScreenFrame.tsx`](../src/harness/workbench/screen/ScreenFrame.tsx) の `ScreenLive`
- [`src/harness/workbench/screen/AgentScreenCanvas.tsx`](../src/harness/workbench/screen/AgentScreenCanvas.tsx) の `<video>`
- [`src/harness/workbench/RemotePane.tsx`](../src/harness/workbench/RemotePane.tsx) — WebRTC 優先、JPEG 明示フォールバック
