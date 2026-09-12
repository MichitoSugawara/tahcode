import { describe, expect, it } from "vitest";
import { canSeeChat, canSeeProject, canUseRuntime } from "../shared/access.ts";

describe("canUseRuntime", () => {
  it("is default-deny except for the machine owner", () => {
    expect(
      canUseRuntime({
        actorUserId: "u1",
        runtimeOwnerUserId: "owner",
        actorRole: "admin",
        grants: [],
      }),
    ).toBe(false);
    expect(
      canUseRuntime({
        actorUserId: "owner",
        runtimeOwnerUserId: "owner",
        actorRole: "member",
        grants: [],
      }),
    ).toBe(true);
  });

  it("honors mixed user and role grants", () => {
    expect(
      canUseRuntime({
        actorUserId: "u2",
        runtimeOwnerUserId: "owner",
        actorRole: "member",
        grants: [{ targetType: "role", targetRole: "member" }],
      }),
    ).toBe(true);
    expect(
      canUseRuntime({
        actorUserId: "u3",
        runtimeOwnerUserId: "owner",
        actorRole: "admin",
        grants: [{ targetType: "user", targetUserId: "u3" }],
      }),
    ).toBe(true);
  });
});

describe("visibility", () => {
  it("hides private projects from non-members", () => {
    expect(
      canSeeProject({
        visibility: "private",
        isOrgMember: true,
        isProjectMember: false,
        isOwner: false,
      }),
    ).toBe(false);
  });

  it("keeps Phase 1 DMs owner-only", () => {
    expect(
      canSeeChat({
        chatKind: "dm",
        chatOwnerId: "u1",
        actorUserId: "u2",
        chatVisibility: "inherit",
        projectVisible: true,
        isChatMember: true,
      }),
    ).toBe(false);
  });
});
