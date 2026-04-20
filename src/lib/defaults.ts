import type { AiStatus, CleanFeedSettings } from "./types";

export const DEFAULT_AI_BASE = "https://openrouter.ai/api/v1";
export const DEFAULT_AI_MODEL = "anthropic/claude-haiku-4-5";
export const AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_SHORTS_THRESHOLD_SECONDS = 5 * 60;

export const DEFAULT_USER_BRIEF =
  "屏蔽短平快、标题党、低质量娱乐八卦、重复搬运和浪费注意力的内容；保留长视频、教程、深度分析、技术和高质量创作。";

export const DEFAULT_REVIEWER_INSTRUCTION =
  "判断视频是否明显属于短平快、低信息密度、标题党、重复搬运或浪费注意力的内容。只有明显低质量才返回 low_quality；不确定时返回 uncertain。";

export const DEFAULT_SETTINGS: CleanFeedSettings = {
  enabled: true,
  rules: [
    {
      id: "default-followed-author-allow",
      type: "allow_regex",
      enabled: true,
      explanation: "已关注作者内容直接放行",
      pattern: "(已关注|已订阅|Subscribed|Following)",
      source: "default"
    },
    {
      id: "default-attention-bait",
      type: "block_regex",
      enabled: true,
      explanation: "标题党、震惊体、低质娱乐和重复搬运内容",
      pattern: "(震惊|必看|速看|爽文|吃瓜|八卦|搬运|reaction|prank|drama|clickbait)",
      source: "default"
    }
  ],
  shorts: {
    enabled: true,
    thresholdSeconds: DEFAULT_SHORTS_THRESHOLD_SECONDS
  },
  ai: {
    enabled: false,
    apiBase: DEFAULT_AI_BASE,
    model: DEFAULT_AI_MODEL,
    userBrief: DEFAULT_USER_BRIEF,
    generatedSummary: "默认使用 OpenRouter + Claude Haiku 4.5。输入一段话后，Clean Feed 会生成快速规则和保守的 LLM 后置判断策略。",
    reviewerInstruction: DEFAULT_REVIEWER_INSTRUCTION
  },
  feedback: {
    enabled: true,
    preferredAction: "not_interested",
    maxPerSession: 20
  }
};

export const DEFAULT_AI_STATUS: AiStatus = {
  state: "idle",
  message: "AI 尚未连接",
  updatedAt: new Date(0).toISOString()
};
