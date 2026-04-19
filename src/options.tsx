import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { getOptionalPermissionOrigin } from "./lib/provider";
import { activeRuleCount } from "./lib/rules";
import { getAiStatus, getSecrets, getSettings, getUiState, saveSettings, saveUiState } from "./lib/storage";
import type { AiStatus, CleanFeedSettings, CleanFeedUiState } from "./lib/types";
import { AirySettings, FirstRunFlow } from "./ui/airy";

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

function OptionsApp() {
  const [settings, setSettings] = useState<CleanFeedSettings | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [uiState, setUiState] = useState<CleanFeedUiState | null>(null);
  const [hasAiKey, setHasAiKey] = useState(false);
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

    setStatus(nextSettings.ai.enabled ? nextAiStatus.message : "AI 未连接");
  }, [preferenceDirty]);

  useEffect(() => {
    void loadState();

    const handleStorageChange = () => {
      void loadState();
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [loadState]);

  const ruleCount = useMemo(() => activeRuleCount(settings?.rules || []), [settings]);

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

  const generateConfigStrict = useCallback(
    async (briefOverride?: string) => {
      const safeBrief = (briefOverride ?? preference).trim();
      if (!safeBrief) {
        throw new Error("先写一句偏好");
      }

      setBusy(true);
      setStatus("正在生成正则规则");

      try {
        const state = await sendRuntimeMessage<RuntimeState>({
          type: "cleanfeed:generate-config",
          brief: safeBrief
        });
        applyRuntimeState(state);
        setPreferenceDirty(false);
        setStatus(state.aiStatus.message);
      } finally {
        setBusy(false);
      }
    },
    [applyRuntimeState, preference]
  );

  const generateConfig = async () => {
    try {
      await generateConfigStrict();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const completeOnboarding = async () => {
    const nextUiState = { onboardingDone: true };
    await saveUiState(nextUiState);
    setUiState(nextUiState);
    await loadState();
  };

  const resetOnboarding = async () => {
    const nextUiState = { onboardingDone: false };
    await saveUiState(nextUiState);
    setUiState(nextUiState);
  };

  const toggleShorts = async (enabled: boolean) => {
    const current = await getSettings();
    const nextSettings = {
      ...current,
      shorts: { enabled }
    };
    await saveSettings(nextSettings);
    setSettings(nextSettings);
    setStatus("设置已更新");
  };

  const toggleFeedback = async (enabled: boolean) => {
    const current = await getSettings();
    const nextSettings = {
      ...current,
      feedback: {
        ...current.feedback,
        enabled
      }
    };
    await saveSettings(nextSettings);
    setSettings(nextSettings);
    setStatus("设置已更新");
  };

  if (!settings || !aiStatus || !uiState) {
    return (
      <div className="settings-root noise">
        <div className="dawn-bg" />
        <p className="settings-status">{status}</p>
      </div>
    );
  }

  if (onboardingActive) {
    return (
      <div className="first-run-page noise">
        <div className="dawn-bg" />
        <FirstRunFlow
          hasAiKey={hasAiKey}
          initialApiBase={settings.ai.apiBase}
          initialModel={settings.ai.model}
          initialPreference={settings.ai.userBrief}
          onDone={() => void completeOnboarding()}
          onGenerate={generateConfigStrict}
          onSkip={() => void completeOnboarding()}
          onTestConnection={testAiConnection}
        />
      </div>
    );
  }

  return (
    <AirySettings
      aiStatus={aiStatus}
      busy={busy}
      hasAiKey={hasAiKey}
      preference={preference}
      ruleCount={ruleCount}
      settings={settings}
      status={status}
      onGenerateConfig={generateConfig}
      onPreferenceChange={(nextPreference) => {
        setPreference(nextPreference);
        setPreferenceDirty(true);
      }}
      onResetOnboarding={resetOnboarding}
      onSaveAiConfig={saveAiDraft}
      onTestAiConnection={testAiConnection}
      onToggleFeedback={toggleFeedback}
      onToggleShorts={toggleShorts}
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
  throw new Error("Clean Feed options root not found");
}

createRoot(rootElement).render(<OptionsApp />);
