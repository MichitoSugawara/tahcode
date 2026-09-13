import { useEffect } from "react";

const PRODUCT = "tahcode";

/** `document.title` as "<parts> · tahcode"; empty parts collapse to the product name. */
export function useDocumentTitle(...parts: (string | undefined | null)[]) {
  const title = [...parts.filter((part): part is string => !!part && part.trim().length > 0), PRODUCT].join(" · ");
  useEffect(() => {
    document.title = title;
  }, [title]);
}
