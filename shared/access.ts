export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const VISIBILITY = ["org", "private"] as const;
export type Visibility = (typeof VISIBILITY)[number];

export const CHAT_VISIBILITY = ["inherit", "private"] as const;
export type ChatVisibility = (typeof CHAT_VISIBILITY)[number];

export const GRANT_TARGETS = ["user", "role"] as const;
export type GrantTarget = (typeof GRANT_TARGETS)[number];

export function roleAtLeast(role: OrgRole, needed: OrgRole): boolean {
  const rank: Record<OrgRole, number> = { admin: 1, member: 0, owner: 2 };
  return rank[role] >= rank[needed];
}

export function canInvite(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManagePermissions(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManageOrg(role: OrgRole): boolean {
  return role === "owner";
}

/**
 * Runtime ACL is default-deny. The machine owner always may use their runtime.
 * Everyone else needs an explicit grant to their user id or to a role they hold.
 */
export function canUseRuntime(input: {
  actorUserId: string;
  runtimeOwnerUserId: string;
  actorRole: OrgRole;
  grants: readonly {
    targetType: GrantTarget;
    targetUserId?: string;
    targetRole?: OrgRole;
  }[];
}): boolean {
  if (input.actorUserId === input.runtimeOwnerUserId) {
    return true;
  }
  return input.grants.some((grant) => {
    if (grant.targetType === "user") {
      return grant.targetUserId === input.actorUserId;
    }
    if (grant.targetType === "role" && grant.targetRole) {
      return roleAtLeast(input.actorRole, grant.targetRole);
    }
    return false;
  });
}

export function canSeeProject(input: {
  visibility: Visibility;
  isOrgMember: boolean;
  isProjectMember: boolean;
  isOwner: boolean;
  isAdmin?: boolean;
}): boolean {
  if (!input.isOrgMember) {
    return false;
  }
  if (input.visibility === "org") {
    return true;
  }
  return input.isProjectMember || input.isOwner || input.isAdmin === true;
}

export function canSeeChat(input: {
  chatKind: "dm" | "project";
  chatOwnerId?: string;
  actorUserId: string;
  chatVisibility: ChatVisibility;
  projectVisible: boolean;
  isChatMember: boolean;
}): boolean {
  if (input.chatKind === "dm") {
    return input.chatOwnerId === input.actorUserId;
  }
  if (!input.projectVisible) {
    return false;
  }
  if (input.chatVisibility === "private") {
    return input.isChatMember;
  }
  return true;
}
