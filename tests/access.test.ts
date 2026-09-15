import { describe, expect, it } from "vitest";

import {
  canDeleteChat,
  canDeleteOwnedEntity,
  canRenameChat,
  canSeeChat,
  canSeeProject,
  canUseRuntime,
} from "../shared/access.ts";

describe(canUseRuntime, () => {
  it("is default-deny except for the machine owner", () => {
    expect(
      canUseRuntime({
        actorRole: "admin",
        actorUserId: "u1",
        grants: [],
        runtimeOwnerUserId: "owner",
      })
    ).toBeFalsy();
    expect(
      canUseRuntime({
        actorRole: "member",
        actorUserId: "owner",
        grants: [],
        runtimeOwnerUserId: "owner",
      })
    ).toBeTruthy();
  });

  it("honors mixed user and role grants", () => {
    expect(
      canUseRuntime({
        actorRole: "member",
        actorUserId: "u2",
        grants: [{ targetType: "role", targetRole: "member" }],
        runtimeOwnerUserId: "owner",
      })
    ).toBeTruthy();
    expect(
      canUseRuntime({
        actorRole: "admin",
        actorUserId: "u3",
        grants: [{ targetType: "user", targetUserId: "u3" }],
        runtimeOwnerUserId: "owner",
      })
    ).toBeTruthy();
  });

  it("treats role grants as a minimum rank", () => {
    expect(
      canUseRuntime({
        actorRole: "admin",
        actorUserId: "u4",
        grants: [{ targetType: "role", targetRole: "member" }],
        runtimeOwnerUserId: "owner",
      })
    ).toBeTruthy();
    expect(
      canUseRuntime({
        actorRole: "member",
        actorUserId: "u5",
        grants: [{ targetType: "role", targetRole: "admin" }],
        runtimeOwnerUserId: "owner",
      })
    ).toBeFalsy();
  });
});

describe("visibility", () => {
  it("hides private projects from non-members", () => {
    expect(
      canSeeProject({
        isOrgMember: true,
        isOwner: false,
        isProjectMember: false,
        visibility: "private",
      })
    ).toBeFalsy();
  });

  it("lets org admins see private projects", () => {
    expect(
      canSeeProject({
        isAdmin: true,
        isOrgMember: true,
        isOwner: false,
        isProjectMember: false,
        visibility: "private",
      })
    ).toBeTruthy();
  });

  it("keeps Phase 1 DMs owner-only", () => {
    expect(
      canSeeChat({
        actorUserId: "u2",
        chatKind: "dm",
        chatOwnerId: "u1",
        chatVisibility: "inherit",
        isChatMember: true,
        projectVisible: true,
      })
    ).toBeFalsy();
  });

  it("keeps no-project threads owner-only", () => {
    expect(
      canSeeChat({
        actorUserId: "u2",
        chatKind: "thread",
        chatOwnerId: "u1",
        chatVisibility: "inherit",
        isChatMember: true,
        projectVisible: true,
      })
    ).toBeFalsy();
    expect(
      canSeeChat({
        actorUserId: "u1",
        chatKind: "thread",
        chatOwnerId: "u1",
        chatVisibility: "inherit",
        isChatMember: false,
        projectVisible: false,
      })
    ).toBeTruthy();
  });
});

describe("entity lifecycle", () => {
  it("lets threads and project chats be renamed, but not Personal DM", () => {
    expect(canRenameChat("dm")).toBeFalsy();
    expect(canRenameChat("thread")).toBeTruthy();
    expect(canRenameChat("project")).toBeTruthy();
  });

  it("keeps Personal DM undeletable and threads owner-only", () => {
    expect(
      canDeleteChat({
        actorUserId: "u1",
        chatKind: "dm",
        createdBy: "u1",
        isAdmin: true,
        ownerId: "u1",
      })
    ).toBeFalsy();
    expect(
      canDeleteChat({
        actorUserId: "u1",
        chatKind: "thread",
        createdBy: "u1",
        isAdmin: false,
        ownerId: "u1",
      })
    ).toBeTruthy();
    expect(
      canDeleteChat({
        actorUserId: "u2",
        chatKind: "thread",
        createdBy: "u1",
        isAdmin: true,
        ownerId: "u1",
      })
    ).toBeFalsy();
  });

  it("lets the creator or an admin delete a project chat", () => {
    expect(
      canDeleteChat({
        actorUserId: "member",
        chatKind: "project",
        createdBy: "member",
        isAdmin: false,
      })
    ).toBeTruthy();
    expect(
      canDeleteChat({
        actorUserId: "admin",
        chatKind: "project",
        createdBy: "member",
        isAdmin: true,
      })
    ).toBeTruthy();
    expect(
      canDeleteChat({
        actorUserId: "other",
        chatKind: "project",
        createdBy: "member",
        isAdmin: false,
      })
    ).toBeFalsy();
    expect(
      canDeleteOwnedEntity({
        actorUserId: "owner",
        createdBy: "other",
        isAdmin: true,
      })
    ).toBeTruthy();
  });
});
