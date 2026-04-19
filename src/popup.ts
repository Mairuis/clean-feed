import { activeRuleCount } from "./lib/rules";
import { getAiStatus, getSettings, saveSettings } from "./lib/storage";
import type { AiStatus } from "./lib/types";

const enabledInput = document.querySelector<HTMLInputElement>("#enabled");
const enabledLabel = document.querySelector<HTMLElement>("#enabled-label");
const rulesCount = document.querySelector<HTMLElement>("#rules-count");
const aiState = document.querySelector<HTMLElement>("#ai-state");
const statusElement = document.querySelector<HTMLElement>("#status");
const openOptionsButton = document.querySelector<HTMLButtonElement>("#open-options");

void init();

async function init() {
  await render();

  enabledInput?.addEventListener("change", async () => {
    const settings = await getSettings();
    await saveSettings({
      ...settings,
      enabled: enabledInput.checked
    });
    setStatus(enabledInput.checked ? "Clean Feed 已启用" : "Clean Feed 已暂停");
    await render();
  });

  openOptionsButton?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.onChanged.addListener(() => {
    void render();
  });
}

async function render() {
  const [settings, aiStatus] = await Promise.all([getSettings(), getAiStatus()]);

  if (enabledInput) {
    enabledInput.checked = settings.enabled;
  }

  if (enabledLabel) {
    enabledLabel.textContent = settings.enabled ? "ON" : "PAUSE";
  }

  if (rulesCount) {
    rulesCount.textContent = String(activeRuleCount(settings.rules));
  }

  if (aiState) {
    aiState.textContent = formatAiState(settings.ai.enabled, aiStatus.state);
  }

  setStatus(settings.enabled ? "净化中" : "已暂停");
}

function setStatus(message: string) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function formatAiState(isEnabled: boolean, state: AiStatus["state"]): string {
  if (!isEnabled) {
    return "OFF";
  }

  switch (state) {
    case "ready":
      return "READY";
    case "working":
      return "RUN";
    case "error":
      return "ERR";
    default:
      return "ON";
  }
}
