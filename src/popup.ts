import { activeRuleCount } from "./lib/rules";
import { getAiStatus, getSettings, saveSettings } from "./lib/storage";
import type { AiStatus, CleanFeedSettings } from "./lib/types";

const enabledInput = document.querySelector<HTMLInputElement>("#enabled");
const shortsToggle = document.querySelector<HTMLInputElement>("#shorts-toggle");
const feedbackToggle = document.querySelector<HTMLInputElement>("#feedback-toggle");
const rulesCount = document.querySelector<HTMLElement>("#rules-count");
const aiState = document.querySelector<HTMLElement>("#ai-state");
const statusElement = document.querySelector<HTMLElement>("#status");
const openOptionsButton = document.querySelector<HTMLButtonElement>("#open-options");
const openOptionsPlanButton = document.querySelector<HTMLButtonElement>("#open-options-plan");
const popupBrief = document.querySelector<HTMLTextAreaElement>("#popupBrief");
const popupGenerate = document.querySelector<HTMLButtonElement>("#popupGenerate");
const briefCount = document.querySelector<HTMLElement>("#brief-count");
const planCount = document.querySelector<HTMLElement>("#plan-count");
const planList = document.querySelector<HTMLElement>("#plan-list");

void init();

async function init() {
  bindViews();
  bindSettingsControls();
  bindPreferenceControls();
  await render();

  chrome.storage.onChanged.addListener(() => {
    void render();
  });
}

function bindViews() {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view || "home"));
  });

  document.querySelector<HTMLButtonElement>("#go-edit")?.addEventListener("click", () => setView("edit"));
  document.querySelector<HTMLButtonElement>("#go-plan")?.addEventListener("click", () => setView("plan"));
}

function bindSettingsControls() {
  enabledInput?.addEventListener("change", async () => {
    const settings = await getSettings();
    await saveSettings({ ...settings, enabled: enabledInput.checked });
    setStatus(enabledInput.checked ? "净化中" : "已暂停");
    await render();
  });

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

  [openOptionsButton, openOptionsPlanButton].forEach((button) => {
    button?.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  });
}

function bindPreferenceControls() {
  popupBrief?.addEventListener("input", () => updateBriefCount());

  document.querySelectorAll<HTMLButtonElement>("[data-chip]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!popupBrief) {
        return;
      }

      const chip = button.dataset.chip || "";
      popupBrief.value = [popupBrief.value.trim(), chip].filter(Boolean).join("\n");
      updateBriefCount();
    });
  });

  popupGenerate?.addEventListener("click", async () => {
    const brief = popupBrief?.value.trim() || "";
    setBusy(true);

    try {
      await sendBackgroundMessage({ type: "cleanfeed:generate-config", brief });
      setView("plan");
      await render();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  });
}

async function render() {
  const [settings, aiStatus] = await Promise.all([getSettings(), getAiStatus()]);

  if (enabledInput) {
    enabledInput.checked = settings.enabled;
  }

  if (shortsToggle) {
    shortsToggle.checked = settings.shorts.enabled;
    shortsToggle.closest(".toggle-row")?.classList.toggle("is-on", settings.shorts.enabled);
  }

  if (feedbackToggle) {
    feedbackToggle.checked = settings.feedback.enabled;
    feedbackToggle.closest(".toggle-row")?.classList.toggle("is-on", settings.feedback.enabled);
  }

  if (rulesCount) {
    rulesCount.textContent = String(activeRuleCount(settings.rules));
  }

  if (aiState) {
    aiState.textContent = formatAiState(settings.ai.enabled, aiStatus.state);
  }

  if (popupBrief && document.activeElement !== popupBrief) {
    popupBrief.value = settings.ai.userBrief;
  }

  updateBriefCount();
  renderPlan(settings);
  setStatus(settings.enabled ? "净化中" : "已暂停");
}

function renderPlan(settings: CleanFeedSettings) {
  if (planCount) {
    planCount.textContent = `${activeRuleCount(settings.rules)} 条规则`;
  }

  if (!planList) {
    return;
  }

  const rows = settings.rules.map((rule) => {
    const row = document.createElement("div");
    row.className = "plan-row";

    const icon = document.createElement("span");
    icon.className = "plan-icon";
    icon.textContent = "R";

    const text = document.createElement("span");
    text.className = "plan-text";
    text.textContent = rule.explanation;

    const pattern = document.createElement("code");
    pattern.textContent = rule.pattern;

    row.append(icon, text, pattern);
    return row;
  });

  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "plan-row";
    empty.textContent = "还没有规则";
    planList.replaceChildren(empty);
    return;
  }

  planList.replaceChildren(...rows);
}

async function sendBackgroundMessage(message: Record<string, unknown>) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Clean Feed background request failed");
  }
  return response.payload;
}

function setView(view: string) {
  document.querySelectorAll<HTMLElement>("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
}

function updateBriefCount() {
  if (briefCount && popupBrief) {
    briefCount.textContent = `${popupBrief.value.length} / 300`;
  }
}

function setBusy(isBusy: boolean) {
  if (popupGenerate) {
    popupGenerate.disabled = isBusy;
  }
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
      return "LLM powered";
    case "working":
      return "RUN";
    case "error":
      return "ERR";
    default:
      return "ON";
  }
}
