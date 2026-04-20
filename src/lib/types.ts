export type SiteId = "youtube" | "bilibili";

export type RuleSource = "default" | "ai";

export type RegexRule = {
  id: string;
  type: "allow_regex" | "block_regex" | "regex";
  enabled: boolean;
  explanation: string;
  pattern: string;
  source: RuleSource;
};

export type CleanFeedRule = RegexRule;

export type ShortsSettings = {
  enabled: boolean;
  thresholdSeconds: number;
};

export type AiSettings = {
  enabled: boolean;
  apiBase: string;
  model: string;
  userBrief: string;
  generatedSummary: string;
  reviewerInstruction: string;
  generatedAt?: string;
};

export type FeedbackAction = "not_interested" | "dislike";

export type PlatformFeedbackSettings = {
  enabled: boolean;
  preferredAction: FeedbackAction;
  maxPerSession: number;
};

export type CleanFeedSettings = {
  enabled: boolean;
  rules: CleanFeedRule[];
  shorts: ShortsSettings;
  ai: AiSettings;
  feedback: PlatformFeedbackSettings;
};

export type CleanFeedSecrets = {
  aiApiKey?: string;
};

export type CleanFeedUiState = {
  onboardingDone: boolean;
};

export type AiStatus = {
  state: "idle" | "ready" | "working" | "error";
  message: string;
  updatedAt: string;
};

export type AiCallKind = "test_connection" | "generate_config" | "review_videos";

export type AiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
};

export type AiCostBreakdown = {
  currency: "USD";
  inputUsd: number | null;
  outputUsd: number | null;
  totalUsd: number | null;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  pricingSource: string;
};

export type AiAuditLogEntry = {
  id: string;
  createdAt: string;
  kind: AiCallKind;
  status: "success" | "error";
  provider: string;
  apiBase: string;
  model: string;
  durationMs: number;
  itemCount?: number;
  input: unknown;
  output?: unknown;
  error?: string;
  usage: AiTokenUsage;
  cost: AiCostBreakdown;
};

export type AiCostSummary = {
  calls: number;
  successCalls: number;
  errorCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  pricedCalls: number;
  unpricedCalls: number;
  lastCall?: {
    createdAt: string;
    kind: AiCallKind;
    status: "success" | "error";
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalUsd: number | null;
  };
};

export type VideoCandidate = {
  key: string;
  site: SiteId;
  url: string;
  title: string;
  channel?: string;
  durationText?: string;
  durationSeconds?: number;
};

export type AiReviewVerdict = "low_quality" | "high_quality" | "uncertain";

export type AiReviewResult = {
  key: string;
  verdict: AiReviewVerdict;
  reason: string;
};

export type AiCacheEntry = AiReviewResult & {
  expiresAt: number;
};
