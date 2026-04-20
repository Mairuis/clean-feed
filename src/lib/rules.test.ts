import { describe, expect, it } from "vitest";
import { applyProgrammaticRules, buildVideoRuleText, isShortDurationVideo, parseDuration } from "./rules";
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
        type: "block_regex",
        enabled: true,
        explanation: "Block TypeScript",
        pattern: "typescript",
        source: "ai"
      }
    ];

    expect(applyProgrammaticRules(baseCandidate, rules)?.ruleId).toBe("regex");
    expect(applyProgrammaticRules(baseCandidate, rules)?.action).toBe("block");
  });

  it("lets allow rules override block rules", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "block-clickbait",
        type: "block_regex",
        enabled: true,
        explanation: "Block attention bait",
        pattern: "clickbait",
        source: "ai"
      },
      {
        id: "allow-followed",
        type: "allow_regex",
        enabled: true,
        explanation: "Allow followed creators",
        pattern: "已关注|Subscribed",
        source: "ai"
      }
    ];

    expect(
      applyProgrammaticRules(
        {
          ...baseCandidate,
          title: "clickbait drama",
          channel: "Engineering Notes 已关注"
        },
        rules
      )
    ).toEqual({
      action: "allow",
      reason: "Allow followed creators",
      ruleId: "allow-followed"
    });
  });

  it("does not apply disabled regex rules", () => {
    const rules: CleanFeedRule[] = [
      {
        id: "regex",
        type: "block_regex",
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
        type: "block_regex",
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
        type: "block_regex",
        enabled: true,
        explanation: "Match videos at least 20 minutes long",
        pattern: "§DURATION_GTE_20_MIN",
        source: "ai"
      },
      {
        id: "strict-long-video-marker",
        type: "block_regex",
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
        type: "block_regex",
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

describe("isShortDurationVideo", () => {
  const candidate: VideoCandidate = {
    key: "k",
    site: "bilibili",
    url: "https://www.bilibili.com/video/BV1",
    title: "Short clip",
    channel: "UP",
    durationSeconds: 299
  };

  it("treats videos below the configured threshold as shorts", () => {
    expect(isShortDurationVideo(candidate, { enabled: true, thresholdSeconds: 300 })).toBe(true);
    expect(isShortDurationVideo({ ...candidate, durationSeconds: 300 }, { enabled: true, thresholdSeconds: 300 })).toBe(false);
  });

  it("does not hide unknown durations or disabled shorts", () => {
    const { durationSeconds: _durationSeconds, ...unknownDurationCandidate } = candidate;
    expect(isShortDurationVideo(unknownDurationCandidate, { enabled: true, thresholdSeconds: 300 })).toBe(false);
    expect(isShortDurationVideo(candidate, { enabled: false, thresholdSeconds: 300 })).toBe(false);
  });
});
