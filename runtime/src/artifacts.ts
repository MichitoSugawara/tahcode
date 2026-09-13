import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  PathArtifact,
  StreamArtifact,
  UploadedArtifact,
} from "../../shared/artifacts.ts";
import {
  artifactNameFromPath,
  artifactsFromAssistantText,
  formatArtifactMarkdown,
  formatLocalArtifactMarkdown,
} from "../../shared/artifacts.ts";
import {
  contentTypeFromFileName,
  MAX_FILE_BYTES,
  normalizeContentType,
  sanitizeFileName,
} from "../../shared/files.ts";
import { usesCodexImagegen } from "../../shared/harnessFeatures.ts";
import type { RuntimeClient } from "./convexClient.ts";

export type ResolvedArtifact = {
  bytes: Uint8Array;
  contentType: string;
  localPath?: string;
  name: string;
};

export function generatedImagesDir(homeDir = os.homedir()): string {
  const explicitHome = homeDir !== os.homedir();
  const codexHome = explicitHome
    ? path.join(homeDir, ".codex")
    : process.env.CODEX_HOME?.trim() || path.join(homeDir, ".codex");
  return path.join(codexHome, "generated_images");
}

export function expandUserPath(
  filePath: string,
  homeDir = os.homedir()
): string {
  const stripped = filePath.startsWith("file://")
    ? filePath.slice("file://".length)
    : filePath;
  if (stripped.startsWith("~/")) {
    return path.join(homeDir, stripped.slice(2));
  }
  return stripped;
}

export function isAllowedArtifactPath(
  filePath: string,
  roots: readonly string[]
): boolean {
  const resolved = path.resolve(filePath);
  return roots.some((root) => {
    const base = path.resolve(root);
    return resolved === base || resolved.startsWith(`${base}${path.sep}`);
  });
}

export async function resolveStreamArtifact(
  artifact: StreamArtifact,
  roots: readonly string[],
  homeDir = os.homedir()
): Promise<ResolvedArtifact | null> {
  if (artifact.kind === "bytes") {
    const bytes = Uint8Array.from(atob(artifact.bytesBase64), (char) =>
      char.charCodeAt(0)
    );
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
      return null;
    }
    return {
      bytes,
      contentType: normalizeContentType(artifact.contentType),
      name: sanitizeFileName(artifact.name),
    };
  }
  const resolved = path.resolve(expandUserPath(artifact.path, homeDir));
  if (!isAllowedArtifactPath(resolved, roots)) {
    return null;
  }
  return await readImageFile(resolved, artifact.name);
}

export async function scanGeneratedImages(input: {
  homeDir?: string;
  sinceMs: number;
}): Promise<PathArtifact[]> {
  const dir = generatedImagesDir(input.homeDir);
  try {
    const names = await readdir(dir);
    const found: PathArtifact[] = [];
    for (const name of names) {
      const filePath = path.join(dir, name);
      const info = await stat(filePath).catch(() => null);
      if (!info?.isFile() || info.mtimeMs < input.sinceMs - 1000) {
        continue;
      }
      if (!contentTypeFromFileName(name)) {
        continue;
      }
      if (info.size <= 0 || info.size > MAX_FILE_BYTES) {
        continue;
      }
      found.push({
        kind: "path",
        name: sanitizeFileName(name),
        path: filePath,
      });
    }
    return found;
  } catch {
    return [];
  }
}

export async function collectJobArtifacts(input: {
  homeDir?: string;
  prompt: string;
  sinceMs: number;
  stream: readonly StreamArtifact[];
  text: string;
}): Promise<StreamArtifact[]> {
  const homeDir = input.homeDir ?? os.homedir();
  const fromStream = [...input.stream];
  const fromText = artifactsFromAssistantText(input.text);
  const fromDisk = usesCodexImagegen(input.prompt)
    ? await scanGeneratedImages({ homeDir, sinceMs: input.sinceMs })
    : [];
  const merged = [...fromStream, ...fromText, ...fromDisk];
  const seen = new Set<string>();
  const out: StreamArtifact[] = [];
  for (const item of merged) {
    const id =
      item.kind === "path"
        ? `path:${expandUserPath(item.path, homeDir)}`
        : `bytes:${item.name}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(item);
  }
  return out;
}

export async function materializeJobArtifacts(input: {
  client: RuntimeClient;
  cwd?: string;
  homeDir?: string;
  jobId: string;
  leaseId: string;
  prompt: string;
  runtimeId: string;
  sinceMs: number;
  stream: readonly StreamArtifact[];
  text: string;
  token: string;
}): Promise<{ fallbackMarkdown: string; uploadedMarkdown: string }> {
  const homeDir = input.homeDir ?? os.homedir();
  const roots = artifactRoots(input.cwd, homeDir);
  const collected = await collectJobArtifacts({
    homeDir,
    prompt: input.prompt,
    sinceMs: input.sinceMs,
    stream: input.stream,
    text: input.text,
  });
  const uploaded: UploadedArtifact[] = [];
  const leftover: PathArtifact[] = [];
  for (const artifact of collected) {
    const resolved = await resolveStreamArtifact(artifact, roots, homeDir);
    if (!resolved) {
      if (artifact.kind === "path") {
        leftover.push({
          kind: "path",
          name: artifactNameFromPath(artifact.path),
          path: artifact.path,
        });
      }
      continue;
    }
    try {
      const recorded = await input.client.ingestArtifact({
        bytes: resolved.bytes,
        contentType: resolved.contentType,
        jobId: input.jobId,
        leaseId: input.leaseId,
        localPath: resolved.localPath,
        name: resolved.name,
        runtimeId: input.runtimeId,
        token: input.token,
      });
      uploaded.push({
        contentType: resolved.contentType,
        key: recorded.key,
        localPath: resolved.localPath,
        name: recorded.name,
      });
    } catch {
      leftover.push(
        artifact.kind === "path"
          ? artifact
          : {
              kind: "path",
              name: artifact.name,
              path: "スレッドへのアップロードに失敗",
            }
      );
    }
  }
  return {
    fallbackMarkdown: formatLocalArtifactMarkdown(leftover),
    uploadedMarkdown: formatArtifactMarkdown(uploaded),
  };
}

export function composeFinalText(input: {
  artifactMarkdown: string;
  elapsed: string;
  fallbackMarkdown: string;
  model?: string;
  output: string;
  probeBinary: string;
  probeName: string;
}): string {
  const footer = `_${input.probeName}${input.model ? ` · ${input.model}` : ""} · ${input.elapsed}s · ${input.probeBinary}_`;
  return [input.output, input.artifactMarkdown, input.fallbackMarkdown, footer]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function artifactRoots(cwd: string | undefined, homeDir: string): string[] {
  const roots = [generatedImagesDir(homeDir)];
  if (cwd) {
    roots.push(path.resolve(cwd));
  }
  return roots;
}

async function readImageFile(
  filePath: string,
  nameHint?: string
): Promise<ResolvedArtifact | null> {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile() || info.size <= 0 || info.size > MAX_FILE_BYTES) {
    return null;
  }
  const name = sanitizeFileName(nameHint ?? path.basename(filePath));
  const contentType = contentTypeFromFileName(name);
  if (!contentType) {
    return null;
  }
  const bytes = new Uint8Array(await readFile(filePath));
  return { bytes, contentType, localPath: filePath, name };
}
