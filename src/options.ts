import { getOptionalPermissionOrigin } from "./lib/provider";
import { activeRuleCount, formatDuration } from "./lib/rules";
import { getAiStatus, getSecrets, getSettings, saveSettings } from "./lib/storage";
import type { CleanFeedSettings } from "./lib/types";

const aiEnabled = document.querySelector<HTMLInputElement>("#aiEnabled");
const apiBase = document.querySelector<HTMLInputElement>("#apiBase");
const apiKey = document.querySelector<HTMLInputElement>("#apiKey");
const model = document.querySelector<HTMLInputElement>("#model");
const feedbackEnabled = document.querySelector<HTMLInputElement>("#feedbackEnabled");
const feedbackAction = document.querySelector<HTMLSelectElement>("#feedbackAction");
const userBrief = document.querySelector<HTMLTextAreaElement>("#userBrief");
const saveAiButton = document.querySelector<HTMLButtonElement>("#saveAi");
const testAiButton = document.querySelector<HTMLButtonElement>("#testAi");
const saveFeedbackButton = document.querySelector<HTMLButtonElement>("#saveFeedback");
const generateConfigButton = document.querySelector<HTMLButtonElement>("#generateConfig");
const generatedSummary = document.querySelector<HTMLElement>("#generatedSummary");
const rulesView = document.querySelector<HTMLElement>("#rulesView");
const reviewerView = document.querySelector<HTMLElement>("#reviewerView");
const statusElement = document.querySelector<HTMLElement>("#status");

void init();

async function init() {
  await render();

  saveAiButton?.addEventListener("click", async () => {
    await saveAiConfigFromForm();
  });

  testAiButton?.addEventListener("click", async () => {
    await saveAiConfigFromForm();
    await sendBackgroundMessage({ type: "cleanfeed:test-ai" });
    await render();
  });

  saveFeedbackButton?.addEventListener("click", async () => {
    await saveFeedbackConfigFromForm();
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

  if (aiEnabled) {
    aiEnabled.checked = settings.ai.enabled;
  }

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

  if (feedbackEnabled) {
    feedbackEnabled.checked = settings.feedback.enabled;
  }

  if (feedbackAction) {
    feedbackAction.value = settings.feedback.preferredAction;
  }

  if (userBrief) {
    userBrief.value = settings.ai.userBrief;
  }

  renderGeneratedConfig(settings);
  setStatus(`${aiStatus.message} · ${activeRuleCount(settings.rules)} 条程序化规则启用`);
}

async function saveAiConfigFromForm() {
  const current = await getSettings();
  const nextAi: CleanFeedSettings["ai"] = {
    ...current.ai,
    enabled: aiEnabled?.checked === true,
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

  setStatus("AI 连接配置已保存");
}

async function saveFeedbackConfigFromForm() {
  const current = await getSettings();
  await saveSettings({
    ...current,
    feedback: {
      ...current.feedback,
      enabled: feedbackEnabled?.checked === true,
      preferredAction: feedbackAction?.value === "dislike" ? "dislike" : "not_interested"
    }
  });

  setStatus(feedbackEnabled?.checked ? "平台反馈已启用" : "平台反馈已关闭");
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
  [saveAiButton, testAiButton, saveFeedbackButton, generateConfigButton].forEach((button) => {
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
