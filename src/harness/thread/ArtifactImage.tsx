import { fileKeyFromHref, isImageContentType } from "@shared/files.ts";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { FileLink } from "@/harness/thread/FileLink";

import { api } from "../../../convex/_generated/api";

export function ArtifactImage({ alt, src }: { alt?: string; src?: string }) {
  const key = src ? fileKeyFromHref(src) : null;
  const file = useQuery(api.files.getByKey, key ? { key } : "skip");
  const ticketForKey = useMutation(api.files.ticketForKey);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const storageUrl =
    file?.kind === "storage" && file.url.startsWith("http") ? file.url : null;

  useEffect(() => {
    if (!key || !file || storageUrl) {
      return;
    }
    let cancelled = false;
    void ticketForKey({ key })
      .then((signed) => {
        if (!cancelled) {
          setTicketUrl(signed);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file, key, storageUrl, ticketForKey]);

  if (src && /^https?:\/\//i.test(src)) {
    return <img src={src} alt={alt ?? ""} className="artifact-image" />;
  }

  if (!key) {
    return <LocalArtifactFallback alt={alt} src={src} />;
  }

  if (file === undefined) {
    return <span className="text-ink-3 text-[12px]">画像を読み込み中…</span>;
  }

  if (file === null || failed) {
    return <LocalArtifactFallback alt={alt ?? file?.name} src={src} />;
  }

  const resolved = storageUrl ?? ticketUrl;
  if (!resolved) {
    return <span className="text-ink-3 text-[12px]">画像を読み込み中…</span>;
  }

  if (!isImageContentType(file.contentType)) {
    return (
      <FileLink href={src} className="text-accent underline">
        {alt || file.name}
      </FileLink>
    );
  }

  return (
    <figure className="artifact-figure">
      <img
        src={resolved}
        alt={alt || file.name}
        className="artifact-image"
        onError={() => setFailed(true)}
      />
      <figcaption className="text-ink-3 mt-1 text-[11.5px]">
        {file.name}
      </figcaption>
    </figure>
  );
}

function LocalArtifactFallback({
  alt,
  src,
}: {
  alt?: string;
  src?: string;
}): ReactNode {
  return (
    <figure className="border-line bg-field rounded-[10px] border px-3 py-2">
      <figcaption className="text-ink text-[12.5px] font-medium">
        {alt || "生成した画像"}
      </figcaption>
      {src && (
        <code className="text-ink-2 mt-1 block font-mono text-[11.5px] break-all">
          {src}
        </code>
      )}
      <p className="text-ink-3 mt-1 text-[11.5px]">
        画像を表示できません。パスがこのマシン上の成果物なら、ランタイム側のファイルを確認してください。
      </p>
    </figure>
  );
}

export function ArtifactGallery({
  files,
  hideKeys,
}: {
  files: {
    contentType: string;
    key: string;
    name: string;
    url: string;
  }[];
  hideKeys: ReadonlySet<string>;
}) {
  const extras = files.filter(
    (file) => !hideKeys.has(file.key) && isImageContentType(file.contentType)
  );
  if (extras.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-col gap-3">
      {extras.map((file) => (
        <ArtifactImage
          key={file.key}
          alt={file.name}
          src={`/api/files/${encodeURIComponent(file.key)}`}
        />
      ))}
    </div>
  );
}

export function keysInMarkdown(text: string): Set<string> {
  const keys = new Set<string>();
  const pattern = /!\[[^\]]*]\((\/api\/files\/[^)\s]+)\)/g;
  for (const match of text.matchAll(pattern)) {
    const key = fileKeyFromHref(match[1] ?? "");
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}
