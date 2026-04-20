import { generateText, Output } from "ai";
import { z } from "zod";
import { estimateAiCost, normalizeAiUsage, summarizeAiAuditLog } from "./lib/cost";
import { AI_CACHE_TTL_MS } from "./lib/defaults";
import { createLanguageModel, detectProvider } from "./lib/provider";
import {
  appendAiAuditLog,
  getAiAuditLog,
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
import type { AiAuditLogEntry, AiCallKind, AiReviewResult, CleanFeedRule, CleanFeedSettings, VideoCandidate } from "./lib/types";

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
  const [settings, secrets, aiStatus, aiAuditLog] = await Promise.all([getSettings(), getSecrets(), getAiStatus(), getAiAuditLog()]);

  return {
    settings,
    hasAiKey: Boolean(secrets.aiApiKey),
    aiStatus,
    aiCostSummary: summarizeAiAuditLog(aiAuditLog),
    aiAuditLog: aiAuditLog.slice(0, 20)
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
  const prompt =
    "Return JSON only. Do not wrap it in markdown or code fences. Shape: {\"ok\": true, \"message\": \"under 20 words\"}. Confirm the connection works.";
  const startedAt = Date.now();

  try {
    const result = await generateText({
      model,
      output: Output.object({
        schema: z.object({
          ok: z.boolean(),
          message: z.string()
        })
      }),
      prompt
    });

    const output = readStructuredOutput<{ ok: boolean; message: string }>(result);
    await recordAiCall({
      input: { prompt },
      kind: "test_connection",
      output,
      result,
      settings,
      startedAt,
      status: "success"
    });
    await setAiStatus({ state: "ready", message: output.message || "AI 连接正常" });
    return getState();
  } catch (error) {
    await recordAiCall({
      error,
      input: { prompt },
      kind: "test_connection",
      settings,
      startedAt,
      status: "error"
    });
    throw error;
  }
}

async function generateConfig(brief: string) {
  const { settings, apiKey } = await getAiRuntimeConfig();
  const safeBrief = brief.trim() || settings.ai.userBrief;

  await setAiStatus({ state: "working", message: "正在生成过滤配置" });

  const model = createLanguageModel(settings.ai.apiBase, apiKey, settings.ai.model);
  const system =
    "You generate browser extension regex filtering rules. Each rule must contain only an explanation and a JavaScript-compatible regular expression. Return JSON only. Do not wrap it in markdown or code fences.";
  const prompt = [
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
    "§DURATION_MINUTES_FLOOR=<whole minutes>",
    "§DURATION_LT_60, §DURATION_LT_90, §DURATION_LT_180, §DURATION_LT_300",
    "For longer videos, use common minute markers such as §DURATION_GTE_5_MIN, §DURATION_GTE_10_MIN, §DURATION_GTE_20_MIN, §DURATION_GTE_30_MIN, §DURATION_GTE_60_MIN.",
    "For strictly longer than a threshold, use §DURATION_GT_5_MIN, §DURATION_GT_10_MIN, §DURATION_GT_20_MIN, §DURATION_GT_30_MIN, §DURATION_GT_60_MIN.",
    "§TEXT=<title channel duration>",
    "Do not add broad rules that would hide high-quality educational content.",
    "Keep rules to 16 items or fewer. Use plain regex text without leading/trailing slashes."
  ].join("\n");
  const startedAt = Date.now();
  let output: z.infer<typeof generatedConfigSchema>;
  let result: unknown;

  try {
    result = await generateText({
      model,
      output: Output.object({ schema: generatedConfigSchema }),
      system,
      prompt
    });

    output = readStructuredOutput<z.infer<typeof generatedConfigSchema>>(result);
  } catch (error) {
    await recordAiCall({
      error,
      input: { prompt, system },
      kind: "generate_config",
      settings,
      startedAt,
      status: "error"
    });
    throw error;
  }

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
  await recordAiCall({
    input: { prompt, system },
    kind: "generate_config",
    output,
    result,
    settings,
    startedAt,
    status: "success"
  });
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
  const system = [
    "You classify video feed items for a browser extension.",
    settings.ai.reviewerInstruction,
    "Use only the provided title, channel, site, and duration. Do not infer hidden context.",
    "Return low_quality only when the item clearly wastes attention or is low-information. Return uncertain when unsure.",
    "Return JSON only as a top-level object with an items array. Each item must include key, verdict, and reason.",
    "Do not wrap the JSON in markdown or code fences."
  ].join("\n");
  const prompt = JSON.stringify(
    misses.map((candidate) => ({
      key: candidate.key,
      site: candidate.site,
      title: candidate.title,
      channel: candidate.channel || "",
      durationSeconds: candidate.durationSeconds ?? null
    })),
    null,
    2
  );
  const startedAt = Date.now();
  let output: z.infer<typeof reviewOutputSchema>;
  let result: unknown;

  try {
    result = await generateText({
      model,
      output: Output.object({ schema: reviewOutputSchema }),
      system,
      prompt
    });

    output = readStructuredOutput<z.infer<typeof reviewOutputSchema>>(result);
  } catch (error) {
    await recordAiCall({
      error,
      input: { prompt, system },
      itemCount: misses.length,
      kind: "review_videos",
      settings,
      startedAt,
      status: "error"
    });
    throw error;
  }

  const freshResults = output.items.filter((item) => misses.some((candidate) => candidate.key === item.key));

  freshResults.forEach((item) => {
    cache[item.key] = {
      ...item,
      expiresAt: now + AI_CACHE_TTL_MS
    };
  });

  await saveAiCache(pruneCache(cache, now));
  await recordAiCall({
    input: { prompt, system },
    itemCount: misses.length,
    kind: "review_videos",
    output: freshResults,
    result,
    settings,
    startedAt,
    status: "success"
  });
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

async function recordAiCall({
  error,
  input,
  itemCount,
  kind,
  output,
  result,
  settings,
  startedAt,
  status
}: {
  error?: unknown;
  input: unknown;
  itemCount?: number;
  kind: AiCallKind;
  output?: unknown;
  result?: unknown;
  settings: CleanFeedSettings;
  startedAt: number;
  status: AiAuditLogEntry["status"];
}) {
  const usage = normalizeAiUsage(readResultUsage(result) as Parameters<typeof normalizeAiUsage>[0]);

  await appendAiAuditLog({
    id: createAuditId(),
    apiBase: settings.ai.apiBase,
    cost: estimateAiCost(settings.ai.model, usage),
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
    ...(itemCount !== undefined ? { itemCount } : {}),
    input: sanitizeAuditValue(input),
    kind,
    model: settings.ai.model,
    ...(output !== undefined ? { output: sanitizeAuditValue(output) } : {}),
    provider: detectProvider(settings.ai.apiBase),
    status,
    usage
  });
}

function readResultUsage(result: unknown) {
  const maybeResult = result as { totalUsage?: unknown; usage?: unknown } | undefined;
  return maybeResult?.totalUsage || maybeResult?.usage;
}

function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 8000 ? `${value.slice(0, 8000)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= 4) {
    return "[Max depth]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeAuditValue(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 80)
        .map(([key, item]) => [
          key,
          /api[-_ ]?key|authorization|secret|token/i.test(key) ? "[redacted]" : sanitizeAuditValue(item, depth + 1)
        ])
    );
  }

  return String(value);
}

function createAuditId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
