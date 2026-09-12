import { useEffect } from "react";

const PRODUCT = "dalecode";

/** `document.title` as "<parts> · dalecode"; empty parts collapse to the product name. */
export function useDocumentTitle(...parts: (string | undefined | null)[]) {
  const title = [...parts.filter((part): part is string => !!part && part.trim().length > 0), PRODUCT].join(" · ");
  useEffect(() => {
    document.title = title;
  }, [title]);
}
