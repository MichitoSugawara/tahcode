import {
  DESKTOP_IPC,
  LINK_NO_RESTART_FLAG,
  displayHostname,
  fallbackRegisterCommands,
  guessBrowserMachineName,
  isAllowedConvexUrl,
  isRegisterProgressStep,
  linkArgv,
  looksLikeElevationError,
  mergePath,
  parseRegisterLocalRuntimeRequest,
  planRegisterAfterLink,
  redactSecrets,
} from "@tahcode/core/desktop";
import { describe, expect, it } from "vitest";

const valid = {
  convexUrl: "https://happy-animal-123.convex.cloud",
  name: "office-mac",
  runtimeId: "jd7abcdefghijk1234567890abcd",
  token: `th_${"ab".repeat(16)}`,
};

describe(parseRegisterLocalRuntimeRequest, () => {
  it("accepts a Convex cloud URL, runtime id, token and name", () => {
    expect(parseRegisterLocalRuntimeRequest(valid)).toStrictEqual({
      ok: true,
      value: valid,
    });
  });

  it("accepts a loopback convex dev URL", () => {
    const result = parseRegisterLocalRuntimeRequest({
      ...valid,
      convexUrl: "http://127.0.0.1:3210",
    });
    expect(result.ok).toBeTruthy();
  });

  it("rejects missing fields and off-site URLs", () => {
    expect(parseRegisterLocalRuntimeRequest(null).ok).toBeFalsy();
    expect(parseRegisterLocalRuntimeRequest("link").ok).toBeFalsy();
    expect(
      parseRegisterLocalRuntimeRequest({
        ...valid,
        convexUrl: "https://evil.example",
      }).ok
    ).toBeFalsy();
    expect(
      parseRegisterLocalRuntimeRequest({
        ...valid,
        convexUrl: "https://user:pass@happy-animal-123.convex.cloud",
      }).ok
    ).toBeFalsy();
    expect(isAllowedConvexUrl("file:///etc/passwd")).toBeFalsy();
  });

  it("rejects a bad token, runtime id, or machine name", () => {
    expect(
      parseRegisterLocalRuntimeRequest({ ...valid, token: "not-a-token" }).ok
    ).toBeFalsy();
    expect(
      parseRegisterLocalRuntimeRequest({ ...valid, runtimeId: "../etc" }).ok
    ).toBeFalsy();
    expect(
      parseRegisterLocalRuntimeRequest({ ...valid, name: "" }).ok
    ).toBeFalsy();
    expect(
      parseRegisterLocalRuntimeRequest({
        ...valid,
        name: "x".repeat(80),
      }).ok
    ).toBeFalsy();
    expect(
      parseRegisterLocalRuntimeRequest({
        ...valid,
        name: "bad\nname",
      }).ok
    ).toBeFalsy();
  });
});

describe("register helpers", () => {
  it("strips Bonjour .local from hostnames", () => {
    expect(displayHostname("MacBook-Pro.local")).toBe("MacBook-Pro");
    expect(displayHostname("  studio.local  ")).toBe("studio");
    expect(displayHostname("")).toBe("");
  });

  it("guesses a browser machine name from the user agent", () => {
    expect(
      guessBrowserMachineName(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "2026-09-13T08:00:00.000Z"
      )
    ).toBe("mac-0913");
  });

  it("redacts the raw token and never keeps it in logs", () => {
    const text = `link --token ${valid.token} --name office`;
    expect(redactSecrets(text, [valid.token])).toBe(
      "link --token th_… --name office"
    );
    expect(redactSecrets(text, [valid.token])).not.toContain(valid.token);
  });

  it("detects npm elevation failures", () => {
    expect(looksLikeElevationError("npm ERR! code EACCES")).toBeTruthy();
    expect(
      looksLikeElevationError(
        "Please try running this command again as root/Administrator"
      )
    ).toBeTruthy();
    expect(looksLikeElevationError("network timeout")).toBeFalsy();
  });

  it("builds the same 3-line fallback the browser dialog shows", () => {
    const lines = fallbackRegisterCommands(valid);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("npm i -g tahcode");
    expect(lines[1]).toContain("tahcode link");
    expect(lines[1]).toContain(valid.token);
    expect(lines[2]).toBe("tahcode start");
  });

  it("prepends extra PATH entries without duplicates", () => {
    expect(
      mergePath("/usr/bin:/bin", ["/opt/homebrew/bin", "/usr/bin"], ":")
    ).toBe("/opt/homebrew/bin:/usr/bin:/bin");
  });
});

describe("register after re-link", () => {
  it("builds a no-restart link argv so the desktop owns bridge recycle", () => {
    const args = linkArgv(valid);
    expect(args[0]).toBe("link");
    expect(args).toContain(LINK_NO_RESTART_FLAG);
    expect(args).toContain(valid.token);
    expect(args.at(-1)).toBe(LINK_NO_RESTART_FLAG);
    expect(linkArgv(valid, false)).not.toContain(LINK_NO_RESTART_FLAG);
  });

  it("restarts a running bridge and starts a missing one without Multica", () => {
    expect(planRegisterAfterLink(true)).toStrictEqual({
      args: ["restart", "bridge"],
      progress: "restarting-bridge",
    });
    expect(planRegisterAfterLink(false)).toStrictEqual({
      args: ["start", "--no-daemon"],
      progress: "starting-bridge",
    });
  });

  it("allow-lists progress steps and rejects free-form IPC payloads", () => {
    expect(DESKTOP_IPC.registerProgress).toBe(
      "tahcode:desktop:registerProgress"
    );
    expect(isRegisterProgressStep("restarting-bridge")).toBeTruthy();
    expect(isRegisterProgressStep("starting-bridge")).toBeTruthy();
    expect(isRegisterProgressStep("rm -rf /")).toBeFalsy();
    expect(isRegisterProgressStep(null)).toBeFalsy();
  });
});
