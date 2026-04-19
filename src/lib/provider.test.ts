import { describe, expect, it } from "vitest";
import { detectProvider, getOptionalPermissionOrigin } from "./provider";

describe("detectProvider", () => {
  it("detects Anthropic API bases", () => {
    expect(detectProvider("https://api.anthropic.com/v1")).toBe("anthropic");
    expect(detectProvider("https://proxy.anthropic.com/v1")).toBe("anthropic");
  });

  it("defaults to OpenAI-compatible providers", () => {
    expect(detectProvider("https://api.openai.com/v1")).toBe("openai-compatible");
    expect(detectProvider("https://llm.example.com/v1")).toBe("openai-compatible");
  });

  it("rejects invalid API bases", () => {
    expect(() => detectProvider("not a url")).toThrow();
  });
});

describe("getOptionalPermissionOrigin", () => {
  it("returns an origin match pattern for Chrome optional host permissions", () => {
    expect(getOptionalPermissionOrigin("https://api.anthropic.com/v1")).toBe("https://api.anthropic.com/*");
  });
});
