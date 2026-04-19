import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { activeRuleCount } from "./lib/rules";
import { getAiStatus, getSettings, saveSettings } from "./lib/storage";
import type { AiStatus, CleanFeedSettings } from "./lib/types";
import {
  FeedbackIcon,
  HomeIcon,
  LogoIcon,
  PencilIcon,
  SettingsIcon,
  ShieldIcon,
  SparkIcon,
  TuneIcon,
  VideoIcon
} from "./ui/icons";

type PopupView = "home" | "edit" | "plan";

type RuntimeResponse<T> = {
  error?: string;
  ok?: boolean;
  payload?: T;
};

const preferenceChips = ["少点娱乐八卦", "保留深度讲解", "屏蔽游戏解说", "不看新闻"];

function PopupApp() {
  const [settings, setSettings] = useState<CleanFeedSettings | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [view, setView] = useState<PopupView>("home");
  const [brief, setBrief] = useState("");
  const [briefDirty, setBriefDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("读取设置中...");

  const loadState = useCallback(async () => {
    const [nextSettings, nextAiStatus] = await Promise.all([getSettings(), getAiStatus()]);
    setSettings(nextSettings);
    setAiStatus(nextAiStatus);

    if (!briefDirty) {
      setBrief(nextSettings.ai.userBrief);
    }

    setStatus(nextSettings.enabled ? "净化中" : "已暂停");
  }, [briefDirty]);

  useEffect(() => {
    void loadState();

    const handleStorageChange = () => {
      void loadState();
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [loadState]);

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

  const toggleEnabled = async (enabled: boolean) => {
    await updateSettings((current) => ({ ...current, enabled }), enabled ? "净化中" : "已暂停");
  };

  const toggleShorts = async (enabled: boolean) => {
    await updateSettings((current) => ({ ...current, shorts: { enabled } }));
  };

  const toggleFeedback = async (enabled: boolean) => {
    await updateSettings((current) => ({
      ...current,
      feedback: {
        ...current.feedback,
        enabled
      }
    }));
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const generatePlan = async () => {
    const safeBrief = brief.trim();
    if (!safeBrief) {
      setStatus("先写一句偏好");
      return;
    }

    setBusy(true);
    setStatus("正在生成净化方案");

    try {
      await sendRuntimeMessage({ type: "cleanfeed:generate-config", brief: safeBrief });
      setBriefDirty(false);
      setView("plan");
      await loadState();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return (
      <main className="popup-shell noise" aria-label="Clean Feed">
        <div className="dawn-bg" aria-hidden="true" />
        <section className="popup-content">
          <header className="topbar">
            <div className="brand-mark" aria-hidden="true">
              <LogoIcon />
            </div>
            <div className="brand-name">Clean Feed</div>
          </header>
          <p className="status-line" role="status">
            {status}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="popup-shell noise" aria-label="Clean Feed">
      <div className="dawn-bg" aria-hidden="true" />
      <section className="popup-content">
        <header className="topbar">
          <div className="brand-mark" aria-hidden="true">
            <LogoIcon />
          </div>
          <div className="brand-name">Clean Feed</div>

          <nav className="tabbar" aria-label="视图">
            <TabButton active={view === "home"} label="概览" onClick={() => setView("home")}>
              <HomeIcon />
            </TabButton>
            <TabButton active={view === "edit"} label="编辑偏好" onClick={() => setView("edit")}>
              <PencilIcon />
            </TabButton>
            <TabButton active={view === "plan"} label="当前方案" onClick={() => setView("plan")}>
              <ShieldIcon />
            </TabButton>
          </nav>

          <button className="icon-btn" type="button" aria-label="高级设置" title="高级设置" onClick={openOptions}>
            <SettingsIcon />
          </button>

          <label className="switch" title="启用净化">
            <input
              checked={settings.enabled}
              type="checkbox"
              aria-label="启用净化"
              onChange={(event) => void toggleEnabled(event.currentTarget.checked)}
            />
            <span />
          </label>
        </header>

        {view === "home" ? (
          <section className="view is-active">
            <div className="glass hero-card">
              <div className="hero-line">
                <strong>{ruleCount}</strong>
                <span>条正则规则</span>
                <span className="llm-pill">
                  <i />
                  {formatAiState(settings.ai.enabled, aiStatus?.state || "idle")}
                </span>
              </div>
              <div className="breakdown" aria-hidden="true">
                <span style={{ width: "55%" }} />
                <span style={{ width: "30%" }} />
                <span style={{ width: "15%" }} />
              </div>
              <div className="legend">
                <span>● Regex</span>
                <span>● Feedback</span>
                <span>● Shorts</span>
              </div>
            </div>

            <div className="toggle-stack">
              <ToggleRow
                checked={settings.shorts.enabled}
                icon={<VideoIcon />}
                label="屏蔽短视频"
                onChange={toggleShorts}
              />
              <ToggleRow
                checked={settings.feedback.enabled}
                icon={<FeedbackIcon />}
                label="平台反馈"
                onChange={toggleFeedback}
              />
            </div>

            <div className="bottom-actions">
              <button className="btn btn-primary" type="button" onClick={() => setView("edit")}>
                <SparkIcon />
                改写偏好
              </button>
              <button className="icon-btn" type="button" aria-label="当前方案" title="当前方案" onClick={() => setView("plan")}>
                <ShieldIcon />
              </button>
            </div>
          </section>
        ) : null}

        {view === "edit" ? (
          <section className="view is-active">
            <div className="view-head">
              <span>你想过滤什么</span>
              <small>{brief.length} / 300</small>
            </div>
            <textarea
              className="textarea"
              rows={9}
              maxLength={300}
              placeholder="一句话就好..."
              value={brief}
              onChange={(event) => {
                setBrief(event.currentTarget.value);
                setBriefDirty(true);
              }}
            />
            <div className="chips" aria-label="快速偏好">
              {preferenceChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setBrief((current) => [current.trim(), chip].filter(Boolean).join("\n"));
                    setBriefDirty(true);
                  }}
                >
                  + {chip}
                </button>
              ))}
            </div>
            <button className="btn btn-primary full" type="button" disabled={busy} onClick={() => void generatePlan()}>
              <SparkIcon />
              {busy ? "生成中" : "生成净化方案"}
            </button>
          </section>
        ) : null}

        {view === "plan" ? (
          <section className="view is-active">
            <div className="view-head">
              <span>当前方案</span>
              <small>{ruleCount} 条规则</small>
            </div>
            <div className="plan-list scroll">
              {settings.rules.length > 0 ? (
                settings.rules.map((rule) => (
                  <div className="plan-row" key={rule.id}>
                    <span className="plan-icon">R</span>
                    <span className="plan-text">{rule.explanation}</span>
                    <code>{rule.pattern}</code>
                  </div>
                ))
              ) : (
                <div className="plan-row">还没有规则</div>
              )}
            </div>
            <button className="btn btn-ghost full" type="button" onClick={openOptions}>
              <TuneIcon />
              打开高级设置
            </button>
          </section>
        ) : null}

        <p className="status-line" role="status">
          {status}
        </p>
      </section>
    </main>
  );
}

function TabButton({
  active,
  children,
  label,
  onClick
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`tab${active ? " is-active" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  checked,
  icon,
  label,
  onChange
}: {
  checked: boolean;
  icon: ReactNode;
  label: string;
  onChange: (checked: boolean) => Promise<void>;
}) {
  return (
    <label className={`toggle-row${checked ? " is-on" : ""}`}>
      {icon}
      <span>{label}</span>
      <input
        checked={checked}
        type="checkbox"
        aria-label={label}
        onChange={(event) => void onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

async function sendRuntimeMessage<T = unknown>(message: Record<string, unknown>): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>;

  if (!response?.ok) {
    throw new Error(response?.error || "Clean Feed background request failed");
  }

  return response.payload as T;
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

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Clean Feed popup root not found");
}

createRoot(rootElement).render(<PopupApp />);
