export function closeOtherTabs<T>(tabs: readonly T[], keep: T): T[] {
  return tabs.filter((id) => id === keep);
}

export function closeTabsToTheRight<T>(tabs: readonly T[], from: T): T[] {
  const index = tabs.indexOf(from);
  if (index === -1) {
    return [...tabs];
  }
  return tabs.slice(0, index + 1);
}

export function tabStillOpen<T>(tabs: readonly T[], id: T | null): boolean {
  return id !== null && tabs.includes(id);
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") {
    return false;
  }
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

export function isCloseTabShortcut(event: {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (event.altKey || event.shiftKey) {
    return false;
  }
  if (!(event.metaKey || event.ctrlKey)) {
    return false;
  }
  return event.key.toLowerCase() === "w";
}

/** Chrome / Firefox / VS Code / Cursor: button === 1 is the scroll-wheel click. */
export function isMiddleClickButton(button: number): boolean {
  return button === 1;
}
