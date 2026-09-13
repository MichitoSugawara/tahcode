import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ProviderDriverKind } from "../../shared/providers.ts";
import { skillFilePath, skillStoreTargets } from "../../shared/skills.ts";

export type SyncableSkill = {
  body: string;
  description: string;
  name: string;
  slug: string;
};

export type SkillSyncResult = {
  discovered: string[];
  skippedReason?: string;
  written: string[];
};

export async function syncProfileSkills(input: {
  cwd?: string;
  driverKind: ProviderDriverKind;
  homeDir: string;
  skills: SyncableSkill[];
}): Promise<SkillSyncResult> {
  const targets = skillStoreTargets({
    cwd: input.cwd,
    driverKind: input.driverKind,
    homeDir: input.homeDir,
  });
  if (input.skills.length === 0) {
    return { discovered: [], written: [] };
  }
  const supported = targets.filter((target) => target.supported && target.path);
  if (supported.length === 0) {
    return {
      discovered: [],
      skippedReason: `${input.driverKind} has no documented skill store; tahcode does not write skill files for this provider`,
      written: [],
    };
  }
  const written: string[] = [];
  for (const skill of input.skills) {
    for (const target of supported) {
      const filePath = skillFilePath(target.path, skill.slug);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, skill.body, "utf-8");
      written.push(filePath);
    }
  }
  return {
    discovered: [...new Set(input.skills.map((skill) => skill.slug))],
    written,
  };
}

export function skillSyncSummary(result: SkillSyncResult): string {
  if (result.skippedReason) {
    return result.skippedReason;
  }
  if (result.discovered.length === 0) {
    return "No profile skills to sync";
  }
  return `Synced skills to the local harness store: ${result.discovered.join(", ")}`;
}
