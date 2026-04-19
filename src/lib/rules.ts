import type { CleanFeedRule, VideoCandidate } from "./types";

export type RuleMatch = {
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
): RuleMatch | null {
  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    if (rule.type === "keyword" && matchesKeywordRule(candidate, rule.value)) {
      return {
        ruleId: rule.id,
        reason: rule.label || `包含屏蔽词：${rule.value}`
      };
    }

    if (
      rule.type === "duration" &&
      typeof candidate.durationSeconds === "number" &&
      candidate.durationSeconds < rule.thresholdSeconds
    ) {
      return {
        ruleId: rule.id,
        reason: rule.label || `短于 ${formatDuration(rule.thresholdSeconds)}`
      };
    }
  }

  return null;
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

function matchesKeywordRule(candidate: VideoCandidate, value: string): boolean {
  const keywords = value
    .split(/[\n,，]/)
    .map((keyword) => normalizeText(keyword))
    .filter(Boolean);

  if (keywords.length === 0) {
    return false;
  }

  const haystack = normalizeText([candidate.title, candidate.channel || ""].join(" "));
  return keywords.some((keyword) => haystack.includes(keyword));
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
