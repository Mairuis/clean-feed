"use strict";
(() => {
  // src/lib/rules.ts
  function activeRuleCount(rules) {
    return rules.filter((rule) => rule.enabled).length;
  }

  // src/lib/defaults.ts
  var DEFAULT_AI_BASE = "https://api.anthropic.com/v1";
  var DEFAULT_AI_MODEL = "claude-3-5-haiku-latest";
  var AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  var DEFAULT_USER_BRIEF = "\u5C4F\u853D\u77ED\u5E73\u5FEB\u3001\u6807\u9898\u515A\u3001\u4F4E\u8D28\u91CF\u5A31\u4E50\u516B\u5366\u3001\u91CD\u590D\u642C\u8FD0\u548C\u6D6A\u8D39\u6CE8\u610F\u529B\u7684\u5185\u5BB9\uFF1B\u4FDD\u7559\u957F\u89C6\u9891\u3001\u6559\u7A0B\u3001\u6DF1\u5EA6\u5206\u6790\u3001\u6280\u672F\u548C\u9AD8\u8D28\u91CF\u521B\u4F5C\u3002";
  var DEFAULT_REVIEWER_INSTRUCTION = "\u5224\u65AD\u89C6\u9891\u662F\u5426\u660E\u663E\u5C5E\u4E8E\u77ED\u5E73\u5FEB\u3001\u4F4E\u4FE1\u606F\u5BC6\u5EA6\u3001\u6807\u9898\u515A\u3001\u91CD\u590D\u642C\u8FD0\u6216\u6D6A\u8D39\u6CE8\u610F\u529B\u7684\u5185\u5BB9\u3002\u53EA\u6709\u660E\u663E\u4F4E\u8D28\u91CF\u624D\u8FD4\u56DE low_quality\uFF1B\u4E0D\u786E\u5B9A\u65F6\u8FD4\u56DE uncertain\u3002";
  var DEFAULT_SETTINGS = {
    enabled: true,
    rules: [
      {
        id: "default-short-video",
        type: "duration",
        enabled: true,
        label: "\u5C4F\u853D 60 \u79D2\u4EE5\u5185\u7684\u89C6\u9891",
        thresholdSeconds: 60,
        source: "default"
      }
    ],
    ai: {
      enabled: false,
      apiBase: DEFAULT_AI_BASE,
      model: DEFAULT_AI_MODEL,
      userBrief: DEFAULT_USER_BRIEF,
      generatedSummary: "\u9ED8\u8BA4\u914D\u7F6E\u4F1A\u5148\u5C4F\u853D 60 \u79D2\u4EE5\u5185\u7684\u89C6\u9891\u3002\u914D\u7F6E AI \u540E\uFF0C\u53EF\u4EE5\u7528\u4E00\u6BB5\u8BDD\u751F\u6210\u66F4\u8D34\u8FD1\u4F60\u504F\u597D\u7684\u89C4\u5219\u3002",
      reviewerInstruction: DEFAULT_REVIEWER_INSTRUCTION
    },
    feedback: {
      enabled: false,
      preferredAction: "not_interested",
      maxPerSession: 20
    }
  };
  var DEFAULT_AI_STATUS = {
    state: "idle",
    message: "AI \u5C1A\u672A\u8FDE\u63A5",
    updatedAt: (/* @__PURE__ */ new Date(0)).toISOString()
  };

  // src/lib/storage.ts
  var SETTINGS_KEY = "settings";
  var AI_STATUS_KEY = "aiStatus";
  async function getSettings() {
    const result = await storageGet(chrome.storage.sync, [SETTINGS_KEY]);
    return normalizeSettings(result.settings);
  }
  async function saveSettings(settings) {
    await storageSet(chrome.storage.sync, { [SETTINGS_KEY]: normalizeSettings(settings) });
  }
  async function getAiStatus() {
    const result = await storageGet(chrome.storage.local, [AI_STATUS_KEY]);
    return result.aiStatus || DEFAULT_AI_STATUS;
  }
  function normalizeSettings(input) {
    const merged = {
      ...DEFAULT_SETTINGS,
      ...input || {},
      ai: {
        ...DEFAULT_SETTINGS.ai,
        ...input?.ai || {}
      },
      feedback: {
        ...DEFAULT_SETTINGS.feedback,
        ...input?.feedback || {}
      }
    };
    const migratedRules = Array.isArray(input?.rules) ? input.rules : migrateLegacyKeywordRules(input?.blockedKeywords);
    const normalized = {
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
        enabled: merged.feedback.enabled === true,
        preferredAction: merged.feedback.preferredAction === "dislike" ? "dislike" : DEFAULT_SETTINGS.feedback.preferredAction,
        maxPerSession: normalizeMaxPerSession(merged.feedback.maxPerSession)
      }
    };
    if (merged.ai.generatedAt) {
      normalized.ai.generatedAt = merged.ai.generatedAt;
    }
    return normalized;
  }
  function normalizeMaxPerSession(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_SETTINGS.feedback.maxPerSession;
    }
    return Math.min(100, Math.max(1, Math.floor(parsed)));
  }
  function migrateLegacyKeywordRules(blockedKeywords) {
    const keywords = String(blockedKeywords || "").split(/[\n,，]/).map((keyword) => keyword.trim()).filter(Boolean);
    if (keywords.length === 0) {
      return [];
    }
    return keywords.map((keyword, index) => ({
      id: `legacy-keyword-${index}`,
      type: "keyword",
      enabled: true,
      label: `\u5C4F\u853D\u5305\u542B\u300C${keyword}\u300D\u7684\u5185\u5BB9`,
      value: keyword,
      source: "ai"
    }));
  }
  function storageGet(area, keys) {
    return new Promise((resolve) => {
      area.get(keys, (items) => resolve(items));
    });
  }
  function storageSet(area, items) {
    return new Promise((resolve) => {
      area.set(items, () => resolve());
    });
  }

  // src/popup.ts
  var enabledInput = document.querySelector("#enabled");
  var enabledLabel = document.querySelector("#enabled-label");
  var rulesCount = document.querySelector("#rules-count");
  var aiState = document.querySelector("#ai-state");
  var statusElement = document.querySelector("#status");
  var openOptionsButton = document.querySelector("#open-options");
  void init();
  async function init() {
    await render();
    enabledInput?.addEventListener("change", async () => {
      const settings = await getSettings();
      await saveSettings({
        ...settings,
        enabled: enabledInput.checked
      });
      setStatus(enabledInput.checked ? "Clean Feed \u5DF2\u542F\u7528" : "Clean Feed \u5DF2\u6682\u505C");
      await render();
    });
    openOptionsButton?.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
    chrome.storage.onChanged.addListener(() => {
      void render();
    });
  }
  async function render() {
    const [settings, aiStatus] = await Promise.all([getSettings(), getAiStatus()]);
    if (enabledInput) {
      enabledInput.checked = settings.enabled;
    }
    if (enabledLabel) {
      enabledLabel.textContent = settings.enabled ? "\u6B63\u5728\u8FC7\u6EE4 YouTube \u548C Bilibili" : "\u5DF2\u6682\u505C";
    }
    if (rulesCount) {
      rulesCount.textContent = `${activeRuleCount(settings.rules)} \u6761\u542F\u7528`;
    }
    if (aiState) {
      aiState.textContent = settings.ai.enabled ? aiStatus.message : "\u672A\u542F\u7528";
    }
    setStatus(settings.ai.generatedSummary);
  }
  function setStatus(message) {
    if (statusElement) {
      statusElement.textContent = message;
    }
  }
})();
//# sourceMappingURL=popup.js.map
