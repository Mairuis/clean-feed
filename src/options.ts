import { getOptionalPermissionOrigin } from "./lib/provider";
import { activeRuleCount } from "./lib/rules";
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
const apiBaseView = document.querySelector<HTMLElement>("#apiBaseView");
const aiDot = document.querySelector<HTMLElement>("#aiDot");
const rulesView = document.querySelector<HTMLElement>("#rulesView");
const navRulesCount = document.querySelector<HTMLElement>("#navRulesCount");
const shortsToggle = document.querySelector<HTMLInputElement>("#shortsToggle");
const feedbackToggle = document.querySelector<HTMLInputElement>("#feedbackToggle");
const statusElement = document.querySelector<HTMLElement>("#status");

void init();

async function init() {
  bindNavigation();
  bindAiDialog();
  bindGeneration();
  bindToggles();
  await render();
}

function bindNavigation() {
  document.querySelectorAll<HTMLButtonElement>("[data-section]").forEach((button) => {
    button.addEventListener("click", () => setSection(button.dataset.section || "ai"));
  });
}

function bindAiDialog() {
  openConnectionButton?.addEventListener("click", () => {
    connectionDialog?.showModal();
  });

  closeConnectionButton?.addEventListener("click", () => {
    connectionDialog?.close();
  });

  saveAiButton?.addEventListener("click", async () => {
    await saveAiConfigFromForm();
    connectionDialog?.close();
    await render();
  });

  testAiButton?.addEventListener("click", async () => {
    await saveAiConfigFromForm();
    await sendBackgroundMessage({ type: "cleanfeed:test-ai" });
    await render();
  });
}

function bindGeneration() {
  generateConfigButton?.addEventListener("click", async () => {
    await saveAiConfigFromForm();
    const brief = userBrief?.value.trim() || "";
    await sendBackgroundMessage({ type: "cleanfeed:generate-config", brief });
    setSection("rules");
    await render();
  });
}

function bindToggles() {
  shortsToggle?.addEventListener("change", async () => {
    const settings = await getSettings();
    await saveSettings({ ...settings, shorts: { enabled: shortsToggle.checked } });
    await render();
  });

  feedbackToggle?.addEventListener("change", async () => {
    const settings = await getSettings();
    await saveSettings({
      ...settings,
      feedback: {
        ...settings.feedback,
        enabled: feedbackToggle.checked
      }
    });
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

  if (userBrief && document.activeElement !== userBrief) {
    userBrief.value = settings.ai.userBrief;
  }

  if (connectionState) {
    connectionState.textContent = `${formatProviderLabel(settings.ai.apiBase)} · ${formatModelLabel(settings.ai.model)}`;
  }

  if (apiBaseView) {
    apiBaseView.textContent = settings.ai.apiBase;
  }

  if (aiDot) {
    aiDot.classList.toggle("is-ready", settings.ai.enabled && aiStatus.state !== "error");
  }

  if (shortsToggle) {
    shortsToggle.checked = settings.shorts.enabled;
    shortsToggle.closest(".scope-row")?.classList.toggle("is-on", settings.shorts.enabled);
  }

  if (feedbackToggle) {
    feedbackToggle.checked = settings.feedback.enabled;
    feedbackToggle.closest(".scope-row")?.classList.toggle("is-on", settings.feedback.enabled);
  }

  renderRules(settings);
  setStatus(settings.ai.enabled ? aiStatus.message : "AI 未连接");
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
    ai: nextAi
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

function renderRules(settings: CleanFeedSettings) {
  if (navRulesCount) {
    navRulesCount.textContent = String(activeRuleCount(settings.rules));
  }

  if (!rulesView) {
    return;
  }

  const rows = settings.rules.map((rule) => {
    const row = document.createElement("div");
    row.className = "rule-row";

    const kind = document.createElement("span");
    kind.className = "rule-kind";
    kind.textContent = "REGEX";

    const explanation = document.createElement("span");
    explanation.className = "rule-explanation";
    explanation.textContent = rule.explanation;

    const pattern = document.createElement("code");
    pattern.className = "rule-pattern";
    pattern.textContent = rule.pattern;

    row.append(kind, explanation, pattern);
    return row;
  });

  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rule-row";
    empty.textContent = "还没有规则";
    rulesView.replaceChildren(empty);
    return;
  }

  rulesView.replaceChildren(...rows);
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

function setSection(section: string) {
  document.querySelectorAll<HTMLElement>("[data-section-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.sectionPanel === section);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-section]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.section === section);
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
