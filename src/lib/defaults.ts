import type { AiStatus, CleanFeedSettings } from "./types";

export const DEFAULT_AI_BASE = "https://api.anthropic.com/v1";
export const DEFAULT_AI_MODEL = "claude-3-5-haiku-latest";
export const AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_USER_BRIEF =
  "屏蔽短平快、标题党、低质量娱乐八卦、重复搬运和浪费注意力的内容；保留长视频、教程、深度分析、技术和高质量创作。";

export const DEFAULT_REVIEWER_INSTRUCTION =
  "判断视频是否明显属于短平快、低信息密度、标题党、重复搬运或浪费注意力的内容。只有明显低质量才返回 low_quality；不确定时返回 uncertain。";

export const DEFAULT_SETTINGS: CleanFeedSettings = {
  enabled: true,
  rules: [
    {
      id: "default-short-video",
      type: "duration",
      enabled: true,
      label: "屏蔽 60 秒以内的视频",
      thresholdSeconds: 60,
      source: "default"
    }
  ],
  ai: {
    enabled: false,
    apiBase: DEFAULT_AI_BASE,
    model: DEFAULT_AI_MODEL,
    userBrief: DEFAULT_USER_BRIEF,
    generatedSummary: "默认配置会先屏蔽 60 秒以内的视频。配置 AI 后，可以用一段话生成更贴近你偏好的规则。",
    reviewerInstruction: DEFAULT_REVIEWER_INSTRUCTION
  },
  feedback: {
    enabled: false,
    preferredAction: "not_interested",
    maxPerSession: 20
  }
};

export const DEFAULT_AI_STATUS: AiStatus = {
  state: "idle",
  message: "AI 尚未连接",
  updatedAt: new Date(0).toISOString()
};
