import { describe, expect, it } from "vitest";

import {
  canManageConnectorConnection,
  canUpsertConnectorConnection,
  canViewConnectorConnection,
  firstConnectorCardAttachment,
  isPendingConnectorAccountId,
  normalizeConnectorCardAttachment,
  normalizeConnectorProvider,
  normalizeOpaqueConnectorId,
  pendingConnectorAccountId,
  sanitizeLinearReturnPath,
} from "../shared/connectors.ts";

describe(normalizeConnectorProvider, () => {
  it("lowercases and trims a provider slug", () => {
    expect(normalizeConnectorProvider(" Linear ")).toBe("linear");
  });

  it("rejects empty or illegal slugs", () => {
    expect(() => normalizeConnectorProvider("")).toThrow(/required/i);
    expect(() => normalizeConnectorProvider("Linear Cloud")).toThrow(
      /lowercase/i
    );
  });
});

describe(pendingConnectorAccountId, () => {
  it("builds an opaque pending id for a provider slug", () => {
    expect(pendingConnectorAccountId("Linear")).toBe("pending:linear");
    expect(pendingConnectorAccountId("Linear", "req-2")).toBe(
      "pending:linear:req-2"
    );
    expect(isPendingConnectorAccountId("pending:linear:new-1")).toBeTruthy();
    expect(isPendingConnectorAccountId("ca_default-linear")).toBeFalsy();
    expect(() =>
      normalizeOpaqueConnectorId(pendingConnectorAccountId("linear", "req-2"))
    ).not.toThrow();
  });
});

describe(normalizeOpaqueConnectorId, () => {
  it("accepts an opaque OpenConnector id", () => {
    expect(normalizeOpaqueConnectorId(" ca_default-linear ")).toBe(
      "ca_default-linear"
    );
  });

  it("rejects OAuth tokens, API keys, and JWTs", () => {
    expect(() =>
      normalizeOpaqueConnectorId("lin_oauth_abcdefghijklmnopqrstuvwxyz")
    ).toThrow(/opaque/i);
    expect(() => normalizeOpaqueConnectorId("oct_admin_secret")).toThrow(
      /opaque/i
    );
    expect(() =>
      normalizeOpaqueConnectorId(
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"
      )
    ).toThrow(/opaque/i);
    expect(() => normalizeOpaqueConnectorId("access_token=abc")).toThrow(
      /opaque/i
    );
  });
});

describe(normalizeConnectorCardAttachment, () => {
  it("defaults to Linear org scope and rejects unknown providers", () => {
    expect(normalizeConnectorCardAttachment({})).toStrictEqual({
      kind: "connector",
      provider: "linear",
      scope: "org",
    });
    expect(
      normalizeConnectorCardAttachment({ provider: "Linear", scope: "user" })
    ).toStrictEqual({
      kind: "connector",
      provider: "linear",
      scope: "user",
    });
    expect(
      normalizeConnectorCardAttachment({ provider: "github" })
    ).toStrictEqual({
      kind: "connector",
      provider: "github",
      scope: "org",
    });
    expect(() =>
      normalizeConnectorCardAttachment({ provider: "slack" })
    ).toThrow(/unknown connector/i);
  });

  it("reads the first connector attachment on a message", () => {
    expect(
      firstConnectorCardAttachment([
        { kind: "connector", provider: "linear", scope: "org" },
      ])
    ).toMatchObject({ provider: "linear", scope: "org" });
    expect(firstConnectorCardAttachment([])).toBeUndefined();
  });
});

describe(sanitizeLinearReturnPath, () => {
  it("allows the chat and connectors surfaces for the same org", () => {
    expect(sanitizeLinearReturnPath(undefined, "preview")).toBe(
      "/o/preview/connectors"
    );
    expect(sanitizeLinearReturnPath("/o/preview/c/k17chat", "preview")).toBe(
      "/o/preview/c/k17chat"
    );
    expect(sanitizeLinearReturnPath("/o/other/c/k17chat", "preview")).toBe(
      "/o/preview/connectors"
    );
  });
});

describe("connector visibility", () => {
  it("lets members see org-scoped rows and their own user-scoped rows", () => {
    expect(
      canViewConnectorConnection({
        actorRole: "member",
        actorUserId: "u1",
        scope: "org",
      })
    ).toBeTruthy();
    expect(
      canViewConnectorConnection({
        actorRole: "member",
        actorUserId: "u1",
        connectionUserId: "u1",
        scope: "user",
      })
    ).toBeTruthy();
    expect(
      canViewConnectorConnection({
        actorRole: "member",
        actorUserId: "u1",
        connectionUserId: "u2",
        scope: "user",
      })
    ).toBeFalsy();
    expect(
      canViewConnectorConnection({
        actorRole: "admin",
        actorUserId: "u1",
        connectionUserId: "u2",
        scope: "user",
      })
    ).toBeTruthy();
  });

  it("requires admin for org-scope writes", () => {
    expect(
      canUpsertConnectorConnection({ actorRole: "member", scope: "org" })
    ).toBeFalsy();
    expect(
      canUpsertConnectorConnection({ actorRole: "admin", scope: "org" })
    ).toBeTruthy();
    expect(
      canUpsertConnectorConnection({ actorRole: "member", scope: "user" })
    ).toBeTruthy();
    expect(
      canManageConnectorConnection({
        actorRole: "member",
        actorUserId: "u1",
        scope: "org",
      })
    ).toBeFalsy();
    expect(
      canManageConnectorConnection({
        actorRole: "member",
        actorUserId: "u1",
        connectionUserId: "u1",
        scope: "user",
      })
    ).toBeTruthy();
  });
});
