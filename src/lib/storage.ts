import { useCallback, useEffect, useState } from "react";

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

/** useState mirrored to localStorage. */
export function useStoredState<T>(key: string, fallback: T): [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readJson(key, fallback));
  useEffect(() => {
    setValue(readJson(key, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? (next as (current: T) => T)(current) : next;
        writeJson(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}
