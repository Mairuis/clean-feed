# LLM E2E Tests

Clean Feed has a real-provider E2E test for the LLM path used by the extension:

- `createLanguageModel(apiBase, apiKey, model)`
- AI SDK `generateText`
- `Output.object(...)` structured output
- video review style input and verdict output

The test is skipped by default so normal local checks do not spend API credits or require secrets.

## Run

```bash
npm run test:e2e:llm
```

Provider keys are read from environment variables:

```bash
export CLEANFEED_E2E_OPENROUTER_API_KEY="..."
export CLEANFEED_E2E_ANTHROPIC_API_KEY="..."
export CLEANFEED_E2E_GEMINI_API_KEY="..."
export CLEANFEED_E2E_OPENAI_API_KEY="..."
npm run test:e2e:llm
```

## Defaults

| Provider | API Base | Model |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-haiku-4-5` |
| Claude | `https://api.anthropic.com/v1` | `claude-haiku-4-5` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3-flash-preview` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

Each default can be overridden:

```bash
export CLEANFEED_E2E_OPENROUTER_API_BASE="https://openrouter.ai/api/v1"
export CLEANFEED_E2E_OPENROUTER_MODEL="anthropic/claude-haiku-4-5"
```

Do not commit API keys. `.env` files are ignored.
