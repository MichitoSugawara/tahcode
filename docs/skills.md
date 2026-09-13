# Skill Library + Profile

Org がスキルの正本を持ち、名前付きプロファイル（スキル束）をチャット / プロジェクトに取り付けます。ジョブ開始時に、選択したスキルをマシン上のハーネス用ディレクトリへ同期します。**SKILL.md 本文はシステムプロンプトに埋め込みません。** 各 CLI のオンデマンド読み込みに任せます。

## 同期先（ベストエフォート）

| プロバイダ | 書き込み先 | 備考 |
| --- | --- | --- |
| Codex | `~/.codex/skills/<slug>/SKILL.md`、作業ディレクトリの `.agents/skills/` と `.codex/skills/` | ネイティブ想定 |
| Claude | `~/.claude/skills/<slug>/SKILL.md`、`.claude/skills/` | ネイティブ想定 |
| Cursor | `~/.cursor/skills/<slug>/SKILL.md`、`.cursor/skills/` と `.agents/skills/` | ネイティブ想定 |
| OpenCode | `~/.config/opencode/skills/<slug>/SKILL.md`、`.opencode/skills/` | パスは上流の変更でずれる可能性あり |
| Grok | なし | 公開されているスキルストア規約がないため未書き込み |
| Antigravity | なし | headless CLI 自体が未対応 |

既存の個人スキルは削除しません。同じスラッグは上書きします。

## 取り込み

`https://skills.sh/owner/repo/skill`、`owner/repo/skill`、GitHub の tree/blob、raw SKILL.md URL を Admin が取り込みできます。許可ホストは skills.sh / GitHub / raw.githubusercontent.com のみです。

## 取り付け

チャットに直接取り付けるか、プロジェクトの既定プロファイルを設定します。解決順は **チャット → プロジェクト** です。Admin 以上がライブラリとプロファイルを編集し、見えるチャット / プロジェクトならメンバーも取り付けできます。

## 発見と enforce

クラウド上のライブラリは「正本」です。エージェントが実際に使えるのは、同期後にランタイムのスキルストアへ書けたスラッグだけです。Context には名前と件数だけを出し、本文は出しません。
