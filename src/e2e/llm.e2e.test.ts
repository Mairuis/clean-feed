import { generateText, Output } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLanguageModel, detectProvider } from "../lib/provider";

declare const process: {
  env: Record<string, string | undefined>;
};

type LlmE2eCase = {
  name: string;
  keyEnv: string;
  baseEnv: string;
  modelEnv: string;
  defaultBase: string;
  defaultModel: string;
};

const shouldRun = process.env.CLEANFEED_RUN_LLM_E2E === "1";
const describeIfEnabled = shouldRun ? describe : describe.skip;

const cases: LlmE2eCase[] = [
  {
    name: "OpenRouter",
    keyEnv: "CLEANFEED_E2E_OPENROUTER_API_KEY",
    baseEnv: "CLEANFEED_E2E_OPENROUTER_API_BASE",
    modelEnv: "CLEANFEED_E2E_OPENROUTER_MODEL",
    defaultBase: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-haiku-4-5"
  },
  {
    name: "Claude",
    keyEnv: "CLEANFEED_E2E_ANTHROPIC_API_KEY",
    baseEnv: "CLEANFEED_E2E_ANTHROPIC_API_BASE",
    modelEnv: "CLEANFEED_E2E_ANTHROPIC_MODEL",
    defaultBase: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5"
  },
  {
    name: "Gemini OpenAI compatibility",
    keyEnv: "CLEANFEED_E2E_GEMINI_API_KEY",
    baseEnv: "CLEANFEED_E2E_GEMINI_API_BASE",
    modelEnv: "CLEANFEED_E2E_GEMINI_MODEL",
    defaultBase: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-3-flash-preview"
  },
  {
    name: "OpenAI",
    keyEnv: "CLEANFEED_E2E_OPENAI_API_KEY",
    baseEnv: "CLEANFEED_E2E_OPENAI_API_BASE",
    modelEnv: "CLEANFEED_E2E_OPENAI_MODEL",
    defaultBase: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini"
  }
];

const reviewSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string(),
        verdict: z.enum(["low_quality", "high_quality", "uncertain"]),
        reason: z.string().min(1)
      })
    )
});

describeIfEnabled("LLM provider E2E", () => {
  for (const config of cases) {
    const apiKey = process.env[config.keyEnv];
    const runProviderTest = apiKey ? it : it.skip;

    runProviderTest(`${config.name} returns structured video review output`, async () => {
      const apiBase = process.env[config.baseEnv] || config.defaultBase;
      const modelId = process.env[config.modelEnv] || config.defaultModel;
      const model = createLanguageModel(apiBase, apiKey!, modelId);

      const result = await generateText({
        model,
        output: Output.object({ schema: reviewSchema }),
        temperature: 0,
        system: [
          "You classify video feed items for a browser extension.",
          "Use only the provided title, channel, site, and duration.",
          "Return low_quality only when the item clearly wastes attention or is low-information.",
          "Return uncertain when unsure.",
          "Return JSON only as a top-level object with an items array. Each item must include key, verdict, and reason.",
          "Do not wrap the JSON in markdown or code fences."
        ].join("\n"),
        prompt: JSON.stringify(
          [
            {
              key: `${config.name.toLowerCase().replace(/\W+/g, "-")}-e2e`,
              site: "youtube",
              title: "30秒看完一个复杂话题，震惊所有人",
              channel: "attention bait channel",
              durationSeconds: 30
            }
          ],
          null,
          2
        )
      });

      const output = result.experimental_output;
      expect(output.items).toHaveLength(1);
      expect(output.items[0]?.key).toBe(`${config.name.toLowerCase().replace(/\W+/g, "-")}-e2e`);
      expect(output.items[0]?.verdict).toMatch(/^(low_quality|high_quality|uncertain)$/);
      expect(output.items[0]?.reason.length).toBeGreaterThan(0);
      expect(detectProvider(apiBase)).toMatch(/^(anthropic|openai-compatible)$/);
    });
  }
});
