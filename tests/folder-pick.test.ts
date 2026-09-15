import { describe, expect, it } from "vitest";

import { foldersFromRecord } from "../src/lib/folderPick.ts";

describe("folder draft records", () => {
  it("drops empty machine paths before create/save", () => {
    expect(
      foldersFromRecord({
        "rt-a": "  /Users/ada/web  ",
        "rt-b": "   ",
      })
    ).toStrictEqual([{ cwd: "/Users/ada/web", runtimeId: "rt-a" }]);
  });
});
