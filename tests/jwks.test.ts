import { describe, expect, it } from "vitest";

import { publicOnlyJwks } from "../shared/jwks.ts";

describe(publicOnlyJwks, () => {
  it("strips private RSA components", () => {
    const published = publicOnlyJwks({
      keys: [
        {
          d: "secret",
          e: "AQAB",
          kty: "RSA",
          n: "modulus",
          p: "p",
          q: "q",
          use: "sig",
        },
      ],
    });
    expect(published.keys[0]).toStrictEqual({
      e: "AQAB",
      kty: "RSA",
      n: "modulus",
      use: "sig",
    });
    expect(published.keys[0]).not.toHaveProperty("d");
  });
});
