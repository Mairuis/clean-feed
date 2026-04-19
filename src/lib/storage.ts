import { DEFAULT_AI_STATUS, DEFAULT_SETTINGS } from "./defaults";
import type { AiCacheEntry, AiStatus, CleanFeedSecrets, CleanFeedSettings } from "./types";

const SETTINGS_KEY = "settings";
const SECRETS_KEY = "secrets";
const AI_STATUS_KEY = "aiStatus";
const AI_CACHE_KEY = "aiCache";

type StoredShape = {
  settings?: Partial<CleanFeedSettings> & {
    blockedKeywords?: string;
    enabled?: boolean;
  };
  secrets?: CleanFeedSecrets;
  aiStatus?: AiStatus;
  aiCache?: Record<string, AiCacheEntry>;
};

export async function getSettings(): Promise<CleanFeedSettings> {
  const result = await storageGet<StoredShape>(chrome.storage.sync, [SETTINGS_KEY]);
  return normalizeSettings(result.settings);
}

export async function saveSettings(settings: CleanFeedSettings): Promise<void> {
  await storageSet(chrome.storage.sync, { [SETTINGS_KEY]: normalizeSettings(settings) });
}

export async function getSecrets(): Promise<CleanFeedSecrets> {
  const result = await storageGet<StoredShape>(chrome.storage.local, [SECRETS_KEY]);
  return result.secrets || {};
}

export async function saveAiApiKey(aiApiKey: string): Promise<void> {
  const secrets = await getSecrets();
  await storageSet(chrome.storage.local, {
    [SECRETS_KEY]: {
      ...secrets,
      aiApiKey
    }
  });
}

export async function getAiStatus(): Promise<AiStatus> {
  const result = await storageGet<StoredShape>(chrome.storage.local, [AI_STATUS_KEY]);
  return result.aiStatus || DEFAULT_AI_STATUS;
}

export async function setAiStatus(status: Omit<AiStatus, "updatedAt">): Promise<void> {
  await storageSet(chrome.storage.local, {
    [AI_STATUS_KEY]: {
      ...status,
      updatedAt: new Date().toISOString()
    }
  });
}

export async function getAiCache(): Promise<Record<string, AiCacheEntry>> {
  const result = await storageGet<StoredShape>(chrome.storage.local, [AI_CACHE_KEY]);
  return result.aiCache || {};
}

export async function saveAiCache(cache: Record<string, AiCacheEntry>): Promise<void> {
  await storageSet(chrome.storage.local, { [AI_CACHE_KEY]: cache });
}

export function normalizeSettings(input?: StoredShape["settings"]): CleanFeedSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(input || {}),
    ai: {
      ...DEFAULT_SETTINGS.ai,
      ...(input?.ai || {})
    },
    feedback: {
      ...DEFAULT_SETTINGS.feedback,
      ...(input?.feedback || {})
    }
  };

  const migratedRules = Array.isArray(input?.rules)
    ? input.rules
    : migrateLegacyKeywordRules(input?.blockedKeywords);

  const normalized: CleanFeedSettings = {
    enabled: merged.enabled !== false,
    rules: migratedRules.length > 0 ? migratedRules : DEFAULT_SETTINGS.rules,
    ai: {
      enabled: merged.ai.enabled === true,
      apiBase: String(merged.ai.apiBase || DEFAULT_SETTINGS.ai.apiBase),
      model: String(merged.ai.model || DEFAULT_SETTINGS.ai.model),
      userBrief: String(merged.ai.userBrief || DEFAULT_SETTINGS.ai.userBrief),
      generatedSummary: String(merged.ai.generatedSummary || DEFAULT_SETTINGS.ai.generatedSummary),
      reviewerInstruction: String(merged.ai.reviewerInstruction || DEFAULT_SETTINGS.ai.reviewerInstruction)
    },
    feedback: {
      enabled: true,
      preferredAction:
        merged.feedback.preferredAction === "dislike" ? "dislike" : DEFAULT_SETTINGS.feedback.preferredAction,
      maxPerSession: normalizeMaxPerSession(merged.feedback.maxPerSession)
    }
  };

  if (merged.ai.generatedAt) {
    normalized.ai.generatedAt = merged.ai.generatedAt;
  }

  return normalized;
}

function normalizeMaxPerSession(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.feedback.maxPerSession;
  }

  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

function migrateLegacyKeywordRules(blockedKeywords: string | undefined): CleanFeedSettings["rules"] {
  const keywords = String(blockedKeywords || "")
    .split(/[\n,，]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (keywords.length === 0) {
    return [];
  }

  return keywords.map((keyword, index) => ({
    id: `legacy-keyword-${index}`,
    type: "keyword" as const,
    enabled: true,
    label: `屏蔽包含「${keyword}」的内容`,
    value: keyword,
    source: "ai" as const
  }));
}

function storageGet<T>(area: chrome.storage.StorageArea, keys: string[]): Promise<T> {
  return new Promise((resolve) => {
    area.get(keys, (items) => resolve(items as T));
  });
}

function storageSet(area: chrome.storage.StorageArea, items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    area.set(items, () => resolve());
  });
}
