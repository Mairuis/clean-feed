import { describe, expect, it } from "vitest";
import { applyProgrammaticRules, buildVideoRuleText, parseDuration } from "./rules";
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

  it("matches regex rules against the extracted video text", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "regex",
        type: "regex",
        enabled: true,
        explanation: "Block TypeScript",
        pattern: "typescript",
        source: "ai"
      }
    ];

    expect(applyProgrammaticRules(baseCandidate, rules)?.ruleId).toBe("regex");
  });

  it("does not apply disabled regex rules", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "regex",
        type: "regex",
        enabled: false,
        explanation: "Block TypeScript",
        pattern: "typescript",
        source: "ai"
      }
    ];

    expect(applyProgrammaticRules(baseCandidate, rules)).toBeNull();
  });

  it("exposes special duration markers for regex rules", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "duration-marker",
        type: "regex",
        enabled: true,
        explanation: "Block videos under 60 seconds",
        pattern: "§DURATION_LT_60",
        source: "ai"
      }
    ];

    expect(applyProgrammaticRules({ ...baseCandidate, durationSeconds: 59 }, rules)?.ruleId).toBe("duration-marker");
    expect(applyProgrammaticRules({ ...baseCandidate, durationSeconds: 60 }, rules)).toBeNull();
  });

  it("exposes greater-than duration markers for regex rules", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "long-video-marker",
        type: "regex",
        enabled: true,
        explanation: "Match videos at least 20 minutes long",
        pattern: "§DURATION_GTE_20_MIN",
        source: "ai"
      },
      {
        id: "strict-long-video-marker",
        type: "regex",
        enabled: true,
        explanation: "Match videos longer than 30 minutes",
        pattern: "§DURATION_GT_30_MIN",
        source: "ai"
      }
    ];

    expect(applyProgrammaticRules({ ...baseCandidate, durationSeconds: 20 * 60 }, rules)?.ruleId).toBe("long-video-marker");
    expect(applyProgrammaticRules({ ...baseCandidate, durationSeconds: 30 * 60 }, [rules[1]!])).toBeNull();
    expect(applyProgrammaticRules({ ...baseCandidate, durationSeconds: 31 * 60 }, [rules[1]!])?.ruleId).toBe(
      "strict-long-video-marker"
    );
  });

  it("does not throw on invalid regex patterns", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "bad-regex",
        type: "regex",
        enabled: true,
        explanation: "Broken",
        pattern: "[",
        source: "ai"
      }
    ];

    expect(applyProgrammaticRules(baseCandidate, rules)).toBeNull();
  });

  it("builds a stable text form with metadata markers", () => {
    const text = buildVideoRuleText({ ...baseCandidate, durationSeconds: 59, durationText: "0:59" });
    expect(text).toContain("§SITE=youtube");
    expect(text).toContain("§TITLE=Deep TypeScript Tutorial");
    expect(text).toContain("§DURATION_SECONDS=59");
    expect(text).toContain("§DURATION_MINUTES_FLOOR=0");
    expect(text).toContain("§DURATION_LT_60");

    const longText = buildVideoRuleText({ ...baseCandidate, durationSeconds: 30 * 60, durationText: "30:00" });
    expect(longText).toContain("§DURATION_GTE_20_MIN");
    expect(longText).toContain("§DURATION_GTE_30_MIN");
    expect(longText).not.toContain("§DURATION_GT_30_MIN");
  });
});
