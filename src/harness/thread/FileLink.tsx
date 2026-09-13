import { fileKeyFromHref } from "@shared/files.ts";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";

function interceptKey(href?: string): string | null {
  if (!href?.startsWith("/api/files/")) {
    return null;
  }
  const url = new URL(href, "https://tahcode.invalid");
  if (url.searchParams.get("ticket")) {
    return null;
  }
  return fileKeyFromHref(href);
}

/** Attachment links minted before a ticket existed, or listed without one. */
export function FileLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const ticketForKey = useMutation(api.files.ticketForKey);
  const [busy, setBusy] = useState(false);
  const key = interceptKey(href);
  const file = useQuery(api.files.getByKey, key ? { key } : "skip");

  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!key) {
      return;
    }
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const signed =
        file?.kind === "storage" && file.url.startsWith("http")
          ? file.url
          : await ticketForKey({ key });
      window.open(signed, "_blank", "noopener");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ファイルを開けません"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-busy={busy}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
