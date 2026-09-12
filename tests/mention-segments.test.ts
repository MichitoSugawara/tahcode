import { describe, expect, it } from "vitest";
import { segmentMentions } from "../src/lib/mentions.ts";

describe("segmentMentions", () => {
  it("splits text around @handles, keeping the surrounding text intact", () => {
    expect(segmentMentions("hey @codex fix this")).toEqual([
      { kind: "text", value: "hey " },
      { kind: "mention", value: "@codex" },
      { kind: "text", value: " fix this" },
    ]);
  });

  it("round-trips: joining the segments yields the original draft", () => {
    const draft = "@claude と @mai に\n@cursor/muse-spark-1.3 で相談。foo@bar.com は無視";
    expect(segmentMentions(draft).map((segment) => segment.value).join("")).toBe(draft);
  });

  it("treats @provider/model as a single token", () => {
    const mentions = segmentMentions("@cursor/muse-spark-1.3 please").filter((segment) => segment.kind === "mention");
    expect(mentions).toEqual([{ kind: "mention", value: "@cursor/muse-spark-1.3" }]);
  });

  it("highlights a mention at the start and after a newline", () => {
    const mentions = segmentMentions("@agent first\n@grok second").filter((segment) => segment.kind === "mention");
    expect(mentions.map((segment) => segment.value)).toEqual(["@agent", "@grok"]);
  });

  it("leaves email-like text and a bare @ alone", () => {
    expect(segmentMentions("mail me at foo@bar.com @")).toEqual([{ kind: "text", value: "mail me at foo@bar.com @" }]);
  });

  it("returns nothing for an empty draft", () => {
    expect(segmentMentions("")).toEqual([]);
  });
});
