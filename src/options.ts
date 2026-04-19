import { getOptionalPermissionOrigin } from "./lib/provider";
import { activeRuleCount, formatDuration } from "./lib/rules";
import { getAiStatus, getSecrets, getSettings, saveSettings } from "./lib/storage";
import type { CleanFeedSettings } from "./lib/types";

const connectionDialog = document.querySelector<HTMLDialogElement>("#connectionDialog");
const openConnectionButton = document.querySelector<HTMLButtonElement>("#openConnection");
const closeConnectionButton = document.querySelector<HTMLButtonElement>("#closeConnection");
const apiBase = document.querySelector<HTMLInputElement>("#apiBase");
const apiKey = document.querySelector<HTMLInputElement>("#apiKey");
const model = document.querySelector<HTMLInputElement>("#model");
const userBrief = document.querySelector<HTMLTextAreaElement>("#userBrief");
const saveAiButton = document.querySelector<HTMLButtonElement>("#saveAi");
const testAiButton = document.querySelector<HTMLButtonElement>("#testAi");
const generateConfigButton = document.querySelector<HTMLButtonElement>("#generateConfig");
const connectionState = document.querySelector<HTMLElement>("#connectionState");
const rulesCount = document.querySelector<HTMLElement>("#rulesCount");
const aiState = document.querySelector<HTMLElement>("#aiState");
const feedbackState = document.querySelector<HTMLElement>("#feedbackState");
const generatedSummary = document.querySelector<HTMLElement>("#generatedSummary");
const rulesView = document.querySelector<HTMLElement>("#rulesView");
const reviewerView = document.querySelector<HTMLElement>("#reviewerView");
const statusElement = document.querySelector<HTMLElement>("#status");

void init();

async function init() {
  await render();

  openConnectionButton?.addEventListener("click", () => {
    connectionDialog?.showModal();
  });

  closeConnectionButton?.addEventListener("click", () => {
    connectionDialog?.close();
  });

  saveAiButton?.addEventListener("click", async () => {
    await saveAiConfigFromForm();
    connectionDialog?.close();
  });

  testAiButton?.addEventListener("click", async () => {
    await saveAiConfigFromForm();
    await sendBackgroundMessage({ type: "cleanfeed:test-ai" });
    await render();
  });

  generateConfigButton?.addEventListener("click", async () => {
    await saveAiConfigFromForm();
    const brief = userBrief?.value.trim() || "";
    await sendBackgroundMessage({ type: "cleanfeed:generate-config", brief });
    await render();
  });
}

async function render() {
  const [settings, secrets, aiStatus] = await Promise.all([getSettings(), getSecrets(), getAiStatus()]);

  if (apiBase) {
    apiBase.value = settings.ai.apiBase;
  }

  if (model) {
    model.value = settings.ai.model;
  }

  if (apiKey) {
    apiKey.value = "";
    apiKey.placeholder = secrets.aiApiKey ? "已保存，留空则继续使用当前 Key" : "sk-...";
  }

  if (userBrief) {
    userBrief.value = settings.ai.userBrief;
  }

  if (connectionState) {
    connectionState.textContent = `${formatProviderLabel(settings.ai.apiBase)} · ${formatModelLabel(settings.ai.model)}`;
  }

  if (rulesCount) {
    rulesCount.textContent = `${activeRuleCount(settings.rules)} 条`;
  }

  if (aiState) {
    aiState.textContent = settings.ai.enabled ? aiStatus.message : "待连接";
  }

  if (feedbackState) {
    feedbackState.textContent = "自动不感兴趣";
  }

  renderGeneratedConfig(settings);
  setStatus(settings.ai.enabled ? aiStatus.message : "连接 OpenRouter 后，输入偏好即可生成净化方案。");
}

async function saveAiConfigFromForm() {
  const current = await getSettings();
  const nextAi: CleanFeedSettings["ai"] = {
    ...current.ai,
    enabled: true,
    apiBase: apiBase?.value.trim() || current.ai.apiBase,
    model: model?.value.trim() || current.ai.model,
    userBrief: userBrief?.value.trim() || current.ai.userBrief
  };
  const nextApiKey = apiKey?.value.trim() || undefined;

  await requestApiBasePermission(nextAi.apiBase);
  await sendBackgroundMessage({
    type: "cleanfeed:save-ai-config",
    ai: nextAi,
    apiKey: nextApiKey
  });

  await saveSettings({
    ...current,
    ai: nextAi,
    feedback: {
      ...current.feedback,
      enabled: true,
      preferredAction: "not_interested"
    }
  });

  setStatus("AI 连接配置已保存");
}

async function requestApiBasePermission(base: string) {
  const origin = getOptionalPermissionOrigin(base);

  await new Promise<void>((resolve, reject) => {
    chrome.permissions.request({ origins: [origin] }, (granted) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!granted) {
        reject(new Error("需要授权 API Base 访问权限后才能调用 AI"));
        return;
      }

      resolve();
    });
  });
}

function renderGeneratedConfig(settings: CleanFeedSettings) {
  if (generatedSummary) {
    generatedSummary.textContent = settings.ai.generatedSummary;
  }

  if (rulesView) {
    rulesView.replaceChildren(
      ...settings.rules.map((rule) => {
        const element = document.createElement("div");
        element.className = "rule-card";

        const title = document.createElement("strong");
        title.textContent = rule.label;

        const detail = document.createElement("span");
        detail.textContent =
          rule.type === "keyword"
            ? `屏蔽词：${rule.value}`
            : `短于 ${formatDuration(rule.thresholdSeconds)} 的视频`;

        element.append(title, detail);
        return element;
      })
    );
  }

  if (reviewerView) {
    reviewerView.textContent = settings.ai.reviewerInstruction;
  }
}

async function sendBackgroundMessage(message: Record<string, unknown>) {
  setBusy(true);

  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
      throw new Error(response?.error || "Clean Feed background request failed");
    }
    return response.payload;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    setStatus(messageText);
    throw error;
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy: boolean) {
  [saveAiButton, testAiButton, generateConfigButton, openConnectionButton].forEach((button) => {
    if (button) {
      button.disabled = isBusy;
    }
  });
}

function setStatus(message: string) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function formatProviderLabel(apiBaseValue: string): string {
  try {
    const hostname = new URL(apiBaseValue).hostname.replace(/^www\./, "");
    if (hostname === "openrouter.ai") {
      return "OpenRouter";
    }

    return hostname;
  } catch {
    return "AI";
  }
}

function formatModelLabel(modelValue: string): string {
  if (modelValue.includes("claude-haiku-4-5")) {
    return "Haiku 4.5";
  }

  return modelValue;
}
