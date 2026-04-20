import { DEFAULT_AI_STATUS, DEFAULT_SETTINGS, DEFAULT_SHORTS_THRESHOLD_SECONDS } from "./defaults";
import { trimAiAuditLog } from "./cost";
import type { AiAuditLogEntry, AiCacheEntry, AiStatus, CleanFeedSecrets, CleanFeedSettings, CleanFeedUiState } from "./types";

const SETTINGS_KEY = "settings";
const SECRETS_KEY = "secrets";
const AI_STATUS_KEY = "aiStatus";
const AI_CACHE_KEY = "aiCache";
const AI_AUDIT_LOG_KEY = "aiAuditLog";
const UI_STATE_KEY = "uiState";

type StoredShape = {
  settings?: Partial<CleanFeedSettings> & {
    blockedKeywords?: string;
    enabled?: boolean;
  };
  secrets?: CleanFeedSecrets;
  aiStatus?: AiStatus;
  aiCache?: Record<string, AiCacheEntry>;
  aiAuditLog?: AiAuditLogEntry[];
  uiState?: Partial<CleanFeedUiState>;
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

export async function getAiAuditLog(): Promise<AiAuditLogEntry[]> {
  const result = await storageGet<StoredShape>(chrome.storage.local, [AI_AUDIT_LOG_KEY]);
  return Array.isArray(result.aiAuditLog) ? trimAiAuditLog(result.aiAuditLog) : [];
}

export async function appendAiAuditLog(entry: AiAuditLogEntry): Promise<void> {
  const log = await getAiAuditLog();
  await storageSet(chrome.storage.local, {
    [AI_AUDIT_LOG_KEY]: trimAiAuditLog([entry, ...log])
  });
}

export async function getUiState(): Promise<CleanFeedUiState> {
  const result = await storageGet<StoredShape>(chrome.storage.local, [UI_STATE_KEY]);

  return {
    onboardingDone: result.uiState?.onboardingDone === true
  };
}

export async function saveUiState(uiState: CleanFeedUiState): Promise<void> {
  await storageSet(chrome.storage.local, { [UI_STATE_KEY]: uiState });
}

export function normalizeSettings(input?: StoredShape["settings"]): CleanFeedSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(input || {}),
    ai: {
      ...DEFAULT_SETTINGS.ai,
      ...(input?.ai || {})
    },
    shorts: {
      ...DEFAULT_SETTINGS.shorts,
      ...(input?.shorts || {})
    },
    feedback: {
      ...DEFAULT_SETTINGS.feedback,
      ...(input?.feedback || {})
    }
  };

  const migratedRules = Array.isArray(input?.rules)
    ? normalizeStoredRules(input.rules as unknown[])
    : migrateLegacyKeywordRules(input?.blockedKeywords);

  const normalized: CleanFeedSettings = {
    enabled: merged.enabled !== false,
    rules: migratedRules.length > 0 ? migratedRules : DEFAULT_SETTINGS.rules,
    shorts: {
      enabled: merged.shorts.enabled !== false,
      thresholdSeconds: normalizeShortsThreshold(merged.shorts.thresholdSeconds)
    },
    ai: {
      enabled: merged.ai.enabled === true,
      apiBase: String(merged.ai.apiBase || DEFAULT_SETTINGS.ai.apiBase),
      model: String(merged.ai.model || DEFAULT_SETTINGS.ai.model),
      userBrief: String(merged.ai.userBrief || DEFAULT_SETTINGS.ai.userBrief),
      generatedSummary: String(merged.ai.generatedSummary || DEFAULT_SETTINGS.ai.generatedSummary),
      reviewerInstruction: String(merged.ai.reviewerInstruction || DEFAULT_SETTINGS.ai.reviewerInstruction)
    },
    feedback: {
      enabled: merged.feedback.enabled !== false,
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

function normalizeStoredRules(rules: unknown[]): CleanFeedSettings["rules"] {
  return rules
    .map((rule, index) => {
      const item = rule as Record<string, unknown>;
      const id = String(item.id || `rule-${index}`);
      const enabled = item.enabled !== false;
      const source = item.source === "default" ? "default" : "ai";
      const type = item.type === "allow_regex" ? "allow_regex" : item.type === "block_regex" ? "block_regex" : "regex";

      if (item.type === "regex" || item.type === "allow_regex" || item.type === "block_regex") {
        const pattern = String(item.pattern || "").trim();
        if (!pattern) {
          return null;
        }

        return {
          id,
          type,
          enabled,
          explanation: String(item.explanation || "正则规则"),
          pattern,
          source
        };
      }

      if (item.type === "keyword") {
        const value = String(item.value || "").trim();
        if (!value) {
          return null;
        }

        return {
          id,
          type: "block_regex" as const,
          enabled,
          explanation: String(item.label || `屏蔽包含「${value}」的内容`),
          pattern: value
            .split(/[\n,，]/)
            .map((keyword) => escapeRegex(keyword.trim()))
            .filter(Boolean)
            .join("|"),
          source
        };
      }

      if (item.type === "duration") {
        const threshold = Number(item.thresholdSeconds);
        const marker = threshold <= 60 ? "§DURATION_LT_60" : threshold <= 90 ? "§DURATION_LT_90" : threshold <= 180 ? "§DURATION_LT_180" : "§DURATION_LT_300";

        return {
          id,
          type: "block_regex" as const,
          enabled,
          explanation: String(item.label || `屏蔽短于 ${threshold || 300} 秒的视频`),
          pattern: marker,
          source
        };
      }

      return null;
    })
    .filter((rule): rule is CleanFeedSettings["rules"][number] => Boolean(rule));
}

function normalizeMaxPerSession(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.feedback.maxPerSession;
  }

  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

function normalizeShortsThreshold(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SHORTS_THRESHOLD_SECONDS;
  }

  return Math.min(60 * 60, Math.max(30, Math.floor(parsed)));
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
    type: "block_regex" as const,
    enabled: true,
    explanation: `屏蔽包含「${keyword}」的内容`,
    pattern: escapeRegex(keyword),
    source: "ai" as const
  }));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
