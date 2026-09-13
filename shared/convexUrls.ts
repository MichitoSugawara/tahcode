/** Derive the Convex HTTP (.site) origin from the cloud URL the bridge stores. */

export function convexSiteUrl(
  cloudUrl: string,
  overrides?: { siteUrl?: string }
): string {
  const fromEnv = overrides?.siteUrl?.trim() ?? "";
  if (fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  try {
    const url = new URL(cloudUrl);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
      return url.origin;
    }
    if (url.port === "3210") {
      url.port = "3211";
    }
    return url.origin;
  } catch {
    return cloudUrl.replace(/\/$/, "");
  }
}
