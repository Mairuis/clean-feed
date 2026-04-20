import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { getOptionalPermissionOrigin } from "./lib/provider";
import { activeRuleCount } from "./lib/rules";
import { getAiStatus, getSecrets, getSettings, getUiState, saveSettings, saveUiState } from "./lib/storage";
import type { AiStatus, CleanFeedSettings, CleanFeedUiState } from "./lib/types";
import { AiryPopup, FirstRunFlow } from "./ui/airy";

type PopupView = "home" | "edit" | "plan";

type AiConnectionDraft = {
  apiBase: string;
  apiKey: string;
  model: string;
};

type RuntimeState = {
  aiStatus: AiStatus;
  hasAiKey: boolean;
  settings: CleanFeedSettings;
};

type RuntimeResponse<T> = {
  error?: string;
  ok?: boolean;
  payload?: T;
};

function PopupApp() {
  const [settings, setSettings] = useState<CleanFeedSettings | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [uiState, setUiState] = useState<CleanFeedUiState | null>(null);
  const [hasAiKey, setHasAiKey] = useState(false);
  const [view, setView] = useState<PopupView>("home");
  const [preference, setPreference] = useState("");
  const [preferenceDirty, setPreferenceDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("读取设置中...");

  const onboardingActive = uiState ? !uiState.onboardingDone : false;

  const applyRuntimeState = useCallback(
    (state: RuntimeState) => {
      setSettings(state.settings);
      setAiStatus(state.aiStatus);
      setHasAiKey(state.hasAiKey);

      if (!preferenceDirty) {
        setPreference(state.settings.ai.userBrief);
      }
    },
    [preferenceDirty]
  );

  const loadState = useCallback(async () => {
    const [nextSettings, nextAiStatus, nextUiState, secrets] = await Promise.all([
      getSettings(),
      getAiStatus(),
      getUiState(),
      getSecrets()
    ]);

    setSettings(nextSettings);
    setAiStatus(nextAiStatus);
    setUiState(nextUiState);
    setHasAiKey(Boolean(secrets.aiApiKey));

    if (!preferenceDirty) {
      setPreference(nextSettings.ai.userBrief);
    }

    setStatus(nextSettings.enabled ? "净化中" : "已暂停");
  }, [preferenceDirty]);

  useEffect(() => {
    void loadState();

    const handleStorageChange = () => {
      void loadState();
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [loadState]);

  useEffect(() => {
    document.body.classList.toggle("cf-onboarding", onboardingActive);
    return () => document.body.classList.remove("cf-onboarding");
  }, [onboardingActive]);

  const ruleCount = useMemo(() => activeRuleCount(settings?.rules || []), [settings]);

  const updateSettings = useCallback(
    async (createNext: (current: CleanFeedSettings) => CleanFeedSettings, nextStatus?: string) => {
      if (!settings) {
        return;
      }

      const nextSettings = createNext(settings);
      setSettings(nextSettings);
      setStatus(nextStatus || (nextSettings.enabled ? "净化中" : "已暂停"));
      await saveSettings(nextSettings);
    },
    [settings]
  );

  const saveAiDraft = useCallback(
    async (draft: AiConnectionDraft) => {
      const current = await getSettings();
      const nextAi: CleanFeedSettings["ai"] = {
        ...current.ai,
        enabled: true,
        apiBase: draft.apiBase.trim() || current.ai.apiBase,
        model: draft.model.trim() || current.ai.model,
        userBrief: preference.trim() || current.ai.userBrief
      };
      const request: Record<string, unknown> = {
        type: "cleanfeed:save-ai-config",
        ai: nextAi
      };

      if (draft.apiKey.trim()) {
        request.apiKey = draft.apiKey.trim();
      }

      await requestApiBasePermission(nextAi.apiBase);
      const state = await sendRuntimeMessage<RuntimeState>(request);
      applyRuntimeState(state);
      setStatus("AI 连接配置已保存");
    },
    [applyRuntimeState, preference]
  );

  const testAiConnection = useCallback(
    async (draft: AiConnectionDraft) => {
      await saveAiDraft(draft);
      const state = await sendRuntimeMessage<RuntimeState>({ type: "cleanfeed:test-ai" });
      applyRuntimeState(state);
      setStatus(state.aiStatus.message);
    },
    [applyRuntimeState, saveAiDraft]
  );

  const generateConfig = useCallback(
    async (briefOverride?: string) => {
      const safeBrief = (briefOverride ?? preference).trim();
      if (!safeBrief) {
        setStatus("先写一句偏好");
        return;
      }

      setBusy(true);
      setStatus("正在生成净化方案");

      try {
        const state = await sendRuntimeMessage<RuntimeState>({
          type: "cleanfeed:generate-config",
          brief: safeBrief
        });
        applyRuntimeState(state);
        setPreferenceDirty(false);
        setView("plan");
        setStatus(state.aiStatus.message);
      } finally {
        setBusy(false);
      }
    },
    [applyRuntimeState, preference]
  );

  const completeOnboarding = async () => {
    const nextUiState = { onboardingDone: true };
    await saveUiState(nextUiState);
    setUiState(nextUiState);
    setView("home");
    await loadState();
  };

  const skipOnboarding = async () => {
    await completeOnboarding();
    chrome.runtime.openOptionsPage();
  };

  if (!settings || !aiStatus || !uiState) {
    return (
      <div className="popup-root noise">
        <div className="dawn-bg" />
        <p className="popup-status">{status}</p>
      </div>
    );
  }

  if (onboardingActive) {
    return (
      <FirstRunFlow
        hasAiKey={hasAiKey}
        initialApiBase={settings.ai.apiBase}
        initialModel={settings.ai.model}
        initialPreference={settings.ai.userBrief}
        onDone={() => void completeOnboarding()}
        onGenerate={(nextPreference) => generateConfig(nextPreference)}
        onSkip={() => void skipOnboarding()}
        onTestConnection={testAiConnection}
      />
    );
  }

  return (
    <AiryPopup
      aiState={aiStatus.state}
      autoFeedback={settings.feedback.enabled}
      busy={busy}
      enabled={settings.enabled}
      preference={preference}
      ruleCount={ruleCount}
      rules={settings.rules}
      shortsBlock={settings.shorts.enabled}
      status={status}
      view={view}
      onGenerate={() =>
        void generateConfig().catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : String(error));
        })
      }
      onOpenOptions={() => chrome.runtime.openOptionsPage()}
      onPreferenceChange={(nextPreference) => {
        setPreference(nextPreference);
        setPreferenceDirty(true);
      }}
      onToggleEnabled={(enabled) => void updateSettings((current) => ({ ...current, enabled }), enabled ? "净化中" : "已暂停")}
      onToggleFeedback={(enabled) =>
        void updateSettings((current) => ({
          ...current,
          feedback: {
            ...current.feedback,
            enabled
          }
        }))
      }
      onToggleShorts={(enabled) =>
        void updateSettings((current) => ({
          ...current,
          shorts: {
            ...current.shorts,
            enabled
          }
        }))
      }
      onViewChange={setView}
    />
  );
}

async function requestApiBasePermission(base: string) {
  const origin = getOptionalPermissionOrigin(base);

  if (!chrome.permissions?.request) {
    return;
  }

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

async function sendRuntimeMessage<T = unknown>(message: Record<string, unknown>): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>;

  if (!response?.ok) {
    throw new Error(response?.error || "Clean Feed background request failed");
  }

  return response.payload as T;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Clean Feed popup root not found");
}

createRoot(rootElement).render(<PopupApp />);
