import { applyProgrammaticRules, createVideoCacheKey, parseDuration } from "./lib/rules";
import { getSettings } from "./lib/storage";
import type { AiReviewResult, CleanFeedSettings, SiteId, VideoCandidate } from "./lib/types";

const YOUTUBE_VIDEO_SELECTOR = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytm-rich-item-renderer",
  "ytm-video-with-context-renderer"
].join(",");

const BILIBILI_VIDEO_SELECTOR = [
  ".bili-video-card",
  ".bili-video-card__wrap",
  ".feed-card",
  ".video-card",
  ".video-list-item",
  ".rank-item"
].join(",");

type CardCandidate = {
  element: HTMLElement;
  candidate: VideoCandidate;
};

type FeedbackQueueItem = {
  element: HTMLElement;
  candidate: VideoCandidate;
};

type AnalyzeVideosResponse = {
  results: AiReviewResult[];
};

let settings: CleanFeedSettings | null = null;
let observer: MutationObserver | null = null;
let scanQueued = false;
let lastUrl = location.href;
let aiReviewTimer: number | null = null;
let aiCooldownUntil = 0;
let aiCandidateByKey = new Map<string, VideoCandidate>();
let aiElementsByKey = new Map<string, Set<HTMLElement>>();
let aiPendingCandidates = new Map<string, VideoCandidate>();
let aiInFlightKeys = new Set<string>();
let aiReviewResults = new Map<string, AiReviewResult>();
let aiLastState = "idle";
let feedbackQueue: FeedbackQueueItem[] = [];
let feedbackQueuedKeys = new Set<string>();
let feedbackAttemptedKeys = new Set<string>();
let feedbackAttempts = 0;
let feedbackInProgress = false;

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
      resetAiReviewState();
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
    aiCandidateByKey = new Map();
    aiElementsByKey = new Map();
    aiPendingCandidates = new Map();
    aiInFlightKeys = new Set();
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

  if (settings.shorts.enabled && location.pathname.startsWith("/shorts")) {
    location.replace("/feed/subscriptions");
    return;
  }

  const cards = collectCandidates();
  refreshAiElementIndex(cards);

  cards.forEach(({ element, candidate }) => {
    const match = applyProgrammaticRules(candidate, settings?.rules || []);
    if (match?.action === "allow") {
      unhideElement(element);
      aiPendingCandidates.delete(candidate.key);
      aiReviewResults.delete(candidate.key);
      return;
    }

    if (settings?.shorts.enabled && isYouTubeShortsElement(element)) {
      hideElement(element, candidate, "platform-shorts", "Shorts");
      return;
    }

    if (match?.action === "block") {
      hideElement(element, candidate, "rule", match.reason);
      return;
    }

    const aiResult = aiReviewResults.get(candidate.key);
    if (aiResult) {
      applyAiReviewResult(aiResult);
      return;
    }

    queueAiReview(candidate);
  });

  scheduleAiReview();
}

function collectCandidates(): CardCandidate[] {
  const site = detectSite();

  if (site === "youtube") {
    return collectFromSelector(YOUTUBE_VIDEO_SELECTOR, extractYouTubeCandidate);
  }

  if (site === "bilibili") {
    return collectFromSelector(BILIBILI_VIDEO_SELECTOR, extractBilibiliCandidate);
  }

  return [];
}

function collectFromSelector(
  selector: string,
  extractor: (element: HTMLElement) => Omit<VideoCandidate, "key"> | null
): CardCandidate[] {
  const seen = new Set<string>();
  const cards: CardCandidate[] = [];

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

function extractYouTubeCandidate(element: HTMLElement): Omit<VideoCandidate, "key"> | null {
  const link = element.querySelector<HTMLAnchorElement>(
    'a#video-title-link,a#video-title,a[href^="/watch"],a[href^="/shorts"]'
  );
  const titleElement = element.querySelector<HTMLElement>("#video-title,#video-title-link,h3");
  const durationElement = element.querySelector<HTMLElement>(
    "ytd-thumbnail-overlay-time-status-renderer,.ytd-thumbnail-overlay-time-status-renderer,span[aria-label*='minute'],span[aria-label*='分钟']"
  );
  const channelElement = element.querySelector<HTMLElement>(
    "#channel-name,ytd-channel-name,ytm-badge-and-byline-renderer"
  );

  const title = cleanText(titleElement?.textContent || link?.getAttribute("title") || link?.textContent || "");
  const durationText = cleanText(durationElement?.textContent || durationElement?.getAttribute("aria-label") || "");
  const durationSeconds = parseDuration(durationText);
  const cardText = cleanText(element.innerText || element.textContent || "");

  if (!link || !title) {
    return null;
  }

  return {
    site: "youtube",
    url: new URL(link.getAttribute("href") || "", location.origin).toString(),
    title,
    channel: cleanText([channelElement?.textContent || "", extractFollowStateText(cardText)].filter(Boolean).join(" ")),
    durationText,
    ...(durationSeconds !== undefined ? { durationSeconds } : {})
  };
}

function extractBilibiliCandidate(element: HTMLElement): Omit<VideoCandidate, "key"> | null {
  const link = element.querySelector<HTMLAnchorElement>('a[href*="/video/BV"],a[href*="bilibili.com/video/BV"]');
  const titleElement = element.querySelector<HTMLElement>(
    ".bili-video-card__info--tit,.video-name,.title,.rank-title,a[title]"
  );
  const durationElement = element.querySelector<HTMLElement>(
    ".bili-video-card__stats__duration,.duration,.length,.time"
  );
  const channelElement = element.querySelector<HTMLElement>(
    ".bili-video-card__info--author,.up-name,.name,.author"
  );
  const title = cleanText(
    titleElement?.getAttribute("title") || titleElement?.textContent || link?.getAttribute("title") || ""
  );
  const durationText = cleanText(durationElement?.textContent || "");
  const durationSeconds = parseDuration(durationText);
  const cardText = cleanText(element.innerText || element.textContent || "");

  if (!link || !title) {
    return null;
  }

  return {
    site: "bilibili",
    url: new URL(link.getAttribute("href") || "", location.origin).toString(),
    title,
    channel: cleanText([channelElement?.textContent || "", extractFollowStateText(cardText)].filter(Boolean).join(" ")),
    durationText,
    ...(durationSeconds !== undefined ? { durationSeconds } : {})
  };
}

function extractFollowStateText(text: string): string {
  const matches = text.match(/已关注|已订阅|Subscribed|Following/giu);
  return matches ? [...new Set(matches)].join(" ") : "";
}

function applyRootClasses() {
  const root = document.documentElement;
  if (!root || !settings) {
    return;
  }

  root.classList.toggle("cleanfeed-enabled", settings.enabled);
  root.classList.toggle("cleanfeed-hide-shorts", settings.enabled && settings.shorts.enabled);
  root.dataset.cleanfeedAi = settings.enabled && settings.ai.enabled ? aiLastState : "disabled";
  root.classList.add("cleanfeed-ready");
}

function resetHiddenElements() {
  document.querySelectorAll<HTMLElement>("[data-cleanfeed-hidden]").forEach((element) => {
    unhideElement(element);
  });
}

function unhideElement(element: HTMLElement) {
  element.style.removeProperty("display");
  if (element.dataset.cleanfeedPositioned === "true") {
    element.style.removeProperty("position");
    element.removeAttribute("data-cleanfeed-positioned");
  }
  element.removeAttribute("data-cleanfeed-hidden");
  element.removeAttribute("data-cleanfeed-reason");
  element.querySelector<HTMLElement>(".cleanfeed-badge")?.remove();
}

function resetAiReviewState() {
  if (aiReviewTimer !== null) {
    window.clearTimeout(aiReviewTimer);
    aiReviewTimer = null;
  }

  aiCooldownUntil = 0;
  aiCandidateByKey = new Map();
  aiElementsByKey = new Map();
  aiPendingCandidates = new Map();
  aiInFlightKeys = new Set();
  aiReviewResults = new Map();
  aiLastState = "idle";
}

function refreshAiElementIndex(cards: CardCandidate[]) {
  aiCandidateByKey = new Map();
  aiElementsByKey = new Map();

  cards.forEach(({ element, candidate }) => {
    aiCandidateByKey.set(candidate.key, candidate);

    const elements = aiElementsByKey.get(candidate.key) || new Set<HTMLElement>();
    elements.add(element);
    aiElementsByKey.set(candidate.key, elements);
  });
}

function queueAiReview(candidate: VideoCandidate) {
  if (!settings?.enabled || !settings.ai.enabled || aiReviewResults.has(candidate.key) || aiInFlightKeys.has(candidate.key)) {
    return;
  }

  setAiDebugState("queued");
  aiPendingCandidates.set(candidate.key, candidate);
}

function scheduleAiReview() {
  if (!settings?.enabled || !settings.ai.enabled || aiPendingCandidates.size === 0 || aiReviewTimer !== null) {
    return;
  }

  if (Date.now() < aiCooldownUntil) {
    return;
  }

  aiReviewTimer = window.setTimeout(() => {
    aiReviewTimer = null;
    void processAiReviewQueue();
  }, 650);
}

async function processAiReviewQueue() {
  if (!settings?.enabled || !settings.ai.enabled || aiPendingCandidates.size === 0 || Date.now() < aiCooldownUntil) {
    return;
  }

  const batch = [...aiPendingCandidates.values()].slice(0, 8);
  batch.forEach((candidate) => {
    aiPendingCandidates.delete(candidate.key);
    aiInFlightKeys.add(candidate.key);
  });
  setAiDebugState("working");

  try {
    const response = await sendRuntimeMessage<AnalyzeVideosResponse>({
      type: "cleanfeed:analyze-videos",
      candidates: batch
    });
    if (response.results.length === 0 && batch.length > 0) {
      setAiDebugState("skipped");
    }

    const resultKeys = new Set(response.results.map((result) => result.key));
    response.results.forEach((result) => {
      aiReviewResults.set(result.key, result);
      applyAiReviewResult(result);
    });

    batch.forEach((candidate) => {
      if (!resultKeys.has(candidate.key)) {
        aiReviewResults.set(candidate.key, {
          key: candidate.key,
          verdict: "uncertain",
          reason: "AI skipped"
        });
      }
    });
  } catch (error) {
    aiCooldownUntil = Date.now() + 30_000;
    setAiDebugState("error");
    console.warn("[Clean Feed] AI review skipped", error);
  } finally {
    batch.forEach((candidate) => aiInFlightKeys.delete(candidate.key));
  }

  if (aiPendingCandidates.size > 0) {
    scheduleAiReview();
  } else if (aiLastState !== "error" && aiLastState !== "skipped") {
    setAiDebugState("ready");
  }
}

function applyAiReviewResult(result: AiReviewResult) {
  if (result.verdict !== "low_quality") {
    return;
  }

  const candidate = aiCandidateByKey.get(result.key);
  const elements = aiElementsByKey.get(result.key);
  if (!candidate || !elements) {
    return;
  }

  elements.forEach((element) => {
    if (document.contains(element)) {
      hideElement(element, candidate, "ai", result.reason || "AI low quality");
    }
  });
}

function hideElement(element: HTMLElement, candidate: VideoCandidate, source: string, reason: string) {
  element.dataset.cleanfeedHidden = source;
  element.dataset.cleanfeedReason = reason;
  element.style.removeProperty("display");
  renderBadge(element, source, reason);
  queuePlatformFeedback(element, candidate);
}

function renderBadge(element: HTMLElement, source: string, reason: string) {
  element.querySelector<HTMLElement>(".cleanfeed-badge")?.remove();

  const badge = document.createElement("span");
  badge.className = "cleanfeed-badge";
  badge.textContent = formatBadgeLabel(source, reason);

  if (getComputedStyle(element).position === "static") {
    element.dataset.cleanfeedPositioned = "true";
    element.style.position = "relative";
  }

  element.append(badge);
}

function formatBadgeLabel(source: string, reason: string): string {
  if (source === "ai") {
    return `AI · ${reason || "低质内容"}`;
  }

  if (source === "rule") {
    return `REGEX · ${reason || "规则命中"}`;
  }

  if (source === "platform-shorts") {
    return "SHORTS";
  }

  return reason || "Clean Feed";
}

function setAiDebugState(state: string) {
  aiLastState = state;
  document.documentElement.dataset.cleanfeedAi = state;
}

function queuePlatformFeedback(element: HTMLElement, candidate: VideoCandidate) {
  if (!settings?.feedback.enabled) {
    return;
  }

  const maxPerSession = settings.feedback.maxPerSession;
  if (
    feedbackAttemptedKeys.has(candidate.key) ||
    feedbackQueuedKeys.has(candidate.key) ||
    feedbackAttempts + feedbackQueue.length >= maxPerSession
  ) {
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

async function submitPlatformFeedback(element: HTMLElement, candidate: VideoCandidate): Promise<boolean> {
  const preferredAction = settings?.feedback.preferredAction || "not_interested";

  if (candidate.site === "youtube") {
    return preferredAction === "dislike"
      ? (await clickScopedDislike(element)) || (await clickYouTubeNotInterested(element))
      : (await clickYouTubeNotInterested(element)) || (await clickScopedDislike(element));
  }

  if (candidate.site === "bilibili") {
    return preferredAction === "dislike"
      ? clickScopedDislike(element) || clickBilibiliNotInterested(element)
      : clickBilibiliNotInterested(element) || clickScopedDislike(element);
  }

  return false;
}

async function clickYouTubeNotInterested(element: HTMLElement): Promise<boolean> {
  const menuButton = findYouTubeMenuButton(element);
  if (!menuButton) {
    return false;
  }

  simulateHover(element);
  clickTarget(menuButton);
  await delay(450);

  const menuItem = findDocumentMenuItem(["Not interested", "不感兴趣", "不想看"]);
  if (!menuItem) {
    closeOpenMenus();
    return false;
  }

  clickTarget(menuItem);
  await delay(300);
  return true;
}

function clickBilibiliNotInterested(element: HTMLElement): boolean {
  const noInterestButton = element.querySelector<HTMLElement>(
    ".bili-video-card__info--no-interest,.bili-video-card__info--no-interest--icon,[class*='no-interest'],[title*='不感兴趣']"
  );

  if (!noInterestButton) {
    return false;
  }

  simulateHover(element);
  clickTarget(noInterestButton);
  return true;
}

function clickScopedDislike(element: HTMLElement): boolean {
  const dislikeButton = findButtonByLabels(element, ["Dislike", "不喜欢", "踩"]);
  if (!dislikeButton) {
    return false;
  }

  simulateHover(element);
  clickTarget(dislikeButton);
  return true;
}

function findYouTubeMenuButton(element: HTMLElement): HTMLElement | null {
  const selectors = [
    'ytd-menu-renderer button[aria-label="Action menu"]',
    'ytd-menu-renderer button[aria-label="More actions"]',
    'ytd-menu-renderer button[aria-label*="更多"]',
    'ytd-menu-renderer button[aria-label*="操作"]',
    "ytd-menu-renderer yt-icon-button button",
    '#menu button[aria-label*="Action"]',
    '#menu button[aria-label*="More"]',
    '#menu button[aria-label*="更多"]'
  ];

  for (const selector of selectors) {
    const button = element.querySelector<HTMLElement>(selector);
    if (button) {
      return button;
    }
  }

  return null;
}

function findDocumentMenuItem(labels: string[]): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    'ytd-menu-service-item-renderer,tp-yt-paper-item,yt-list-item-view-model,[role="menuitem"],button'
  );

  for (const candidate of candidates) {
    if (matchesLabels(candidate, labels)) {
      return candidate.closest<HTMLElement>(
        'ytd-menu-service-item-renderer,tp-yt-paper-item,yt-list-item-view-model,[role="menuitem"],button'
      ) || candidate;
    }
  }

  return null;
}

function findButtonByLabels(root: HTMLElement, labels: string[]): HTMLElement | null {
  const candidates = root.querySelectorAll<HTMLElement>('button,[role="button"]');

  for (const candidate of candidates) {
    if (matchesLabels(candidate, labels)) {
      return candidate;
    }
  }

  return null;
}

function matchesLabels(element: HTMLElement, labels: string[]): boolean {
  const haystack = cleanText(
    [
      element.textContent || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || ""
    ].join(" ")
  ).toLowerCase();

  return labels.some((label) => haystack.includes(label.toLowerCase()));
}

function simulateHover(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
}

function clickTarget(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  element.click();
}

function closeOpenMenus() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function sendRuntimeMessage<T>(message: Record<string, unknown>): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Clean Feed background request failed");
  }

  return response.payload as T;
}

function isYouTubeShortsElement(element: HTMLElement): boolean {
  if (detectSite() !== "youtube") {
    return false;
  }

  return Boolean(
    element.matches("ytd-reel-shelf-renderer,ytd-reel-video-renderer,ytm-reel-shelf-renderer,ytm-shorts-lockup-view-model") ||
      element.querySelector('a[href^="/shorts"],a[href*="youtube.com/shorts"]')
  );
}

function detectSite(): SiteId | null {
  const hostname = location.hostname.toLowerCase();

  if (hostname.includes("youtube.com")) {
    return "youtube";
  }

  if (hostname.includes("bilibili.com")) {
    return "bilibili";
  }

  return null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
