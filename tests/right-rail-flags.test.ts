import { describe, expect, it } from "vitest";

import {
  RIGHT_RAIL_SECTION_ENABLED,
  isRightRailVisible,
  resolveRailTab,
  visibleRightRailTabs,
} from "../src/harness/rail/flags.ts";

describe("right rail section flags", () => {
  it("hides Context / Runtime / Team until a section is flipped back on", () => {
    expect(RIGHT_RAIL_SECTION_ENABLED).toStrictEqual({
      Context: false,
      Runtime: false,
      Team: false,
    });
    expect(visibleRightRailTabs()).toStrictEqual([]);
    expect(isRightRailVisible()).toBeFalsy();
    expect(resolveRailTab("Context")).toBeNull();
  });
});
