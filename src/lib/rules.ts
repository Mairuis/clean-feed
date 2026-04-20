import type { CleanFeedRule, ShortsSettings, VideoCandidate } from "./types";

const DURATION_MINUTE_THRESHOLDS = [1, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120];

export type RuleMatch = {
  ruleId: string;
  reason: string;
};

export type RuleDecision =
  | {
      action: "allow";
      ruleId: string;
      reason: string;
    }
  | {
      action: "block";
      ruleId: string;
      reason: string;
    };

export function parseDuration(value: string | undefined | null): number | undefined {
  const text = String(value || "").trim();
  if (!text) {
    return undefined;
  }

  const match = text.match(/(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?/);
  if (!match) {
    return undefined;
  }

  const parts = match[0].split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return undefined;
  }

  if (parts.length === 1) {
    return parts[0] ?? undefined;
  }

  if (parts.length === 2) {
    const minutes = parts[0];
    const seconds = parts[1];
    return minutes === undefined || seconds === undefined ? undefined : minutes * 60 + seconds;
  }

  const hours = parts[0];
  const minutes = parts[1];
  const seconds = parts[2];
  return hours === undefined || minutes === undefined || seconds === undefined
    ? undefined
    : hours * 3600 + minutes * 60 + seconds;
}

export function applyProgrammaticRules(
  candidate: VideoCandidate,
  rules: CleanFeedRule[]
): RuleDecision | null {
  const ruleText = buildVideoRuleText(candidate);
  const enabledRules = rules.filter((rule) => rule.enabled);

  for (const rule of enabledRules) {
    if (!isAllowRule(rule)) {
      continue;
    }
    if (matchesRegexRule(ruleText, rule.pattern)) {
      return {
        action: "allow",
        ruleId: rule.id,
        reason: rule.explanation || `Regex: ${rule.pattern}`
      };
    }
  }

  for (const rule of enabledRules) {
    if (isAllowRule(rule)) {
      continue;
    }
    if (matchesRegexRule(ruleText, rule.pattern)) {
      return {
        action: "block",
        ruleId: rule.id,
        reason: rule.explanation || `Regex: ${rule.pattern}`
      };
    }
  }

  return null;
}

export function isAllowRule(rule: CleanFeedRule): boolean {
  return rule.type === "allow_regex";
}

export function isShortDurationVideo(candidate: VideoCandidate, shorts: ShortsSettings): boolean {
  return shorts.enabled && candidate.durationSeconds !== undefined && candidate.durationSeconds < shorts.thresholdSeconds;
}

export function activeRuleCount(rules: CleanFeedRule[]): number {
  return rules.filter((rule) => rule.enabled).length;
}

export function createVideoCacheKey(candidate: Omit<VideoCandidate, "key">): string {
  const base = [
    candidate.site,
    normalizeUrl(candidate.url),
    normalizeText(candidate.title),
    normalizeText(candidate.channel || ""),
    String(candidate.durationSeconds ?? candidate.durationText ?? "")
  ].join("|");

  return `${candidate.site}:${hashString(base)}`;
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function buildVideoRuleText(candidate: VideoCandidate): string {
  const durationSeconds = candidate.durationSeconds;
  const durationText = candidate.durationText || (durationSeconds === undefined ? "" : formatDuration(durationSeconds));
  const durationMarkers =
    durationSeconds === undefined
      ? ["§DURATION_UNKNOWN"]
      : [
          `§DURATION=${durationText}`,
          `§DURATION_SECONDS=${durationSeconds}`,
          `§DURATION_MINUTES_FLOOR=${Math.floor(durationSeconds / 60)}`,
          durationSeconds < 60 ? "§DURATION_LT_60" : "",
          durationSeconds < 90 ? "§DURATION_LT_90" : "",
          durationSeconds < 180 ? "§DURATION_LT_180" : "",
          durationSeconds < 300 ? "§DURATION_LT_300" : "",
          ...buildGreaterThanDurationMarkers(durationSeconds)
        ].filter(Boolean);

  return [
    `§SITE=${candidate.site}`,
    `§TITLE=${candidate.title}`,
    `§CHANNEL=${candidate.channel || ""}`,
    `§URL=${candidate.url}`,
    ...durationMarkers,
    `§TEXT=${[candidate.title, candidate.channel || "", durationText].filter(Boolean).join(" ")}`
  ].join("\n");
}

function buildGreaterThanDurationMarkers(durationSeconds: number): string[] {
  return DURATION_MINUTE_THRESHOLDS.flatMap((minutes) => {
    const thresholdSeconds = minutes * 60;
    const markers: string[] = [];

    if (durationSeconds >= thresholdSeconds) {
      markers.push(`§DURATION_GTE_${minutes}_MIN`);
    }

    if (durationSeconds > thresholdSeconds) {
      markers.push(`§DURATION_GT_${minutes}_MIN`);
    }

    return markers;
  });
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const hourMinutes = minutes % 60;
    return `${hours}:${String(hourMinutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function matchesRegexRule(value: string, pattern: string): boolean {
  if (!pattern.trim()) {
    return false;
  }

  try {
    return new RegExp(pattern, "iu").test(value);
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value, "https://example.com");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function hashString(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}
