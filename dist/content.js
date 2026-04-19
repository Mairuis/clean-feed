"use strict";
(() => {
  // src/lib/rules.ts
  function parseDuration(value) {
    const text = String(value || "").trim();
    if (!text) {
      return void 0;
    }
    const match = text.match(/(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?/);
    if (!match) {
      return void 0;
    }
    const parts = match[0].split(":").map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) {
      return void 0;
    }
    if (parts.length === 1) {
      return parts[0] ?? void 0;
    }
    if (parts.length === 2) {
      const minutes2 = parts[0];
      const seconds2 = parts[1];
      return minutes2 === void 0 || seconds2 === void 0 ? void 0 : minutes2 * 60 + seconds2;
    }
    const hours = parts[0];
    const minutes = parts[1];
    const seconds = parts[2];
    return hours === void 0 || minutes === void 0 || seconds === void 0 ? void 0 : hours * 3600 + minutes * 60 + seconds;
  }
  function applyProgrammaticRules(candidate, rules) {
    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }
      if (rule.type === "keyword" && matchesKeywordRule(candidate, rule.value)) {
        return {
          ruleId: rule.id,
          reason: rule.label || `\u5305\u542B\u5C4F\u853D\u8BCD\uFF1A${rule.value}`
        };
      }
      if (rule.type === "duration" && typeof candidate.durationSeconds === "number" && candidate.durationSeconds < rule.thresholdSeconds) {
        return {
          ruleId: rule.id,
          reason: rule.label || `\u77ED\u4E8E ${formatDuration(rule.thresholdSeconds)}`
        };
      }
    }
    return null;
  }
  function createVideoCacheKey(candidate) {
    const base = [
      candidate.site,
      normalizeUrl(candidate.url),
      normalizeText(candidate.title),
      normalizeText(candidate.channel || ""),
      String(candidate.durationSeconds ?? candidate.durationText ?? "")
    ].join("|");
    return `${candidate.site}:${hashString(base)}`;
  }
  function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim().toLowerCase();
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
  function matchesKeywordRule(candidate, value) {
    const keywords = value.split(/[\n,，]/).map((keyword) => normalizeText(keyword)).filter(Boolean);
    if (keywords.length === 0) {
      return false;
    }
    const haystack = normalizeText([candidate.title, candidate.channel || ""].join(" "));
    return keywords.some((keyword) => haystack.includes(keyword));
  }
  function normalizeUrl(value) {
    try {
      const url = new URL(value, "https://example.com");
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return value;
    }
  }
  function hashString(value) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = hash * 33 ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
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
  async function getSettings() {
    const result = await storageGet(chrome.storage.sync, [SETTINGS_KEY]);
    return normalizeSettings(result.settings);
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

  // src/content.ts
  var YOUTUBE_VIDEO_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-compact-video-renderer",
    "ytm-rich-item-renderer",
    "ytm-video-with-context-renderer"
  ].join(",");
  var BILIBILI_VIDEO_SELECTOR = [
    ".bili-video-card",
    ".bili-video-card__wrap",
    ".feed-card",
    ".video-card",
    ".video-list-item",
    ".rank-item"
  ].join(",");
  var settings = null;
  var observer = null;
  var scanQueued = false;
  var lastUrl = location.href;
  var aiQueue = /* @__PURE__ */ new Map();
  var pendingAiKeys = /* @__PURE__ */ new Set();
  var aiResults = /* @__PURE__ */ new Map();
  var aiFlushTimer;
  var feedbackQueue = [];
  var feedbackQueuedKeys = /* @__PURE__ */ new Set();
  var feedbackAttemptedKeys = /* @__PURE__ */ new Set();
  var feedbackAttempts = 0;
  var feedbackInProgress = false;
  void bootstrap();
  async function bootstrap() {
    settings = await getSettings();
    applyRootClasses();
    scanPage();
    observePage();
    listenForSettings();
    listenForNavigation();
  }
  function listenForSettings() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !changes.settings) {
        return;
      }
      void getSettings().then((nextSettings) => {
        settings = nextSettings;
        if (!settings.feedback.enabled) {
          feedbackQueue = [];
          feedbackQueuedKeys.clear();
        }
        resetHiddenElements();
        applyRootClasses();
        scanPage();
      });
    });
  }
  function listenForNavigation() {
    document.addEventListener("yt-navigate-finish", handleUrlChange, true);
    window.addEventListener("popstate", handleUrlChange, true);
    const pushState = history.pushState;
    const replaceState = history.replaceState;
    history.pushState = function patchedPushState(...args) {
      const result = pushState.apply(this, args);
      handleUrlChange();
      return result;
    };
    history.replaceState = function patchedReplaceState(...args) {
      const result = replaceState.apply(this, args);
      handleUrlChange();
      return result;
    };
    window.setInterval(() => {
      if (location.href !== lastUrl) {
        handleUrlChange();
      }
    }, 750);
  }
  function handleUrlChange() {
    lastUrl = location.href;
    window.setTimeout(() => {
      resetHiddenElements();
      scanPage();
    }, 0);
  }
  function observePage() {
    if (observer || !document.documentElement) {
      return;
    }
    observer = new MutationObserver(queueScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
  function queueScan() {
    if (scanQueued) {
      return;
    }
    scanQueued = true;
    window.requestAnimationFrame(() => {
      scanQueued = false;
      scanPage();
    });
  }
  function scanPage() {
    if (!settings || !document.documentElement) {
      return;
    }
    applyRootClasses();
    if (!settings.enabled) {
      resetHiddenElements();
      return;
    }
    if (location.pathname.startsWith("/shorts")) {
      location.replace("/feed/subscriptions");
      return;
    }
    const cards = collectCandidates();
    queueAiReview(cards.map((card) => card.candidate));
    cards.forEach(({ element, candidate }) => {
      if (isYouTubeShortsElement(element)) {
        hideElement(element, candidate, "platform-shorts", "Shorts");
        return;
      }
      const match = applyProgrammaticRules(candidate, settings?.rules || []);
      if (match) {
        hideElement(element, candidate, "rule", match.reason);
        return;
      }
      const aiResult = aiResults.get(candidate.key);
      if (aiResult?.verdict === "low_quality") {
        hideElement(element, candidate, "ai", aiResult.reason);
      }
    });
  }
  function collectCandidates() {
    const site = detectSite();
    if (site === "youtube") {
      return collectFromSelector(YOUTUBE_VIDEO_SELECTOR, extractYouTubeCandidate);
    }
    if (site === "bilibili") {
      return collectFromSelector(BILIBILI_VIDEO_SELECTOR, extractBilibiliCandidate);
    }
    return [];
  }
  function collectFromSelector(selector, extractor) {
    const seen = /* @__PURE__ */ new Set();
    const cards = [];
    document.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const extracted = extractor(node);
      if (!extracted || !extracted.title.trim() || !extracted.url) {
        return;
      }
      const key = createVideoCacheKey(extracted);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      cards.push({
        element: node,
        candidate: {
          ...extracted,
          key
        }
      });
    });
    return cards;
  }
  function extractYouTubeCandidate(element) {
    const link = element.querySelector(
      'a#video-title-link,a#video-title,a[href^="/watch"],a[href^="/shorts"]'
    );
    const titleElement = element.querySelector("#video-title,#video-title-link,h3");
    const durationElement = element.querySelector(
      "ytd-thumbnail-overlay-time-status-renderer,.ytd-thumbnail-overlay-time-status-renderer,span[aria-label*='minute'],span[aria-label*='\u5206\u949F']"
    );
    const channelElement = element.querySelector(
      "#channel-name,ytd-channel-name,ytm-badge-and-byline-renderer"
    );
    const title = cleanText(titleElement?.textContent || link?.getAttribute("title") || link?.textContent || "");
    const durationText = cleanText(durationElement?.textContent || durationElement?.getAttribute("aria-label") || "");
    const durationSeconds = parseDuration(durationText);
    if (!link || !title) {
      return null;
    }
    return {
      site: "youtube",
      url: new URL(link.getAttribute("href") || "", location.origin).toString(),
      title,
      channel: cleanText(channelElement?.textContent || ""),
      durationText,
      ...durationSeconds !== void 0 ? { durationSeconds } : {}
    };
  }
  function extractBilibiliCandidate(element) {
    const link = element.querySelector('a[href*="/video/BV"],a[href*="bilibili.com/video/BV"]');
    const titleElement = element.querySelector(
      ".bili-video-card__info--tit,.video-name,.title,.rank-title,a[title]"
    );
    const durationElement = element.querySelector(
      ".bili-video-card__stats__duration,.duration,.length,.time"
    );
    const channelElement = element.querySelector(
      ".bili-video-card__info--author,.up-name,.name,.author"
    );
    const title = cleanText(
      titleElement?.getAttribute("title") || titleElement?.textContent || link?.getAttribute("title") || ""
    );
    const durationText = cleanText(durationElement?.textContent || "");
    const durationSeconds = parseDuration(durationText);
    if (!link || !title) {
      return null;
    }
    return {
      site: "bilibili",
      url: new URL(link.getAttribute("href") || "", location.origin).toString(),
      title,
      channel: cleanText(channelElement?.textContent || ""),
      durationText,
      ...durationSeconds !== void 0 ? { durationSeconds } : {}
    };
  }
  function queueAiReview(candidates) {
    if (!settings?.enabled || !settings.ai.enabled || candidates.length === 0) {
      return;
    }
    candidates.forEach((candidate) => {
      if (!pendingAiKeys.has(candidate.key) && !aiResults.has(candidate.key)) {
        aiQueue.set(candidate.key, candidate);
      }
    });
    if (aiQueue.size === 0 || aiFlushTimer !== void 0) {
      return;
    }
    aiFlushTimer = window.setTimeout(flushAiQueue, 350);
  }
  async function flushAiQueue() {
    aiFlushTimer = void 0;
    const batch = [...aiQueue.values()].slice(0, 8);
    batch.forEach((candidate) => {
      aiQueue.delete(candidate.key);
      pendingAiKeys.add(candidate.key);
    });
    if (batch.length === 0) {
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: "cleanfeed:analyze-videos",
        candidates: batch
      });
      if (response?.ok && Array.isArray(response.payload?.results)) {
        response.payload.results.forEach((result) => {
          aiResults.set(result.key, result);
        });
        scanPage();
      }
    } catch {
    } finally {
      batch.forEach((candidate) => pendingAiKeys.delete(candidate.key));
    }
    if (aiQueue.size > 0) {
      aiFlushTimer = window.setTimeout(flushAiQueue, 700);
    }
  }
  function applyRootClasses() {
    const root = document.documentElement;
    if (!root || !settings) {
      return;
    }
    root.classList.toggle("cleanfeed-enabled", settings.enabled);
    root.classList.toggle("cleanfeed-hide-shorts", settings.enabled);
    root.classList.add("cleanfeed-ready");
  }
  function resetHiddenElements() {
    document.querySelectorAll("[data-cleanfeed-hidden]").forEach((element) => {
      element.style.removeProperty("display");
      element.removeAttribute("data-cleanfeed-hidden");
      element.removeAttribute("data-cleanfeed-reason");
    });
  }
  function hideElement(element, candidate, source, reason) {
    element.dataset.cleanfeedHidden = source;
    element.dataset.cleanfeedReason = reason;
    element.style.removeProperty("display");
    queuePlatformFeedback(element, candidate);
  }
  function queuePlatformFeedback(element, candidate) {
    if (!settings?.feedback.enabled) {
      return;
    }
    const maxPerSession = settings.feedback.maxPerSession;
    if (feedbackAttemptedKeys.has(candidate.key) || feedbackQueuedKeys.has(candidate.key) || feedbackAttempts + feedbackQueue.length >= maxPerSession) {
      return;
    }
    feedbackQueuedKeys.add(candidate.key);
    feedbackQueue.push({ element, candidate });
    void processFeedbackQueue();
  }
  async function processFeedbackQueue() {
    if (feedbackInProgress) {
      return;
    }
    feedbackInProgress = true;
    while (feedbackQueue.length > 0) {
      const item = feedbackQueue.shift();
      if (!item) {
        continue;
      }
      feedbackQueuedKeys.delete(item.candidate.key);
      if (!settings?.feedback.enabled || feedbackAttemptedKeys.has(item.candidate.key)) {
        continue;
      }
      feedbackAttemptedKeys.add(item.candidate.key);
      feedbackAttempts += 1;
      await delay(900);
      if (!document.contains(item.element)) {
        continue;
      }
      const submitted = await submitPlatformFeedback(item.element, item.candidate);
      item.element.dataset.cleanfeedFeedback = submitted ? "sent" : "unavailable";
      await delay(1200);
    }
    feedbackInProgress = false;
  }
  async function submitPlatformFeedback(element, candidate) {
    const preferredAction = settings?.feedback.preferredAction || "not_interested";
    if (candidate.site === "youtube") {
      return preferredAction === "dislike" ? await clickScopedDislike(element) || await clickYouTubeNotInterested(element) : await clickYouTubeNotInterested(element) || await clickScopedDislike(element);
    }
    if (candidate.site === "bilibili") {
      return preferredAction === "dislike" ? clickScopedDislike(element) || clickBilibiliNotInterested(element) : clickBilibiliNotInterested(element) || clickScopedDislike(element);
    }
    return false;
  }
  async function clickYouTubeNotInterested(element) {
    const menuButton = findYouTubeMenuButton(element);
    if (!menuButton) {
      return false;
    }
    simulateHover(element);
    clickTarget(menuButton);
    await delay(450);
    const menuItem = findDocumentMenuItem(["Not interested", "\u4E0D\u611F\u5174\u8DA3", "\u4E0D\u60F3\u770B"]);
    if (!menuItem) {
      closeOpenMenus();
      return false;
    }
    clickTarget(menuItem);
    await delay(300);
    return true;
  }
  function clickBilibiliNotInterested(element) {
    const noInterestButton = element.querySelector(
      ".bili-video-card__info--no-interest,.bili-video-card__info--no-interest--icon,[class*='no-interest'],[title*='\u4E0D\u611F\u5174\u8DA3']"
    );
    if (!noInterestButton) {
      return false;
    }
    simulateHover(element);
    clickTarget(noInterestButton);
    return true;
  }
  function clickScopedDislike(element) {
    const dislikeButton = findButtonByLabels(element, ["Dislike", "\u4E0D\u559C\u6B22", "\u8E29"]);
    if (!dislikeButton) {
      return false;
    }
    simulateHover(element);
    clickTarget(dislikeButton);
    return true;
  }
  function findYouTubeMenuButton(element) {
    const selectors = [
      'ytd-menu-renderer button[aria-label="Action menu"]',
      'ytd-menu-renderer button[aria-label="More actions"]',
      'ytd-menu-renderer button[aria-label*="\u66F4\u591A"]',
      'ytd-menu-renderer button[aria-label*="\u64CD\u4F5C"]',
      "ytd-menu-renderer yt-icon-button button",
      '#menu button[aria-label*="Action"]',
      '#menu button[aria-label*="More"]',
      '#menu button[aria-label*="\u66F4\u591A"]'
    ];
    for (const selector of selectors) {
      const button = element.querySelector(selector);
      if (button) {
        return button;
      }
    }
    return null;
  }
  function findDocumentMenuItem(labels) {
    const candidates = document.querySelectorAll(
      'ytd-menu-service-item-renderer,tp-yt-paper-item,yt-list-item-view-model,[role="menuitem"],button'
    );
    for (const candidate of candidates) {
      if (matchesLabels(candidate, labels)) {
        return candidate.closest(
          'ytd-menu-service-item-renderer,tp-yt-paper-item,yt-list-item-view-model,[role="menuitem"],button'
        ) || candidate;
      }
    }
    return null;
  }
  function findButtonByLabels(root, labels) {
    const candidates = root.querySelectorAll('button,[role="button"]');
    for (const candidate of candidates) {
      if (matchesLabels(candidate, labels)) {
        return candidate;
      }
    }
    return null;
  }
  function matchesLabels(element, labels) {
    const haystack = cleanText(
      [
        element.textContent || "",
        element.getAttribute("aria-label") || "",
        element.getAttribute("title") || ""
      ].join(" ")
    ).toLowerCase();
    return labels.some((label) => haystack.includes(label.toLowerCase()));
  }
  function simulateHover(element) {
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
  }
  function clickTarget(element) {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    element.click();
  }
  function closeOpenMenus() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  function delay(milliseconds) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  }
  function isYouTubeShortsElement(element) {
    if (detectSite() !== "youtube") {
      return false;
    }
    return Boolean(
      element.matches("ytd-reel-shelf-renderer,ytd-reel-video-renderer,ytm-reel-shelf-renderer,ytm-shorts-lockup-view-model") || element.querySelector('a[href^="/shorts"],a[href*="youtube.com/shorts"]')
    );
  }
  function detectSite() {
    const hostname = location.hostname.toLowerCase();
    if (hostname.includes("youtube.com")) {
      return "youtube";
    }
    if (hostname.includes("bilibili.com")) {
      return "bilibili";
    }
    return null;
  }
  function cleanText(value) {
    return value.replace(/\s+/g, " ").trim();
  }
})();
//# sourceMappingURL=content.js.map
