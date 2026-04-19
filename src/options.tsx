import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { getOptionalPermissionOrigin } from "./lib/provider";
import { activeRuleCount } from "./lib/rules";
import { getAiStatus, getSecrets, getSettings, saveSettings } from "./lib/storage";
import type { AiStatus, CleanFeedSettings } from "./lib/types";
import {
  DownloadIcon,
  FeedbackIcon,
  GlobeIcon,
  LogoIcon,
  RefreshIcon,
  ShieldIcon,
  SlidersIcon,
  SparkIcon,
  VideoIcon
} from "./ui/icons";

type SectionId = "ai" | "review" | "rules" | "scope" | "history" | "export";

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

type AiFormState = {
  apiBase: string;
  apiKey: string;
  model: string;
};

const initialAiForm: AiFormState = {
  apiBase: "",
  apiKey: "",
  model: ""
};

function OptionsApp() {
  const [section, setSection] = useState<SectionId>("ai");
  const [settings, setSettings] = useState<CleanFeedSettings | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [hasAiKey, setHasAiKey] = useState(false);
  const [aiForm, setAiForm] = useState<AiFormState>(initialAiForm);
  const [brief, setBrief] = useState("");
  const [briefDirty, setBriefDirty] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("读取设置中...");

  const applyRuntimeState = useCallback(
    (state: RuntimeState, resetForm = true) => {
      setSettings(state.settings);
      setAiStatus(state.aiStatus);
      setHasAiKey(state.hasAiKey);

      if (!briefDirty) {
        setBrief(state.settings.ai.userBrief);
      }

      if (resetForm) {
        setAiForm({
          apiBase: state.settings.ai.apiBase,
          apiKey: "",
          model: state.settings.ai.model
        });
      }
    },
    [briefDirty]
  );

  const loadState = useCallback(async () => {
    const [nextSettings, secrets, nextAiStatus] = await Promise.all([getSettings(), getSecrets(), getAiStatus()]);
    setSettings(nextSettings);
    setAiStatus(nextAiStatus);
    setHasAiKey(Boolean(secrets.aiApiKey));

    if (!briefDirty) {
      setBrief(nextSettings.ai.userBrief);
    }

    if (!connectionOpen) {
      setAiForm({
        apiBase: nextSettings.ai.apiBase,
        apiKey: "",
        model: nextSettings.ai.model
      });
    }

    setStatus(nextSettings.ai.enabled ? nextAiStatus.message : "AI 未连接");
  }, [briefDirty, connectionOpen]);

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
    async (createNext: (current: CleanFeedSettings) => CleanFeedSettings) => {
      if (!settings) {
        return;
      }

      const nextSettings = createNext(settings);
      setSettings(nextSettings);
      await saveSettings(nextSettings);
      setStatus(nextSettings.enabled ? "设置已更新" : "Clean Feed 已暂停");
    },
    [settings]
  );

  const saveAiConfigFromForm = async ({ closeAfterSave = true, silent = false } = {}) => {
    if (!settings) {
      return null;
    }

    const nextAi: CleanFeedSettings["ai"] = {
      ...settings.ai,
      enabled: true,
      apiBase: aiForm.apiBase.trim() || settings.ai.apiBase,
      model: aiForm.model.trim() || settings.ai.model,
      userBrief: brief.trim() || settings.ai.userBrief
    };
    const nextApiKey = aiForm.apiKey.trim();

    await requestApiBasePermission(nextAi.apiBase);

    const request: Record<string, unknown> = {
      type: "cleanfeed:save-ai-config",
      ai: nextAi
    };
    if (nextApiKey) {
      request.apiKey = nextApiKey;
    }

    const state = await sendRuntimeMessage<RuntimeState>(request);
    applyRuntimeState(state);

    if (closeAfterSave) {
      setConnectionOpen(false);
    }

    if (!silent) {
      setStatus("AI 连接配置已保存");
    }

    return state;
  };

  const testAiConnection = async () => {
    setBusy(true);
    setStatus("正在测试 AI 连接");

    try {
      await saveAiConfigFromForm({ closeAfterSave: false, silent: true });
      const state = await sendRuntimeMessage<RuntimeState>({ type: "cleanfeed:test-ai" });
      applyRuntimeState(state);
      setStatus(state.aiStatus.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const generateConfig = async () => {
    const safeBrief = brief.trim();
    if (!safeBrief) {
      setStatus("先写一句偏好");
      return;
    }

    setBusy(true);
    setStatus("正在生成正则规则");

    try {
      const state = await sendRuntimeMessage<RuntimeState>({
        type: "cleanfeed:generate-config",
        brief: safeBrief
      });
      applyRuntimeState(state);
      setBriefDirty(false);
      setSection("rules");
      setStatus(state.aiStatus.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return (
      <main className="settings-shell noise" aria-label="Clean Feed 高级设置">
        <div className="dawn-bg" aria-hidden="true" />
        <section className="settings-detail scroll">
          <p className="status-line" role="status">
            {status}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="settings-shell noise" aria-label="Clean Feed 高级设置">
      <div className="dawn-bg" aria-hidden="true" />
      <aside className="settings-nav">
        <div className="nav-brand">
          <div className="brand-mark" aria-hidden="true">
            <LogoIcon />
          </div>
          <div>
            <strong>Clean Feed</strong>
            <span>高级设置</span>
          </div>
        </div>

        <span className="nav-label">AI</span>
        <NavItem
          active={section === "ai"}
          count={undefined}
          icon={<SparkIcon />}
          label="模型连接"
          onClick={() => setSection("ai")}
        />
        <NavItem
          active={section === "review"}
          count={undefined}
          icon={<ShieldIcon />}
          label="生成策略"
          onClick={() => setSection("review")}
        />

        <span className="nav-label">规则</span>
        <NavItem
          active={section === "rules"}
          count={ruleCount}
          icon={<SlidersIcon />}
          label="规则详情"
          onClick={() => setSection("rules")}
        />
        <NavItem
          active={section === "scope"}
          count={undefined}
          icon={<GlobeIcon />}
          label="开关"
          onClick={() => setSection("scope")}
        />

        <span className="nav-label">数据</span>
        <NavItem
          active={section === "history"}
          count={undefined}
          icon={<RefreshIcon />}
          label="历史 / 日志"
          onClick={() => setSection("history")}
        />
        <NavItem
          active={section === "export"}
          count={undefined}
          icon={<DownloadIcon />}
          label="导入 / 导出"
          onClick={() => setSection("export")}
        />

        <small className="version">v0.5 · 仅本地</small>
      </aside>

      <section className="settings-detail scroll">
        {section === "ai" ? (
          <section className="detail-section is-active">
            <header className="section-head">
              <h1>模型连接</h1>
            </header>
            <div className="glass-thin ai-card">
              <span className={`status-dot${settings.ai.enabled && aiStatus?.state !== "error" ? " is-ready" : ""}`} />
              <div>
                <strong>
                  {formatProviderLabel(settings.ai.apiBase)} · {formatModelLabel(settings.ai.model)}
                </strong>
                <span>{settings.ai.apiBase}</span>
              </div>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setConnectionOpen(true)}>
                编辑
              </button>
            </div>
          </section>
        ) : null}

        {section === "review" ? (
          <section className="detail-section is-active">
            <header className="section-head">
              <h1>生成策略</h1>
              <p>用自然语言描述，AI 只生成规则解释和正则表达式。</p>
            </header>
            <div className="glass-thin composer-card">
              <label className="label" htmlFor="userBrief">
                偏好
              </label>
              <textarea
                id="userBrief"
                className="textarea"
                rows={8}
                maxLength={600}
                placeholder="屏蔽短平快、标题党、低质量娱乐八卦、重复搬运；保留长视频、教程、深度分析、技术内容。"
                value={brief}
                onChange={(event) => {
                  setBrief(event.currentTarget.value);
                  setBriefDirty(true);
                }}
              />
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void generateConfig()}>
                {busy ? "生成中" : "生成正则规则"}
              </button>
            </div>
          </section>
        ) : null}

        {section === "rules" ? (
          <section className="detail-section is-active">
            <header className="section-head">
              <h1>规则详情</h1>
              <p>规则由 AI 从偏好生成；每条规则只有解释和正则。</p>
            </header>
            <div className="rules-list glass-thin">
              {settings.rules.length > 0 ? (
                settings.rules.map((rule) => (
                  <div className="rule-row" key={rule.id}>
                    <span className="rule-kind">REGEX</span>
                    <span className="rule-explanation">{rule.explanation}</span>
                    <code className="rule-pattern">{rule.pattern}</code>
                  </div>
                ))
              ) : (
                <div className="rule-row">还没有规则</div>
              )}
            </div>
          </section>
        ) : null}

        {section === "scope" ? (
          <section className="detail-section is-active">
            <header className="section-head">
              <h1>开关</h1>
            </header>
            <div className="scope-stack">
              <ScopeRow
                checked={settings.shorts.enabled}
                description="Shorts / Bilibili 短视频流"
                icon={<VideoIcon />}
                label="屏蔽短视频"
                onChange={(enabled) =>
                  updateSettings((current) => ({
                    ...current,
                    shorts: { enabled }
                  }))
                }
              />
              <ScopeRow
                checked={settings.feedback.enabled}
                description="自动点击不感兴趣 / 点踩"
                icon={<FeedbackIcon />}
                label="平台反馈"
                onChange={(enabled) =>
                  updateSettings((current) => ({
                    ...current,
                    feedback: {
                      ...current.feedback,
                      enabled
                    }
                  }))
                }
              />
            </div>
          </section>
        ) : null}

        {section === "history" ? (
          <section className="detail-section is-active">
            <header className="section-head">
              <h1>历史 / 日志</h1>
              <p>v1 暂不记录历史；过滤动作只在当前页面即时执行。</p>
            </header>
            <div className="empty glass-thin">No local history yet.</div>
          </section>
        ) : null}

        {section === "export" ? (
          <section className="detail-section is-active">
            <header className="section-head">
              <h1>导入 / 导出</h1>
            </header>
            <div className="empty glass-thin">Coming soon.</div>
          </section>
        ) : null}

        <p className="status-line" role="status">
          {status}
        </p>
      </section>

      {connectionOpen ? (
        <div className="dialog-layer">
          <dialog className="dialog" open>
            <form className="glass" onSubmit={(event) => event.preventDefault()}>
              <header className="dialog-head">
                <h2>连接 AI</h2>
                <button className="close-btn" type="button" aria-label="关闭" onClick={() => setConnectionOpen(false)}>
                  ×
                </button>
              </header>
              <label className="label" htmlFor="apiBase">
                API Base
              </label>
              <input
                id="apiBase"
                className="input"
                type="url"
                spellCheck={false}
                placeholder="https://openrouter.ai/api/v1"
                value={aiForm.apiBase}
                onChange={(event) => setAiForm((current) => ({ ...current, apiBase: event.currentTarget.value }))}
              />
              <label className="label" htmlFor="apiKey">
                API Key
              </label>
              <input
                id="apiKey"
                className="input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={hasAiKey ? "已保存，留空则继续使用当前 Key" : "sk-..."}
                value={aiForm.apiKey}
                onChange={(event) => setAiForm((current) => ({ ...current, apiKey: event.currentTarget.value }))}
              />
              <label className="label" htmlFor="model">
                Model
              </label>
              <input
                id="model"
                className="input"
                type="text"
                spellCheck={false}
                placeholder="anthropic/claude-haiku-4-5"
                value={aiForm.model}
                onChange={(event) => setAiForm((current) => ({ ...current, model: event.currentTarget.value }))}
              />
              <footer className="dialog-actions">
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void testAiConnection()}>
                  测试
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    saveAiConfigFromForm()
                      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
                      .finally(() => setBusy(false));
                  }}
                >
                  保存
                </button>
              </footer>
            </form>
          </dialog>
        </div>
      ) : null}
    </main>
  );
}

function NavItem({
  active,
  count,
  icon,
  label,
  onClick
}: {
  active: boolean;
  count: number | undefined;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item${active ? " is-active" : ""}`} type="button" aria-pressed={active} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {typeof count === "number" ? <em>{count}</em> : null}
    </button>
  );
}

function ScopeRow({
  checked,
  description,
  icon,
  label,
  onChange
}: {
  checked: boolean;
  description: string;
  icon: ReactNode;
  label: string;
  onChange: (checked: boolean) => Promise<void>;
}) {
  return (
    <label className={`scope-row glass-thin${checked ? " is-on" : ""}`}>
      {icon}
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input checked={checked} type="checkbox" aria-label={label} onChange={(event) => void onChange(event.currentTarget.checked)} />
    </label>
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

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Clean Feed options root not found");
}

createRoot(rootElement).render(<OptionsApp />);
