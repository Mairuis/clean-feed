import { generateText, Output } from "ai";
import { z } from "zod";
import { AI_CACHE_TTL_MS } from "./lib/defaults";
import { createLanguageModel } from "./lib/provider";
import {
  getAiCache,
  getAiStatus,
  getSecrets,
  getSettings,
  getUiState,
  saveAiApiKey,
  saveAiCache,
  saveSettings,
  setAiStatus
} from "./lib/storage";
import type { AiReviewResult, CleanFeedRule, CleanFeedSettings, VideoCandidate } from "./lib/types";

type RuntimeMessage =
  | { type: "cleanfeed:get-state" }
  | { type: "cleanfeed:save-ai-config"; ai: CleanFeedSettings["ai"]; apiKey?: string }
  | { type: "cleanfeed:test-ai" }
  | { type: "cleanfeed:generate-config"; brief: string }
  | { type: "cleanfeed:analyze-videos"; candidates: VideoCandidate[] };

const reviewOutputSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      verdict: z.enum(["low_quality", "high_quality", "uncertain"]),
      reason: z.string().min(1)
    })
  )
});

const generatedConfigSchema = z.object({
  rules: z
    .array(
      z.object({
        explanation: z.string().min(1).max(240),
        regex: z.string().min(1).max(500)
      })
    )
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await getSettings();

  if (details.reason === "install") {
    const uiState = await getUiState();
    if (!uiState.onboardingDone) {
      chrome.runtime.openOptionsPage();
    }
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch(async (error: unknown) => {
      const messageText = error instanceof Error ? error.message : String(error);
      await setAiStatus({ state: "error", message: messageText });
      sendResponse({ ok: false, error: messageText });
    });

  return true;
});

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case "cleanfeed:get-state":
      return getState();
    case "cleanfeed:save-ai-config":
      return saveAiConfig(message.ai, message.apiKey);
    case "cleanfeed:test-ai":
      return testAiConnection();
    case "cleanfeed:generate-config":
      return generateConfig(message.brief);
    case "cleanfeed:analyze-videos":
      return analyzeVideos(message.candidates);
  }
}

async function getState() {
  const [settings, secrets, aiStatus] = await Promise.all([getSettings(), getSecrets(), getAiStatus()]);

  return {
    settings,
    hasAiKey: Boolean(secrets.aiApiKey),
    aiStatus
  };
}

async function saveAiConfig(ai: CleanFeedSettings["ai"], apiKey?: string) {
  const settings = await getSettings();
  const nextSettings = {
    ...settings,
    ai: {
      ...settings.ai,
      ...ai
    }
  };

  await saveSettings(nextSettings);

  if (apiKey && apiKey.trim()) {
    await saveAiApiKey(apiKey.trim());
  }

  await setAiStatus({ state: nextSettings.ai.enabled ? "ready" : "idle", message: "AI 配置已保存" });
  return getState();
}

async function testAiConnection() {
  const { settings, apiKey } = await getAiRuntimeConfig();
  await setAiStatus({ state: "working", message: "正在测试 AI 连接" });

  const model = createLanguageModel(settings.ai.apiBase, apiKey, settings.ai.model);
  const result = await generateText({
    model,
    output: Output.object({
      schema: z.object({
        ok: z.boolean(),
        message: z.string()
      })
    }),
    prompt:
      "Return JSON only. Do not wrap it in markdown or code fences. Shape: {\"ok\": true, \"message\": \"under 20 words\"}. Confirm the connection works."
  });

  const output = readStructuredOutput<{ ok: boolean; message: string }>(result);
  await setAiStatus({ state: "ready", message: output.message || "AI 连接正常" });
  return getState();
}

async function generateConfig(brief: string) {
  const { settings, apiKey } = await getAiRuntimeConfig();
  const safeBrief = brief.trim() || settings.ai.userBrief;

  await setAiStatus({ state: "working", message: "正在生成过滤配置" });

  const model = createLanguageModel(settings.ai.apiBase, apiKey, settings.ai.model);
  const result = await generateText({
    model,
    output: Output.object({ schema: generatedConfigSchema }),
    system:
      "You generate browser extension regex filtering rules. Each rule must contain only an explanation and a JavaScript-compatible regular expression. Return JSON only. Do not wrap it in markdown or code fences.",
    prompt: [
      "User preference:",
      safeBrief,
      "",
      "Return a JSON object: {\"rules\":[{\"explanation\":\"...\",\"regex\":\"...\"}]}",
      "The regex runs against text extracted from each video card.",
      "Available metadata markers include:",
      "§SITE=youtube or §SITE=bilibili",
      "§TITLE=<video title>",
      "§CHANNEL=<channel name>",
      "§URL=<url>",
      "§DURATION=<display duration>",
      "§DURATION_SECONDS=<seconds>",
      "§DURATION_LT_60, §DURATION_LT_90, §DURATION_LT_180, §DURATION_LT_300",
      "§TEXT=<title channel duration>",
      "Do not add broad rules that would hide high-quality educational content.",
      "Keep rules to 16 items or fewer. Use plain regex text without leading/trailing slashes."
    ].join("\n")
  });

  const output = readStructuredOutput<z.infer<typeof generatedConfigSchema>>(result);
  const timestamp = Date.now();
  const generatedRules = output.rules.slice(0, 16).map<CleanFeedRule>((rule, index) => {
    const id = `ai-${timestamp}-${index}`;

    return {
      id,
      type: "regex",
      enabled: true,
      explanation: rule.explanation,
      pattern: rule.regex,
      source: "ai"
    };
  });

  const nextSettings: CleanFeedSettings = {
    ...settings,
    rules: generatedRules,
    ai: {
      ...settings.ai,
      enabled: true,
      userBrief: safeBrief,
      generatedSummary: generatedRules.map((rule) => rule.explanation).join(" / "),
      generatedAt: new Date(timestamp).toISOString()
    }
  };

  await saveSettings(nextSettings);
  await setAiStatus({ state: "ready", message: "过滤配置已生成" });
  return getState();
}

async function analyzeVideos(candidates: VideoCandidate[]) {
  const uniqueCandidates = dedupeCandidates(candidates).slice(0, 8);

  if (uniqueCandidates.length === 0) {
    return { results: [] };
  }

  const settings = await getSettings();
  if (!settings.enabled || !settings.ai.enabled) {
    return { results: [] };
  }

  const secrets = await getSecrets();
  if (!secrets.aiApiKey) {
    await setAiStatus({ state: "error", message: "缺少 API Key，AI 后置判断已跳过" });
    return { results: [] };
  }

  const now = Date.now();
  const cache = await getAiCache();
  const cachedResults: AiReviewResult[] = [];
  const misses: VideoCandidate[] = [];

  uniqueCandidates.forEach((candidate) => {
    const cached = cache[candidate.key];
    if (cached && cached.expiresAt > now) {
      cachedResults.push({
        key: cached.key,
        verdict: cached.verdict,
        reason: cached.reason
      });
    } else {
      misses.push(candidate);
    }
  });

  if (misses.length === 0) {
    return { results: cachedResults };
  }

  await setAiStatus({ state: "working", message: `AI 正在判断 ${misses.length} 条内容` });

  const model = createLanguageModel(settings.ai.apiBase, secrets.aiApiKey, settings.ai.model);
  const result = await generateText({
    model,
    output: Output.object({ schema: reviewOutputSchema }),
    system: [
      "You classify video feed items for a browser extension.",
      settings.ai.reviewerInstruction,
      "Use only the provided title, channel, site, and duration. Do not infer hidden context.",
      "Return low_quality only when the item clearly wastes attention or is low-information. Return uncertain when unsure.",
      "Return JSON only as a top-level object with an items array. Each item must include key, verdict, and reason.",
      "Do not wrap the JSON in markdown or code fences."
    ].join("\n"),
    prompt: JSON.stringify(
      misses.map((candidate) => ({
        key: candidate.key,
        site: candidate.site,
        title: candidate.title,
        channel: candidate.channel || "",
        durationSeconds: candidate.durationSeconds ?? null
      })),
      null,
      2
    )
  });

  const output = readStructuredOutput<z.infer<typeof reviewOutputSchema>>(result);
  const freshResults = output.items.filter((item) => misses.some((candidate) => candidate.key === item.key));

  freshResults.forEach((item) => {
    cache[item.key] = {
      ...item,
      expiresAt: now + AI_CACHE_TTL_MS
    };
  });

  await saveAiCache(pruneCache(cache, now));
  await setAiStatus({ state: "ready", message: `AI 已完成 ${freshResults.length} 条判断` });

  return {
    results: [...cachedResults, ...freshResults]
  };
}

async function getAiRuntimeConfig() {
  const [settings, secrets] = await Promise.all([getSettings(), getSecrets()]);

  if (!settings.ai.apiBase.trim()) {
    throw new Error("请先填写 API Base");
  }

  if (!settings.ai.model.trim()) {
    throw new Error("请先填写 Model");
  }

  if (!secrets.aiApiKey) {
    throw new Error("请先填写 API Key");
  }

  return {
    settings,
    apiKey: secrets.aiApiKey
  };
}

function readStructuredOutput<T>(result: unknown): T {
  const maybeResult = result as { output?: T; experimental_output?: T };
  const output = maybeResult.output ?? maybeResult.experimental_output;

  if (!output) {
    throw new Error("AI response did not contain structured output");
  }

  return output;
}

function dedupeCandidates(candidates: VideoCandidate[]): VideoCandidate[] {
  const byKey = new Map<string, VideoCandidate>();

  candidates.forEach((candidate) => {
    if (candidate.key && candidate.title.trim()) {
      byKey.set(candidate.key, candidate);
    }
  });

  return [...byKey.values()];
}

function pruneCache(cache: Record<string, AiReviewResult & { expiresAt: number }>, now: number) {
  return Object.fromEntries(Object.entries(cache).filter(([, entry]) => entry.expiresAt > now));
}
