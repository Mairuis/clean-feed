import { describe, expect, it } from "vitest";
import { estimateAiCost, normalizeAiUsage, summarizeAiAuditLog } from "./cost";
import type { AiAuditLogEntry } from "./types";

describe("AI cost accounting", () => {
  it("normalizes input and output token usage", () => {
    expect(
      normalizeAiUsage({
        inputTokens: 1200,
        outputTokens: 80,
        totalTokens: undefined,
        inputTokenDetails: {
          cacheReadTokens: 100,
          cacheWriteTokens: 20,
          noCacheTokens: 1080
        },
        outputTokenDetails: {
          reasoningTokens: 5,
          textTokens: 75
        }
      })
    ).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      totalTokens: 1280,
      reasoningTokens: 5,
      cachedInputTokens: 100,
      cacheWriteTokens: 20
    });
  });

  it("estimates Claude Haiku 4.5 input and output cost separately", () => {
    const usage = normalizeAiUsage({
      inputTokens: 1000,
      outputTokens: 200,
      totalTokens: 1200
    });

    expect(estimateAiCost("anthropic/claude-haiku-4-5", usage)).toMatchObject({
      currency: "USD",
      inputUsd: 0.001,
      outputUsd: 0.001,
      totalUsd: 0.002,
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 5
    });
  });

  it("marks unknown model pricing as unpriced", () => {
    const usage = normalizeAiUsage({ inputTokens: 1000, outputTokens: 100 });

    expect(estimateAiCost("custom/model", usage).totalUsd).toBeNull();
  });

  it("summarizes audit logs", () => {
    const log: AiAuditLogEntry[] = [
      makeEntry("new", "2026-04-20T02:00:00.000Z", 100, 20, 0.0002),
      makeEntry("old", "2026-04-20T01:00:00.000Z", 50, 10, null, "error")
    ];

    expect(summarizeAiAuditLog(log)).toMatchObject({
      calls: 2,
      successCalls: 1,
      errorCalls: 1,
      inputTokens: 150,
      outputTokens: 30,
      totalTokens: 180,
      estimatedCostUsd: 0.0002,
      pricedCalls: 1,
      unpricedCalls: 1,
      lastCall: {
        kind: "review_videos",
        status: "success",
        inputTokens: 100,
        outputTokens: 20,
        totalUsd: 0.0002
      }
    });
  });
});

function makeEntry(
  id: string,
  createdAt: string,
  inputTokens: number,
  outputTokens: number,
  totalUsd: number | null,
  status: AiAuditLogEntry["status"] = "success"
): AiAuditLogEntry {
  return {
    id,
    apiBase: "https://openrouter.ai/api/v1",
    cost: {
      currency: "USD",
      inputUsd: totalUsd === null ? null : totalUsd / 2,
      inputUsdPerMillion: totalUsd === null ? null : 1,
      outputUsd: totalUsd === null ? null : totalUsd / 2,
      outputUsdPerMillion: totalUsd === null ? null : 5,
      pricingSource: totalUsd === null ? "unknown" : "Claude Haiku 4.5",
      totalUsd
    },
    createdAt,
    durationMs: 120,
    input: {},
    kind: "review_videos",
    model: "anthropic/claude-haiku-4-5",
    output: {},
    provider: "openai-compatible",
    status,
    usage: {
      cacheWriteTokens: 0,
      cachedInputTokens: 0,
      inputTokens,
      outputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens
    }
  };
}
