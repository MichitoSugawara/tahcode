export const WORKBENCH_PANEL_IDS = [
  "chat",
  "terminal",
  "browser",
  "remote",
] as const;

export type WorkbenchPanelId = (typeof WORKBENCH_PANEL_IDS)[number];

export const DEFAULT_WORKBENCH_PANEL: WorkbenchPanelId = "chat";

export type WorkbenchPanelDef = {
  id: WorkbenchPanelId;
  /** Compact tab label */
  label: string;
  /** Pane heading */
  title: string;
  /** One-line role of this surface */
  blurb: string;
  /** What Phase 1 is / is not */
  next: string;
};

export const WORKBENCH_PANELS: Record<WorkbenchPanelId, WorkbenchPanelDef> = {
  browser: {
    blurb: "ローカルプレビューを本線チャットの横で見る面",
    id: "browser",
    label: "プレビュー",
    next: "URL を開くと接続中マシンが取得し、この面に描画します。",
    title: "ブラウザ",
  },
  chat: {
    blurb: "本線スレッドを邪魔しない副チャット",
    id: "chat",
    label: "サイド",
    next: "本線の履歴とは別の Convex スレッドです。@メンションではジョブは始まりません。",
    title: "サイドチャット",
  },
  remote: {
    blurb: "マシン画面のリモートセッション",
    id: "remote",
    label: "リモート",
    next: "接続中マシンの画面をこの面に描画し、キーとマウスで操作します。停止は既存のジョブ中断です。",
    title: "リモートデスクトップ",
  },
  terminal: {
    blurb: "接続中マシンのターミナル",
    id: "terminal",
    label: "端末",
    next: "Ghostty で描画し、入出力はブリッジの PTY に載せます。",
    title: "ターミナル",
  },
};

export function isWorkbenchPanelId(value: unknown): value is WorkbenchPanelId {
  return (
    typeof value === "string" &&
    (WORKBENCH_PANEL_IDS as readonly string[]).includes(value)
  );
}

export function resolveWorkbenchPanel(
  preferred?: string | null
): WorkbenchPanelId {
  return isWorkbenchPanelId(preferred) ? preferred : DEFAULT_WORKBENCH_PANEL;
}
