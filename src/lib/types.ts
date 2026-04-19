export type SiteId = "youtube" | "bilibili";

export type RuleSource = "default" | "ai";

export type KeywordRule = {
  id: string;
  type: "keyword";
  enabled: boolean;
  label: string;
  value: string;
  source: RuleSource;
};

export type DurationRule = {
  id: string;
  type: "duration";
  enabled: boolean;
  label: string;
  thresholdSeconds: number;
  source: RuleSource;
};

export type CleanFeedRule = KeywordRule | DurationRule;

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
  ai: AiSettings;
  feedback: PlatformFeedbackSettings;
};

export type CleanFeedSecrets = {
  aiApiKey?: string;
};

export type AiStatus = {
  state: "idle" | "ready" | "working" | "error";
  message: string;
  updatedAt: string;
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
