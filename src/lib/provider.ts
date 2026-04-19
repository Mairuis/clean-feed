import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type ProviderKind = "anthropic" | "openai-compatible";

export function detectProvider(apiBase: string): ProviderKind {
  const hostname = parseApiBase(apiBase).hostname.replace(/^www\./, "").toLowerCase();

  if (hostname === "api.anthropic.com" || hostname.endsWith(".anthropic.com")) {
    return "anthropic";
  }

  return "openai-compatible";
}

export function getOptionalPermissionOrigin(apiBase: string): string {
  const url = parseApiBase(apiBase);
  return `${url.protocol}//${url.host}/*`;
}

export function createLanguageModel(apiBase: string, apiKey: string, model: string) {
  const kind = detectProvider(apiBase);

  if (kind === "anthropic") {
    return createAnthropic({
      apiKey,
      baseURL: apiBase
    })(model);
  }

  return createOpenAICompatible({
    name: "custom",
    apiKey,
    baseURL: apiBase,
    supportsStructuredOutputs: supportsOpenAICompatibleStructuredOutputs(apiBase)
  })(model);
}

function parseApiBase(apiBase: string): URL {
  const url = new URL(apiBase);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("API Base must start with http:// or https://");
  }

  return url;
}

function supportsOpenAICompatibleStructuredOutputs(apiBase: string): boolean {
  const hostname = parseApiBase(apiBase).hostname.replace(/^www\./, "").toLowerCase();

  return hostname === "api.openai.com" || hostname === "generativelanguage.googleapis.com" || hostname === "openrouter.ai";
}
