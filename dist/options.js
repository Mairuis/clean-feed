"use strict";
(() => {
  // src/lib/provider.ts
  function getOptionalPermissionOrigin(apiBase2) {
    const url = parseApiBase(apiBase2);
    return `${url.protocol}//${url.host}/*`;
  }
  function parseApiBase(apiBase2) {
    const url = new URL(apiBase2);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("API Base must start with http:// or https://");
    }
    return url;
  }

  // src/lib/rules.ts
  function activeRuleCount(rules) {
    return rules.filter((rule) => rule.enabled).length;
  }
  function formatDuration(seconds) {
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
  var SECRETS_KEY = "secrets";
  var AI_STATUS_KEY = "aiStatus";
  async function getSettings() {
    const result = await storageGet(chrome.storage.sync, [SETTINGS_KEY]);
    return normalizeSettings(result.settings);
  }
  async function saveSettings(settings) {
    await storageSet(chrome.storage.sync, { [SETTINGS_KEY]: normalizeSettings(settings) });
  }
  async function getSecrets() {
    const result = await storageGet(chrome.storage.local, [SECRETS_KEY]);
    return result.secrets || {};
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

  // src/options.ts
  var aiEnabled = document.querySelector("#aiEnabled");
  var apiBase = document.querySelector("#apiBase");
  var apiKey = document.querySelector("#apiKey");
  var model = document.querySelector("#model");
  var feedbackEnabled = document.querySelector("#feedbackEnabled");
  var feedbackAction = document.querySelector("#feedbackAction");
  var userBrief = document.querySelector("#userBrief");
  var saveAiButton = document.querySelector("#saveAi");
  var testAiButton = document.querySelector("#testAi");
  var saveFeedbackButton = document.querySelector("#saveFeedback");
  var generateConfigButton = document.querySelector("#generateConfig");
  var generatedSummary = document.querySelector("#generatedSummary");
  var rulesView = document.querySelector("#rulesView");
  var reviewerView = document.querySelector("#reviewerView");
  var statusElement = document.querySelector("#status");
  void init();
  async function init() {
    await render();
    saveAiButton?.addEventListener("click", async () => {
      await saveAiConfigFromForm();
    });
    testAiButton?.addEventListener("click", async () => {
      await saveAiConfigFromForm();
      await sendBackgroundMessage({ type: "cleanfeed:test-ai" });
      await render();
    });
    saveFeedbackButton?.addEventListener("click", async () => {
      await saveFeedbackConfigFromForm();
      await render();
    });
    generateConfigButton?.addEventListener("click", async () => {
      await saveAiConfigFromForm();
      const brief = userBrief?.value.trim() || "";
      await sendBackgroundMessage({ type: "cleanfeed:generate-config", brief });
      await render();
    });
  }
  async function render() {
    const [settings, secrets, aiStatus] = await Promise.all([getSettings(), getSecrets(), getAiStatus()]);
    if (aiEnabled) {
      aiEnabled.checked = settings.ai.enabled;
    }
    if (apiBase) {
      apiBase.value = settings.ai.apiBase;
    }
    if (model) {
      model.value = settings.ai.model;
    }
    if (apiKey) {
      apiKey.value = "";
      apiKey.placeholder = secrets.aiApiKey ? "\u5DF2\u4FDD\u5B58\uFF0C\u7559\u7A7A\u5219\u7EE7\u7EED\u4F7F\u7528\u5F53\u524D Key" : "sk-...";
    }
    if (feedbackEnabled) {
      feedbackEnabled.checked = settings.feedback.enabled;
    }
    if (feedbackAction) {
      feedbackAction.value = settings.feedback.preferredAction;
    }
    if (userBrief) {
      userBrief.value = settings.ai.userBrief;
    }
    renderGeneratedConfig(settings);
    setStatus(`${aiStatus.message} \xB7 ${activeRuleCount(settings.rules)} \u6761\u7A0B\u5E8F\u5316\u89C4\u5219\u542F\u7528`);
  }
  async function saveAiConfigFromForm() {
    const current = await getSettings();
    const nextAi = {
      ...current.ai,
      enabled: aiEnabled?.checked === true,
      apiBase: apiBase?.value.trim() || current.ai.apiBase,
      model: model?.value.trim() || current.ai.model,
      userBrief: userBrief?.value.trim() || current.ai.userBrief
    };
    const nextApiKey = apiKey?.value.trim() || void 0;
    await requestApiBasePermission(nextAi.apiBase);
    await sendBackgroundMessage({
      type: "cleanfeed:save-ai-config",
      ai: nextAi,
      apiKey: nextApiKey
    });
    setStatus("AI \u8FDE\u63A5\u914D\u7F6E\u5DF2\u4FDD\u5B58");
  }
  async function saveFeedbackConfigFromForm() {
    const current = await getSettings();
    await saveSettings({
      ...current,
      feedback: {
        ...current.feedback,
        enabled: feedbackEnabled?.checked === true,
        preferredAction: feedbackAction?.value === "dislike" ? "dislike" : "not_interested"
      }
    });
    setStatus(feedbackEnabled?.checked ? "\u5E73\u53F0\u53CD\u9988\u5DF2\u542F\u7528" : "\u5E73\u53F0\u53CD\u9988\u5DF2\u5173\u95ED");
  }
  async function requestApiBasePermission(base) {
    const origin = getOptionalPermissionOrigin(base);
    await new Promise((resolve, reject) => {
      chrome.permissions.request({ origins: [origin] }, (granted) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!granted) {
          reject(new Error("\u9700\u8981\u6388\u6743 API Base \u8BBF\u95EE\u6743\u9650\u540E\u624D\u80FD\u8C03\u7528 AI"));
          return;
        }
        resolve();
      });
    });
  }
  function renderGeneratedConfig(settings) {
    if (generatedSummary) {
      generatedSummary.textContent = settings.ai.generatedSummary;
    }
    if (rulesView) {
      rulesView.replaceChildren(
        ...settings.rules.map((rule) => {
          const element = document.createElement("div");
          element.className = "rule-card";
          const title = document.createElement("strong");
          title.textContent = rule.label;
          const detail = document.createElement("span");
          detail.textContent = rule.type === "keyword" ? `\u5C4F\u853D\u8BCD\uFF1A${rule.value}` : `\u77ED\u4E8E ${formatDuration(rule.thresholdSeconds)} \u7684\u89C6\u9891`;
          element.append(title, detail);
          return element;
        })
      );
    }
    if (reviewerView) {
      reviewerView.textContent = settings.ai.reviewerInstruction;
    }
  }
  async function sendBackgroundMessage(message) {
    setBusy(true);
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (!response?.ok) {
        throw new Error(response?.error || "Clean Feed background request failed");
      }
      return response.payload;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      setStatus(messageText);
      throw error;
    } finally {
      setBusy(false);
    }
  }
  function setBusy(isBusy) {
    [saveAiButton, testAiButton, saveFeedbackButton, generateConfigButton].forEach((button) => {
      if (button) {
        button.disabled = isBusy;
      }
    });
  }
  function setStatus(message) {
    if (statusElement) {
      statusElement.textContent = message;
    }
  }
})();
//# sourceMappingURL=options.js.map
