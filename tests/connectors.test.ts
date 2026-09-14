import { describe, expect, it } from "vitest";

import {
  canManageConnectorConnection,
  canUpsertConnectorConnection,
  canViewConnectorConnection,
  normalizeConnectorProvider,
  normalizeOpaqueConnectorId,
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
