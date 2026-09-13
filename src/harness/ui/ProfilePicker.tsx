import { Layers, Minus } from "lucide-react";

import { ChoiceList } from "@/harness/ui/Field";

import type { Id } from "../../../convex/_generated/dataModel";

export type ProfileOption = {
  _id: Id<"skillProfiles">;
  description?: string;
  name: string;
  skillCount: number;
};

const NONE = "none";

export function ProfilePicker({
  onChange,
  profiles,
  value,
}: {
  onChange: (profileId: Id<"skillProfiles"> | null) => void;
  profiles: ProfileOption[] | undefined;
  value: Id<"skillProfiles"> | null;
}) {
  const options = [
    {
      desc: "このチャットではスキルを同期しません",
      icon: <Minus size={14} />,
      label: "なし",
      value: NONE,
    },
    ...(profiles ?? []).map((profile) => ({
      desc:
        profile.description ||
        `${profile.skillCount} 件のスキルをジョブ開始時に同期`,
      icon: <Layers size={14} />,
      label: profile.name,
      value: String(profile._id),
    })),
  ];
  return (
    <ChoiceList
      value={value ? String(value) : NONE}
      onChange={(next) =>
        onChange(next === NONE ? null : (next as Id<"skillProfiles">))
      }
      options={options}
    />
  );
}
