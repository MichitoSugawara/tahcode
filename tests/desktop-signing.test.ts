import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  compileTimeSignedFlag,
  detectCiSigning,
  electronBuilderMacOverrides,
  hasDeveloperIdMaterials,
  hasNotarizeMaterials,
  hasSignedDistributionMaterials,
  missingEnvNames,
  requireSignedDistributionEnv,
  SIGNED_DISTRIBUTION_ENV,
  wantsSignedBuild,
} from "../apps/desktop/scripts/desktop-signing.mjs";

const emptyEnv: NodeJS.ProcessEnv = {};

const signedEnv: NodeJS.ProcessEnv = {
  APPLE_APP_SPECIFIC_PASSWORD: "xxxx-xxxx-xxxx-xxxx",
  APPLE_ID: "dev@example.com",
  APPLE_TEAM_ID: "ABCD123456",
  CSC_KEY_PASSWORD: "p12-password",
  CSC_LINK: "file:///tmp/DeveloperID.p12",
};

describe("desktop signing env detection", () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it("treats whitespace-only secrets as missing", () => {
    expect(
      hasDeveloperIdMaterials({
        CSC_KEY_PASSWORD: "  ",
        CSC_LINK: "file:///tmp/cert.p12",
      })
    ).toBeFalsy();
    expect(
      missingEnvNames(SIGNED_DISTRIBUTION_ENV, {
        ...signedEnv,
        APPLE_TEAM_ID: "",
      })
    ).toStrictEqual(["APPLE_TEAM_ID"]);
  });

  it("requires all five secrets for signed+notarized CI", () => {
    expect(hasSignedDistributionMaterials(emptyEnv)).toBeFalsy();
    expect(hasSignedDistributionMaterials(signedEnv)).toBeTruthy();
    expect(
      hasSignedDistributionMaterials({
        ...signedEnv,
        APPLE_APP_SPECIFIC_PASSWORD: undefined,
      })
    ).toBeFalsy();
    expect(hasNotarizeMaterials(signedEnv)).toBeTruthy();
  });

  it("keeps unsigned electron-builder overrides without certs", () => {
    expect(wantsSignedBuild(emptyEnv)).toBeFalsy();
    expect(electronBuilderMacOverrides(emptyEnv)).toStrictEqual([
      "-c.mac.identity=null",
      "-c.dmg.sign=false",
      "-c.mac.notarize=false",
    ]);
    expect(compileTimeSignedFlag(emptyEnv)).toBe("");
  });

  it("enables dmg.sign, forceCodeSigning, and notarize when materials exist", () => {
    expect(wantsSignedBuild(signedEnv)).toBeTruthy();
    expect(electronBuilderMacOverrides(signedEnv)).toStrictEqual([
      "-c.dmg.sign=true",
      "-c.forceCodeSigning=true",
      "-c.mac.notarize=true",
    ]);
    expect(
      electronBuilderMacOverrides({
        TAHCODE_DESKTOP_SIGNED: "1",
      })
    ).toStrictEqual([
      "-c.dmg.sign=true",
      "-c.forceCodeSigning=true",
      "-c.mac.notarize=false",
    ]);
    expect(compileTimeSignedFlag({ TAHCODE_DESKTOP_SIGNED: "1" })).toBe("1");
  });

  it("refuses dist:mac:signed when env is incomplete", () => {
    const originalError = console.error;
    console.error = () => {
      /* expected usage text */
    };
    try {
      expect(requireSignedDistributionEnv(emptyEnv)).toBeFalsy();
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
      expect(requireSignedDistributionEnv(signedEnv)).toBeTruthy();
      expect(process.exitCode).toBeUndefined();
    } finally {
      console.error = originalError;
    }
  });

  it("logs the CI branch without echoing secret values", () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      lines.push(String(message));
    };
    try {
      expect(detectCiSigning(signedEnv)).toBeTruthy();
      expect(detectCiSigning(emptyEnv)).toBeFalsy();
    } finally {
      console.log = originalLog;
    }
    const joined = lines.join("\n");
    expect(
      joined.includes("signed+notarized") && joined.includes("unsigned")
    ).toBeTruthy();
    expect(
      !joined.includes("p12-password") &&
        !joined.includes("xxxx-xxxx-xxxx-xxxx") &&
        !joined.includes("file:///tmp/DeveloperID.p12")
    ).toBeTruthy();
  });

  it("records signed=true on GITHUB_OUTPUT when all secrets exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "tahcode-signing-"));
    const output = join(dir, "github-output");
    const originalLog = console.log;
    console.log = () => {
      /* quiet */
    };
    try {
      detectCiSigning({ ...signedEnv, GITHUB_OUTPUT: output });
    } finally {
      console.log = originalLog;
    }
    expect(readFileSync(output, "utf-8")).toBe("signed=true\n");
  });
});
