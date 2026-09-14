import { describe, expect, it } from "vitest";

import {
  isLegacyConnectorsHash,
  isOrgFullWidthPath,
  orgConnectorsPath,
  orgSettingsPath,
} from "../src/lib/orgPaths.ts";

describe("org paths", () => {
  it("builds settings and connectors URLs", () => {
    expect(orgSettingsPath("preview")).toBe("/o/preview/settings");
    expect(orgSettingsPath("preview", "skills")).toBe(
      "/o/preview/settings#skills"
    );
    expect(orgSettingsPath("preview", "#desktop")).toBe(
      "/o/preview/settings#desktop"
    );
    expect(orgConnectorsPath("preview")).toBe("/o/preview/connectors");
  });

  it("treats settings and connectors as full-width Shell pages", () => {
    expect(isOrgFullWidthPath("/o/acme/settings", "acme")).toBeTruthy();
    expect(isOrgFullWidthPath("/o/acme/connectors", "acme")).toBeTruthy();
    expect(isOrgFullWidthPath("/o/acme", "acme")).toBeFalsy();
    expect(isOrgFullWidthPath("/o/acme/c/chat1", "acme")).toBeFalsy();
    expect(isOrgFullWidthPath("/o/acme/settings", "other")).toBeFalsy();
  });

  it("recognizes the retired Settings #connectors hash", () => {
    expect(isLegacyConnectorsHash("#connectors")).toBeTruthy();
    expect(isLegacyConnectorsHash("connectors")).toBeTruthy();
    expect(isLegacyConnectorsHash("#skills")).toBeFalsy();
  });
});
