import { describe, expect, it } from "vitest";

import {
  buildScreenInputArgv,
  selectScreenInputPlan,
} from "../runtime/src/screenInput.ts";

describe("screen input plan", () => {
  it("prefers cliclick on darwin and xdotool on X11", () => {
    expect(
      selectScreenInputPlan("darwin", {}, (bin) =>
        bin === "cliclick" ? "/usr/local/bin/cliclick" : null
      )
    ).toStrictEqual({
      argv: ["/usr/local/bin/cliclick"],
      kind: "command",
    });
    expect(
      selectScreenInputPlan("linux", { DISPLAY: ":0" }, (bin) =>
        bin === "xdotool" ? "/usr/bin/xdotool" : null
      )
    ).toMatchObject({ kind: "command" });
    expect(
      selectScreenInputPlan("linux", {}, () => "/usr/bin/xdotool")
    ).toMatchObject({
      kind: "unsupported",
    });
  });

  it("maps a normalized click onto display pixels", () => {
    const argv = buildScreenInputArgv(
      { argv: ["/usr/local/bin/cliclick"], kind: "command" },
      { button: "left", kind: "click", x: 0.5, y: 0.25 },
      200,
      100
    );
    expect(argv).toStrictEqual(["/usr/local/bin/cliclick", "c:100,25"]);
  });
});
