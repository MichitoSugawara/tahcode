import { describe, expect, it } from "vitest";

import type { Project, Runtime } from "../src/harness/OrgContext";
import {
  pickWorkbenchRuntime,
  workbenchCwd,
} from "../src/harness/workbench/useWorkbenchMachine.ts";

const now = 1_000_000;

function runtime(
  id: string,
  fields: Partial<Runtime> & Pick<Runtime, "canUse" | "lastSeenAt" | "status">
): Runtime {
  return {
    _id: id as Runtime["_id"],
    capabilities: ["pty", "preview"],
    grants: [],
    maintenanceByAdmins: false,
    name: id,
    ownerUserId: "u1" as Runtime["ownerUserId"],
    providers: [],
    slug: id,
    ...fields,
  };
}

describe("workbench machine picker", () => {
  it("prefers the designated live runtime and ignores stale ones", () => {
    const live = runtime("live", {
      canUse: true,
      lastSeenAt: now - 1000,
      status: "online",
    });
    const stale = runtime("stale", {
      canUse: true,
      lastSeenAt: now - 200_000,
      status: "online",
    });
    const other = runtime("other", {
      canUse: true,
      lastSeenAt: now - 1000,
      status: "online",
    });
    expect(pickWorkbenchRuntime([stale, other, live], "live", now)?._id).toBe(
      "live"
    );
    expect(pickWorkbenchRuntime([stale, other], "live", now)?._id).toBe(
      "other"
    );
    expect(pickWorkbenchRuntime([stale], null, now)).toBeUndefined();
  });

  it("uses the project peek path before the machine cwd", () => {
    const machine = runtime("r1", {
      canUse: true,
      cwd: "/Users/ada/machine",
      lastSeenAt: now,
      status: "online",
    });
    const project = {
      folders: [{ cwd: "/Users/ada/code", runtimeId: machine._id }],
    } as Project;
    expect(workbenchCwd(machine, project)).toBe("/Users/ada/code");
    expect(workbenchCwd(machine)).toBe("/Users/ada/machine");
    expect(workbenchCwd(undefined, project)).toBe("");
  });
});
