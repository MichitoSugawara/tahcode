# TAH-84 — 書き込みツールの HITL 承認

Issue: [TAH-84](https://linear.app/tahcode/issue/TAH-84/)  
親: [TAH-69](https://linear.app/tahcode/issue/TAH-69/) / [`docs/workbench-tah69.md`](workbench-tah69.md)

危険／破壊的な **tahcode 所有ツール** の実行前に **承認／拒否** カードを出す垂直スライス。承認はチャット面（本線／右レール）の機能ではなく、`agentTools:invoke` の実行ゲート。製品の CLI ブリッジ・Convex ジョブ本線は置き換えない。UI に OpenConnector / gateway / workers.dev は出さない。

---

## 1. 試したこと

### CopilotKit パッケージでシェルを包む

この OSS ではこうできていた: `@copilotkit/react-core` の `CopilotKit` プロバイダ + `CopilotChat` がチャット面を持ち、`useHumanInTheLoop` / `useInterrupt` が承認 UI を描く。バックエンドは CopilotKit runtime（`runtimeUrl`）か LangGraph / AG-UI。

- [CopilotKit](https://github.com/CopilotKit/CopilotKit)
- [HITL Overview](https://docs.copilotkit.ai/human-in-the-loop)
- [useInterrupt](https://docs.copilotkit.ai/human-in-the-loop/useInterrupt)

tahcode に載せるとこうなる:

| 必要なもの | tahcode 現状 |
| --- | --- |
| `CopilotKit` プロバイダ + 専用 runtime URL | Convex Auth + Vite シェル。別 runtime はジョブ本線と二重になる |
| AG-UI の interrupt / `respond()` | ジョブは Mac ブリッジが `agentTools:invoke` する。AG-UI イベントは無い |
| `CopilotChat` への描画 | 本線は `AgentReply` + ToolChips。右レールは Convex `sideChatTurns` |

**判断: パッケージは入れない（defer / reject）。** プロバイダでアプリを包むと Convex Auth と戦い、エージェント runtime を置き換える方向になる。依存も `@copilotkit/*` 一式で最小にならない。

### 本線チャットにカードだけ挿す

本線の tool イベントは `ToolChips` で「実行済み」行になる。承認待ちを ToolChips に載せると「もう走った」ように見える。右レールの副スレッドにデモを置くと、承認がサイド専用機能に見える。

**判断: 採用。** 新しい `toolApprovals` 行を正本にする。カードは本線 Composer（試用）と本線 `AgentReply`（ジョブ中）に出す。右レールに同じカードが出てもよいが、面の機能ではない。ToolChips には承認前の行を書かない。

---

## 2. 採用 / 見送り / 却下

| 対象 | 結論 | 理由 |
| --- | --- | --- |
| CopilotKit HITL の操作契約（pause → カード → approve/reject → resume） | **採用** | [HITL Overview](https://docs.copilotkit.ai/human-in-the-loop) の「チャットが止まり、コンポーネントが出て、回答で再開」 |
| `@copilotkit/react-core` / `CopilotKitProvider` / AG-UI runtime | **見送り** | Convex + ブリッジと二重。Auth と衝突しやすい |
| Generative UI（全ツール結果のリッチ描画） | **見送り** | スパイク範囲外。次は ToolChips のライブ結果 |
| Beautiful UI ApprovalCard レジストリ丸入れ | **見送り** | Phase 1 未導入のまま。ChoiceList 文法だけ既存。カードは first-party |
| プロバイダ CLI の shell / ファイル書き込み HITL | **見送り** | `--force` / `--trust` の headless を止めない。tahcode 所有ツールだけゲート |
| CLI ブリッジ / Remote / Terminal / WebRTC の置き換え | **却下** | 制約。I/O は既存のまま |
| 嘘の「実行済み」 | **却下** | pending 中は tool イベントを書かない。resultJson も `ok: false` |
| サイドチャット専用の承認 UI | **却下** | チャットはチャット。ゲートは書き込みツールの前 |

---

## 3. この PR の pierce point

破壊的な **tahcode 所有ツール** が `agentTools:invoke` / `invokeConnector` に来たとき:

1. Convex が `toolApprovals` を `pending` で挿す。ツール本体は走らない。
2. 戻りは `{ approval: { status: "pending" }, resultJson: { ok: false, status: "pending_approval" } }`。mutation を throw しない（throw すると insert が巻き戻る）。
3. 本線 Composer と、ジョブ付きの本線返信に承認カードが出る。
4. 人が承認すると、ブリッジ（in-repo `RuntimeClient.invokeTool`）が再 invoke して実行する。拒否なら実行せず `cancelled` を返す。
5. 旧 npm CLI（待ちループ無し）は pending JSON をエージェントに渡す。**実行はしない**（fail-closed）。

ゲートするツール:

- `create_session` / `send_message`
- `create_linear_issue` / `update_linear_issue`
- `create_github_issue` / `update_github_issue`

読み取り系（`list_*` / `get_*` / `suggest_connector`）は通す。

プレビュー用に本線 Composer の「書き込みの確認を試す（実行しない）」がある。`source: "demo"` なので承認しても Linear もジョブも動かない。右レールを開く必要はない。

---

## 4. 自動テスト

- 契約: `tests/tool-approvals.test.ts`（ゲート分類、args プレビュー、待ちループ）
- Convex: `tests/convex/toolApprovals.test.ts`（approve 後に実行、reject は未実行、demo はジョブ無し、他 Org 隠し、ジョブ完了で pending を cancel）
- 既存: `tests/convex/agentTools.test.ts` の write 系は承認してから実行
- シェル: `tests/workbench.test.ts`（本線 Composer に試用ボタン、カード文言、CopilotKit / OpenConnector を出さない）

**主張しないこと:** この Cloud Agent 環境にオンラインの Mac ブリッジは無い。ライブジョブの目視は手元の手動確認が正本。プレビューでは demo カードで pending / approved / rejected を踏める。

---

## 5. 手動確認

1. チャットを開く（右レールは不要）。
2. Composer 上の「書き込みの確認を試す（実行しない）」→ 確認待ちカード。本文は「承認するまで実行しません」。
3. **承認して実行** → 「試用のためツールは実行していません」（Linear は増えない）。
4. もう一度試して **拒否する** → 「実行していません」。
5. （任意・ブリッジ online）ジョブ中にエージェントが `create_session` 等を呼ぶ → 同じカードが本線返信に出る。承認するまでセッションは増えない。拒否後も増えない。

旧 CLI（待ち無し）: ツール結果は pending JSON。カードは出る。実行はしない。in-repo ブリッジは承認後に再開する。
