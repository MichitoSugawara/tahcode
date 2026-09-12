const PALETTE = ["#0e9c2d", "#2f6fec", "#e08a3c", "#c94f7c", "#7c5cff", "#0ea5b7", "#b8860b", "#d9534f"];

/** Deterministic monogram color for a person or entity. */
export function colorFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]!;
}

export function monogram(name?: string | null, fallback = "?"): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fallback;
  const first = Array.from(trimmed)[0] ?? fallback;
  return first.toUpperCase();
}

export function displayName(user: { name?: string; handle?: string; email?: string } | null | undefined): string {
  if (!user) return "member";
  return user.name?.trim() || (user.handle ? `@${user.handle}` : "") || user.email || "member";
}

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const s = Math.floor(diff / 1000);
  if (s < 45) return "たった今";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  return new Date(ms).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function roleLabel(role: "owner" | "admin" | "member" | string): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    default:
      return "Member";
  }
}

export function truncate(text: string, max = 30): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
