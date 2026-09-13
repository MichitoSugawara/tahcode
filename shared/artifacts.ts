/**
 * Detect harness-produced artifacts (Codex `$imagegen` / image_generation
 * stream items) and turn them into chat-safe markdown.
 */
import {
  contentTypeFromFileName,
  isImageContentType,
  sanitizeFileName,
} from "./files.ts";

const IMAGE_ITEM = /image_gen|image_generation|generated_image/i;
const PATH_KEYS = [
  "saved_path",
  "file_path",
  "output_path",
  "image_path",
  "path",
] as const;
const IMAGE_PATH = /\.(?:gif|jpe?g|png|webp)(?:$|[?#])/i;
const GENERATED_IMAGES = /generated_images/i;
const MIN_BASE64_CHARS = 32;

export type PathArtifact = {
  kind: "path";
  name: string;
  path: string;
};

export type BytesArtifact = {
  bytesBase64: string;
  contentType: string;
  kind: "bytes";
  name: string;
};

export type StreamArtifact = BytesArtifact | PathArtifact;

export type UploadedArtifact = {
  contentType: string;
  key: string;
  localPath?: string;
  name: string;
};

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const GIF_MAGIC = [0x47, 0x49, 0x46];
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46];

export function looksLikeImagePath(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    return false;
  }
  if (/\s/.test(trimmed) && !GENERATED_IMAGES.test(trimmed)) {
    return false;
  }
  return IMAGE_PATH.test(trimmed) || GENERATED_IMAGES.test(trimmed);
}

export function artifactNameFromPath(filePath: string): string {
  const cleaned = filePath.replaceAll("\\", "/");
  const base = cleaned.split("/").pop()?.split("?")[0] ?? "image.png";
  return sanitizeFileName(base);
}

export function tryImageBase64(raw: string): BytesArtifact | null {
  const trimmed = raw.trim();
  const dataUrl = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(trimmed);
  const payload = dataUrl?.[2] ?? trimmed;
  const hintedType = dataUrl?.[1]?.toLowerCase();
  if (payload.length < MIN_BASE64_CHARS || payload.length > 20_000_000) {
    return null;
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(payload)) {
    return null;
  }
  let bytes: Uint8Array;
  try {
    const compact = payload.replaceAll(/\s+/g, "");
    const binary = atob(compact);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
  const contentType =
    (hintedType && isImageContentType(hintedType) && hintedType) ||
    sniffImageType(bytes);
  if (!contentType) {
    return null;
  }
  const ext = contentType.split("/")[1] ?? "png";
  return {
    bytesBase64: payload.replaceAll(/\s+/g, ""),
    contentType,
    kind: "bytes",
    name: sanitizeFileName(`generated.${ext}`),
  };
}

export function sniffImageType(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, PNG_MAGIC)) {
    return "image/png";
  }
  if (startsWith(bytes, JPEG_MAGIC)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, GIF_MAGIC)) {
    return "image/gif";
  }
  if (startsWith(bytes, WEBP_MAGIC) && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return "image/webp";
  }
  return undefined;
}

export function extractStreamArtifacts(parsed: unknown): StreamArtifact[] {
  if (typeof parsed !== "object" || parsed === null) {
    return [];
  }
  const record = parsed as Record<string, unknown>;
  const found: StreamArtifact[] = [];
  const item = record.item;
  if (item && typeof item === "object") {
    found.push(...fromRecord(item as Record<string, unknown>));
  }
  found.push(...fromRecord(record));
  return dedupeArtifacts(found);
}

export function artifactsFromAssistantText(text: string): PathArtifact[] {
  const found: PathArtifact[] = [];
  const markdown = /!\[[^\]]*]\(([^)\s]+)\)/g;
  for (const match of text.matchAll(markdown)) {
    const src = match[1] ?? "";
    if (src.startsWith("/api/files/") || /^https?:\/\//i.test(src)) {
      continue;
    }
    if (looksLikeImagePath(src)) {
      found.push({
        kind: "path",
        name: artifactNameFromPath(src),
        path: src,
      });
    }
  }
  const bare =
    /(?:^|[\s`'"])((?:~|file:\/\/|\/|[A-Za-z]:\\)[^\s`'"]+\.(?:gif|jpe?g|png|webp))/gi;
  for (const match of text.matchAll(bare)) {
    const src = match[1] ?? "";
    if (looksLikeImagePath(src)) {
      found.push({
        kind: "path",
        name: artifactNameFromPath(src),
        path: src,
      });
    }
  }
  return dedupeArtifacts(found);
}

export function formatArtifactMarkdown(
  artifacts: readonly UploadedArtifact[]
): string {
  if (artifacts.length === 0) {
    return "";
  }
  return artifacts
    .map((artifact) => {
      const alt = artifact.name;
      const href = `/api/files/${encodeURIComponent(artifact.key)}`;
      return `![${alt}](${href})`;
    })
    .join("\n\n");
}

export function formatLocalArtifactMarkdown(
  artifacts: readonly PathArtifact[]
): string {
  if (artifacts.length === 0) {
    return "";
  }
  const lines = artifacts.map((artifact) => {
    const type = contentTypeFromFileName(artifact.name);
    const label = type ? "生成した画像" : "生成したファイル";
    return `- ${label} \`${artifact.name}\`（このマシン: \`${artifact.path}\`）`;
  });
  return ["**ハーネスが返した成果物**", ...lines].join("\n");
}

function fromRecord(record: Record<string, unknown>): StreamArtifact[] {
  const found: StreamArtifact[] = [];
  const itemType =
    (typeof record.item_type === "string" && record.item_type) ||
    (typeof record.type === "string" && record.type) ||
    "";
  const imageItem = IMAGE_ITEM.test(itemType);

  for (const key of PATH_KEYS) {
    const value = record[key];
    if (typeof value === "string" && (imageItem || looksLikeImagePath(value))) {
      found.push({
        kind: "path",
        name: artifactNameFromPath(value),
        path: stripFileUrl(value),
      });
    }
  }

  const b64 = record.b64_json;
  if (typeof b64 === "string") {
    const decoded = tryImageBase64(b64);
    if (decoded) {
      found.push(decoded);
    }
  }

  const result = record.result;
  if (typeof result === "string") {
    if (looksLikeImagePath(result)) {
      found.push({
        kind: "path",
        name: artifactNameFromPath(result),
        path: stripFileUrl(result),
      });
    } else if (imageItem || result.length > MIN_BASE64_CHARS) {
      const decoded = tryImageBase64(result);
      if (decoded) {
        found.push(decoded);
      }
    }
  } else if (result && typeof result === "object") {
    found.push(...fromRecord(result as Record<string, unknown>));
  }
  return found;
}

function stripFileUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("file://")) {
    try {
      return decodeURIComponent(trimmed.slice("file://".length));
    } catch {
      return trimmed.slice("file://".length);
    }
  }
  return trimmed;
}

function dedupeArtifacts<T extends StreamArtifact>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id =
      item.kind === "path"
        ? `path:${item.path}`
        : `bytes:${item.name}:${item.bytesBase64.length}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(item);
  }
  return out;
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}
