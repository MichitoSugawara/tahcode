import type { Id, TableNames } from "../../convex/_generated/dataModel";

/* ─────────────────────────────────────────────────────────
 * OPTIMISTIC CREATES — Convex mints document ids on the server,
 * so a create → navigate flow has nothing to put in the URL until
 * the round-trip lands. We hand out a client placeholder id, insert
 * it into the list queries through `withOptimisticUpdate`, open it
 * at once, and swap in the real id when the mutation resolves.
 * The data itself lives in Convex's local store; this module only
 * keeps the placeholder ↔ real-id bookkeeping for that swap.
 * ───────────────────────────────────────────────────────── */

const PREFIX = "pending-";

export function placeholderId<T extends TableNames>(table: T): Id<T> {
  return `${PREFIX}${table}-${crypto.randomUUID()}` as Id<T>;
}

/** Placeholders must never reach the server: `v.id()` rejects them. */
export function isPlaceholderId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(PREFIX);
}

/* placeholder → the create that will mint its real id (kept after success, dropped on failure) */
const creates = new Map<string, Promise<string>>();
/* real id → the placeholder it was opened under, so the page can stay visually continuous */
const openedAs = new Map<string, string>();
/* real ids created this session whose detail queries have not loaded yet */
const fresh = new Set<string>();

/** Bind `placeholder` to the mutation minting its real id. Returns the same promise for chaining. */
export function trackPlaceholder<T extends TableNames>(
  placeholder: Id<T>,
  created: Promise<Id<T>>
): Promise<Id<T>> {
  const key = String(placeholder);
  const tracked = created.then(
    (id) => {
      openedAs.set(String(id), key);
      fresh.add(String(id));
      return id;
    },
    (error: unknown) => {
      creates.delete(key);
      throw error;
    }
  );
  creates.set(key, tracked as Promise<string>);
  tracked.catch(() => {});
  return tracked;
}

/** Whether a create was registered for this placeholder in this session (a stale URL after a reload has none). */
export function hasPlaceholder(id: string | null | undefined): boolean {
  return !!id && creates.has(id);
}

/** The server id for `id`, waiting on the create if `id` is still a placeholder. */
export async function resolveId<T extends TableNames>(
  id: Id<T>
): Promise<Id<T>> {
  if (!isPlaceholderId(id)) {
    return id;
  }
  const created = creates.get(String(id));
  if (!created) {
    throw new Error("作成が完了していません。もう一度お試しください");
  }
  return (await created) as Id<T>;
}

/** Placeholder a freshly created `id` was first shown under, if any. */
export function placeholderOf(
  id: string | null | undefined
): string | undefined {
  return id ? openedAs.get(id) : undefined;
}

/** True until the detail queries for a chat created this session have loaded once —
 *  while they are in flight a brand-new chat can safely render as empty. */
export function isFresh(id: string | null | undefined): boolean {
  return !!id && fresh.has(id);
}

export function markLoaded(id: string): void {
  fresh.delete(id);
}
