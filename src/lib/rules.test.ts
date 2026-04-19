import { describe, expect, it } from "vitest";
import { applyProgrammaticRules, parseDuration } from "./rules";
import type { CleanFeedRule, VideoCandidate } from "./types";

describe("parseDuration", () => {
  it("parses common duration formats", () => {
    expect(parseDuration("0:59")).toBe(59);
    expect(parseDuration("12:03")).toBe(723);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("")).toBeUndefined();
  });
});

describe("applyProgrammaticRules", () => {
  const baseCandidate: VideoCandidate = {
    key: "k",
    site: "youtube",
    url: "https://www.youtube.com/watch?v=1",
    title: "Deep TypeScript Tutorial",
    channel: "Engineering Notes",
    durationSeconds: 1800
  };

  it("matches keyword rules case-insensitively across title and channel", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "keyword",
        type: "keyword",
        enabled: true,
        label: "Block pranks",
        value: "typescript, prank",
        source: "ai"
      }
    ];

    expect(applyProgrammaticRules(baseCandidate, rules)?.ruleId).toBe("keyword");
  });

  it("does not apply disabled keyword rules", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "keyword",
        type: "keyword",
        enabled: false,
        label: "Block TypeScript",
        value: "typescript",
        source: "ai"
      }
    ];

    expect(applyProgrammaticRules(baseCandidate, rules)).toBeNull();
  });

  it("hides videos shorter than threshold, but not equal threshold", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "duration",
        type: "duration",
        enabled: true,
        label: "Block short videos",
        thresholdSeconds: 60,
        source: "ai"
      }
    ];

    expect(applyProgrammaticRules({ ...baseCandidate, durationSeconds: 59 }, rules)?.ruleId).toBe("duration");
    expect(applyProgrammaticRules({ ...baseCandidate, durationSeconds: 60 }, rules)).toBeNull();
  });

  it("does not hide duration-less videos with duration rules", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "duration",
        type: "duration",
        enabled: true,
        label: "Block short videos",
        thresholdSeconds: 60,
        source: "ai"
      }
    ];

    const { durationSeconds: _durationSeconds, ...durationlessCandidate } = baseCandidate;
    expect(applyProgrammaticRules(durationlessCandidate, rules)).toBeNull();
  });
});
