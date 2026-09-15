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
    next: "iframe / webcontents の実プレビューは次のフェーズです。",
    title: "ブラウザ",
  },
  chat: {
    blurb: "本線スレッドを邪魔しない副チャット",
    id: "chat",
    label: "サイド",
    next: "Convex の別履歴 / メンション規則は次のフェーズです。",
    title: "サイドチャット",
  },
  remote: {
    blurb: "マシン画面のリモートセッション",
    id: "remote",
    label: "リモート",
    next: "RDP / VNC の画面共有は次のフェーズです。停止は既存のジョブ中断です。",
    title: "リモートデスクトップ",
  },
  terminal: {
    blurb: "接続中マシンのターミナル",
    id: "terminal",
    label: "端末",
    next: "PTY ブリッジは次のフェーズです。",
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
