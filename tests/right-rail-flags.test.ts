import { describe, expect, it } from "vitest";

import {
  RIGHT_RAIL_SECTION_ENABLED,
  resolveRailTab,
  visibleRightRailTabs,
} from "../src/harness/rail/flags.ts";

describe("legacy right rail section flags", () => {
  it("keeps Context / Runtime / Team off the chat rail", () => {
    expect(RIGHT_RAIL_SECTION_ENABLED).toStrictEqual({
      Context: false,
      Runtime: false,
      Team: false,
    });
    expect(visibleRightRailTabs()).toStrictEqual([]);
    expect(resolveRailTab("Context")).toBeNull();
  });
});
