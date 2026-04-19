import { activeRuleCount } from "./lib/rules";
import { getAiStatus, getSettings, saveSettings } from "./lib/storage";

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
    enabledLabel.textContent = settings.enabled ? "正在过滤 YouTube 和 Bilibili" : "已暂停";
  }

  if (rulesCount) {
    rulesCount.textContent = `${activeRuleCount(settings.rules)} 条启用`;
  }

  if (aiState) {
    aiState.textContent = settings.ai.enabled ? aiStatus.message : "未启用";
  }

  setStatus(settings.ai.generatedSummary);
}

function setStatus(message: string) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}
