import type { LanguageModelUsage } from "ai";
import type { AiAuditLogEntry, AiCostBreakdown, AiCostSummary, AiTokenUsage } from "./types";

export const AI_AUDIT_LOG_LIMIT = 100;

type UsageLike = Partial<LanguageModelUsage> | undefined;

type ModelPricing = {
  pattern: RegExp;
  label: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

const MODEL_PRICES: ModelPricing[] = [
  {
    pattern: /claude[-_]?haiku[-_]?4[-.]?5/,
    label: "Claude Haiku 4.5",
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 5
  },
  {
    pattern: /claude[-_]?3[-.]?5[-_]?haiku|claude[-_]?haiku[-_]?3[-.]?5/,
    label: "Claude Haiku 3.5",
    inputUsdPerMillion: 0.8,
    outputUsdPerMillion: 4
  },
  {
    pattern: /claude[-_]?sonnet[-_]?4[-.]?[56]/,
    label: "Claude Sonnet 4.5+",
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15
  },
  {
    pattern: /claude[-_]?opus[-_]?4[-.]?[567]/,
    label: "Claude Opus 4.5+",
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 25
  }
];

export function normalizeAiUsage(usage: UsageLike): AiTokenUsage {
  const inputTokens = normalizeTokenCount(usage?.inputTokens);
  const outputTokens = normalizeTokenCount(usage?.outputTokens);
  const totalTokens = normalizeTokenCount(usage?.totalTokens, inputTokens + outputTokens);
  const reasoningTokens = normalizeTokenCount(usage?.outputTokenDetails?.reasoningTokens ?? usage?.reasoningTokens);
  const cachedInputTokens = normalizeTokenCount(usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens);
  const cacheWriteTokens = normalizeTokenCount(usage?.inputTokenDetails?.cacheWriteTokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedInputTokens,
    cacheWriteTokens
  };
}

export function estimateAiCost(model: string, usage: AiTokenUsage): AiCostBreakdown {
  const pricing = findModelPricing(model);

  if (!pricing) {
    return {
      currency: "USD",
      inputUsd: null,
      outputUsd: null,
      totalUsd: null,
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
      pricingSource: "unknown"
    };
  }

  const inputUsd = (usage.inputTokens / 1_000_000) * pricing.inputUsdPerMillion;
  const outputUsd = (usage.outputTokens / 1_000_000) * pricing.outputUsdPerMillion;

  return {
    currency: "USD",
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
    inputUsdPerMillion: pricing.inputUsdPerMillion,
    outputUsdPerMillion: pricing.outputUsdPerMillion,
    pricingSource: pricing.label
  };
}

export function summarizeAiAuditLog(log: AiAuditLogEntry[]): AiCostSummary {
  const summary = log.reduce<AiCostSummary>(
    (current, entry) => {
      current.calls += 1;
      current.successCalls += entry.status === "success" ? 1 : 0;
      current.errorCalls += entry.status === "error" ? 1 : 0;
      current.inputTokens += entry.usage.inputTokens;
      current.outputTokens += entry.usage.outputTokens;
      current.totalTokens += entry.usage.totalTokens;

      if (entry.cost.totalUsd === null) {
        current.unpricedCalls += 1;
      } else {
        current.pricedCalls += 1;
        current.estimatedCostUsd += entry.cost.totalUsd;
      }

      return current;
    },
    {
      calls: 0,
      successCalls: 0,
      errorCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      pricedCalls: 0,
      unpricedCalls: 0
    }
  );

  const [lastCall] = [...log].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  if (lastCall) {
    summary.lastCall = {
      createdAt: lastCall.createdAt,
      kind: lastCall.kind,
      status: lastCall.status,
      model: lastCall.model,
      inputTokens: lastCall.usage.inputTokens,
      outputTokens: lastCall.usage.outputTokens,
      totalUsd: lastCall.cost.totalUsd
    };
  }

  return summary;
}

export function trimAiAuditLog(log: AiAuditLogEntry[]): AiAuditLogEntry[] {
  return [...log]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, AI_AUDIT_LOG_LIMIT);
}

function findModelPricing(model: string): ModelPricing | null {
  const normalizedModel = model.toLowerCase();
  return MODEL_PRICES.find((pricing) => pricing.pattern.test(normalizedModel)) || null;
}

function normalizeTokenCount(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}
