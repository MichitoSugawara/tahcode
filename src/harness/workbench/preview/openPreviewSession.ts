/**
 * Adapted from pingdotgg/t3code
 * `apps/web/src/components/preview/openPreviewSession.ts`.
 *
 * t3code opens a desktop Chromium tab via `openPreview` RPC.
 * tahcode opens a Convex preview session the Mac bridge fetches.
 */
import {
  parsePreviewUrl,
  previewUrlErrorMessage,
} from "@shared/workbenchPreview.ts";

export function previewNavigateInput(
  raw: string
): { ok: true; url: string } | { ok: false; error: string } {
  const parsed = parsePreviewUrl(raw);
  if (!parsed.ok) {
    return { error: previewUrlErrorMessage(parsed.reason), ok: false };
  }
  return { ok: true, url: parsed.url.href };
}
