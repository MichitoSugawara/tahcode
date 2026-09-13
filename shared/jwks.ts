const PUBLIC_JWK_FIELDS = [
  "alg",
  "crv",
  "e",
  "kid",
  "kty",
  "n",
  "use",
  "x",
  "y",
] as const;

export type PublicJwk = {
  alg?: string;
  crv?: string;
  e?: string;
  kid?: string;
  kty?: string;
  n?: string;
  use?: string;
  x?: string;
  y?: string;
};

export type PublicJwks = { keys: PublicJwk[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Keep only public JWK fields so a private-key JWKS can never be published. */
export function publicOnlyJwks(jwks: unknown): PublicJwks {
  if (!isRecord(jwks) || !Array.isArray(jwks.keys)) {
    throw new Error("JWKS must be an object with a keys array");
  }
  const keys = jwks.keys.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("JWKS key must be an object");
    }
    const next: PublicJwk = {};
    for (const field of PUBLIC_JWK_FIELDS) {
      const value = entry[field];
      if (typeof value === "string") {
        next[field] = value;
      }
    }
    return next;
  });
  if (keys.length < 1) {
    throw new Error("JWKS must contain at least one key");
  }
  return { keys };
}
