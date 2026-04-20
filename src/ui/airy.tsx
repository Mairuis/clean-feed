import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { AiAuditLogEntry, AiCostSummary, AiStatus, CleanFeedRule, CleanFeedSettings } from "../lib/types";

type IconProps = {
  color?: string;
  off?: boolean;
  size?: number;
};

type AiConnectionDraft = {
  apiBase: string;
  apiKey: string;
  model: string;
};

type FirstRunFlowProps = {
  hasAiKey: boolean;
  initialApiBase: string;
  initialModel: string;
  initialPreference: string;
  onDone: () => void;
  onGenerate: (preference: string) => Promise<void>;
  onSkip?: () => void;
  onTestConnection: (draft: AiConnectionDraft) => Promise<void>;
};

type PopupView = "home" | "edit" | "plan";

type AiryPopupProps = {
  aiState: AiStatus["state"];
  autoFeedback: boolean;
  busy: boolean;
  enabled: boolean;
  preference: string;
  ruleCount: number;
  rules: CleanFeedRule[];
  shortsBlock: boolean;
  status: string;
  view: PopupView;
  onGenerate: () => void;
  onOpenOptions: () => void;
  onPreferenceChange: (value: string) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleFeedback: (enabled: boolean) => void;
  onToggleShorts: (enabled: boolean) => void;
  onViewChange: (view: PopupView) => void;
};

type AirySettingsProps = {
  aiAuditLog: AiAuditLogEntry[];
  aiCostSummary: AiCostSummary;
  aiStatus: AiStatus;
  busy: boolean;
  hasAiKey: boolean;
  preference: string;
  ruleCount: number;
  settings: CleanFeedSettings;
  status: string;
  onGenerateConfig: () => Promise<void>;
  onPreferenceChange: (value: string) => void;
  onResetOnboarding: () => Promise<void>;
  onSaveAiConfig: (draft: AiConnectionDraft) => Promise<void>;
  onTestAiConnection: (draft: AiConnectionDraft) => Promise<void>;
  onToggleFeedback: (enabled: boolean) => Promise<void>;
  onToggleShorts: (enabled: boolean) => Promise<void>;
};

const preferenceChips = ["少点娱乐八卦", "保留深度讲解", "屏蔽游戏解说", "不看新闻"];
const onboardingChips = ["少点新闻", "保留教程", "屏蔽游戏", "不看直播", "少点八卦"];
const generationSteps = ["解读你的偏好", "提取关键词", "匹配时长与平台规则", "配置 AI 复核策略", "完成 · 准备就绪"];

export function FirstRunFlow({
  hasAiKey,
  initialApiBase,
  initialModel,
  initialPreference,
  onDone,
  onGenerate,
  onSkip,
  onTestConnection
}: FirstRunFlowProps) {
  const [step, setStep] = useState(1);
  const [apiBase, setApiBase] = useState(initialApiBase);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initialModel);
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState(hasAiKey ? "可使用已保存 Key 测试" : "未测试");
  const [preference, setPreference] = useState(initialPreference);

  const canTest = apiKey.trim().length > 0 || hasAiKey;
  const canNext = testState === "ok";

  const runTest = async () => {
    if (!canTest || testState === "testing") {
      return;
    }

    setTestState("testing");
    setTestMessage("连接中...");

    try {
      await onTestConnection({
        apiBase,
        apiKey,
        model
      });
      setTestState("ok");
      setTestMessage("连接成功");
    } catch (error) {
      setTestState("fail");
      setTestMessage(error instanceof Error ? error.message : "连接失败");
    }
  };

  return (
    <div className="first-run-flow noise">
      <div className="dawn-bg" />

      <div className="first-run-content">
        <div className="first-run-top">
          <div className="first-run-brand">
            <div className="brand-mark">
              <IconFlower size={15} />
            </div>
            <div>Clean Feed</div>
          </div>
          <StepDots step={step} />
        </div>

        {step === 1 ? (
          <>
            <div className="first-run-body">
              <div>
                <div className="air-eyebrow">Step 1 / 3 · Connect</div>
                <h1 className="air-title">连接 AI 模型</h1>
                <div className="air-subtle inline-tip">
                  API Key 仅保存在本地
                  <QIcon text="不会上传到 Clean Feed 以外的任何服务器；扩展只会请求你配置的 API Base" />
                </div>
              </div>

              <div className="glass-thin first-run-card">
                <FieldLabel label="API Base" tip="兼容 OpenAI 的接口地址" />
                <input className="input" value={apiBase} onChange={(event) => setApiBase(event.currentTarget.value)} />

                <FieldLabel label="API Key" tip={hasAiKey ? "留空会继续使用已保存的 Key" : "通常以 sk- 开头"} />
                <div className="input-wrap">
                  <input
                    className="input"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.currentTarget.value);
                      setTestState("idle");
                      setTestMessage(hasAiKey ? "可使用已保存 Key 测试" : "未测试");
                    }}
                    placeholder={hasAiKey ? "已保存，留空则继续使用当前 Key" : "sk-or-v1-..."}
                  />
                  <button className="input-icon" type="button" aria-label="显示或隐藏 API Key" onClick={() => setShowKey(!showKey)}>
                    <IconEye off={showKey} size={14} />
                  </button>
                </div>

                <FieldLabel label="Model" tip="推荐 haiku 级别，足够快且便宜" />
                <input className="input" value={model} onChange={(event) => setModel(event.currentTarget.value)} />
              </div>
            </div>

            <div className="first-run-footer">
              <ConnectionState state={testState} message={testMessage} />
              <div className="action-row">
                <button className="btn btn-ghost" type="button" disabled={!canTest || testState === "testing"} onClick={() => void runTest()}>
                  测试连接
                </button>
                <button className="btn btn-primary" type="button" disabled={!canNext} onClick={() => setStep(2)}>
                  下一步
                  <IconArrowRight size={12} />
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="first-run-body">
              <div>
                <div className="air-eyebrow">Step 2 / 3 · Describe</div>
                <h1 className="air-title">你想要什么样的信息流?</h1>
                <div className="air-subtle inline-tip">
                  用自然语言就好 · 不改也能直接下一步
                  <QIcon text="Clean Feed 会把这段话生成规则解释和正则表达式" />
                </div>
              </div>

              <textarea
                className="textarea first-run-textarea"
                value={preference}
                onChange={(event) => setPreference(event.currentTarget.value)}
              />

              <div className="chip-row">
                {onboardingChips.map((chip) => (
                  <button key={chip} type="button" onClick={() => setPreference((current) => [current.trim(), chip].filter(Boolean).join("\n"))}>
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="first-run-footer">
              <button className="btn btn-link" type="button" onClick={() => setStep(1)}>
                ← 上一步
              </button>
              <div className="action-row">
                {onSkip ? (
                  <button className="btn btn-ghost" type="button" onClick={onSkip}>
                    稍后再说
                  </button>
                ) : null}
                <button className="btn btn-primary" type="button" onClick={() => setStep(3)}>
                  <IconSpark size={12} />
                  生成净化方案
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === 3 ? <GenerationStage onDone={onDone} onGenerate={() => onGenerate(preference)} /> : null}
      </div>
    </div>
  );
}

export function AiryPopup({
  aiState,
  autoFeedback,
  busy,
  enabled,
  preference,
  ruleCount,
  rules,
  shortsBlock,
  status,
  view,
  onGenerate,
  onOpenOptions,
  onPreferenceChange,
  onToggleEnabled,
  onToggleFeedback,
  onToggleShorts,
  onViewChange
}: AiryPopupProps) {
  return (
    <div className="popup-root noise">
      <div className="dawn-bg" />
      <div className="popup-content">
        <div className="popup-topbar">
          <div className="brand-mark">
            <IconFlower size={14} />
          </div>
          <div className="popup-brand">Clean Feed</div>
          <div className="tabbar">
            <IconTab active={view === "home"} tip="概览" onClick={() => onViewChange("home")}>
              <IconHome size={14} />
            </IconTab>
            <IconTab active={view === "edit"} tip="编辑偏好" onClick={() => onViewChange("edit")}>
              <IconEdit size={14} />
            </IconTab>
            <IconTab active={view === "plan"} tip="当前方案" onClick={() => onViewChange("plan")}>
              <IconShield size={14} />
            </IconTab>
          </div>
          <IconButton tip="高级设置" onClick={onOpenOptions}>
            <IconSettings size={13} />
          </IconButton>
          <SwitchButton checked={enabled} label="启用净化" size="large" onChange={onToggleEnabled} />
        </div>

        {view === "home" ? (
          <HomeView
            aiState={aiState}
            autoFeedback={autoFeedback}
            enabled={enabled}
            ruleCount={ruleCount}
            shortsBlock={shortsBlock}
            onEdit={() => onViewChange("edit")}
            onToggleFeedback={onToggleFeedback}
            onToggleShorts={onToggleShorts}
          />
        ) : null}

        {view === "edit" ? (
          <EditView
            busy={busy}
            preference={preference}
            onGenerate={onGenerate}
            onPreferenceChange={onPreferenceChange}
          />
        ) : null}

        {view === "plan" ? <PlanView ruleCount={ruleCount} rules={rules} onOpenOptions={onOpenOptions} /> : null}

        <p className="popup-status" role="status">
          {status}
        </p>
      </div>
    </div>
  );
}

export function AirySettings({
  aiAuditLog,
  aiCostSummary,
  aiStatus,
  busy,
  hasAiKey,
  preference,
  ruleCount,
  settings,
  status,
  onGenerateConfig,
  onPreferenceChange,
  onResetOnboarding,
  onSaveAiConfig,
  onTestAiConnection,
  onToggleFeedback,
  onToggleShorts
}: AirySettingsProps) {
  const [section, setSection] = useState<"ai" | "review" | "rules" | "scope" | "history" | "export">("ai");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="settings-root noise">
      <div className="dawn-bg" />
      <div className="settings-layout">
        <aside className="settings-nav">
          <div className="nav-brand">
            <div className="brand-mark">
              <IconFlower size={15} />
            </div>
            <div>
              <strong>Clean Feed</strong>
              <span>高级设置</span>
            </div>
          </div>

          <NavLabel>AI</NavLabel>
          <NavItem active={section === "ai"} icon={<IconSpark size={14} />} label="模型连接" onClick={() => setSection("ai")} />
          <NavItem active={section === "review"} icon={<IconShield size={14} />} label="生成策略" onClick={() => setSection("review")} />

          <NavLabel>规则</NavLabel>
          <NavItem active={section === "rules"} badge={String(ruleCount)} icon={<IconList size={14} />} label="规则详情" onClick={() => setSection("rules")} />
          <NavItem active={section === "scope"} icon={<IconGlobe size={14} />} label="开关" onClick={() => setSection("scope")} />

          <NavLabel>数据</NavLabel>
          <NavItem active={section === "history"} icon={<IconRefresh size={14} />} label="历史 / 日志" onClick={() => setSection("history")} />
          <NavItem active={section === "export"} icon={<IconDownload size={14} />} label="导入 / 导出" onClick={() => setSection("export")} />

          <button className="nav-reset" type="button" onClick={() => void onResetOnboarding()}>
            重新打开引导
          </button>
          <small className="version">v0.6 · 仅本地</small>
        </aside>

        <main className="settings-detail scroll">
          {section === "ai" ? (
            <AISection
              aiAuditLog={aiAuditLog}
              aiCostSummary={aiCostSummary}
              aiStatus={aiStatus}
              settings={settings}
              onEdit={() => setDialogOpen(true)}
            />
          ) : null}
          {section === "review" ? (
            <ReviewSection busy={busy} preference={preference} onGenerateConfig={onGenerateConfig} onPreferenceChange={onPreferenceChange} />
          ) : null}
          {section === "rules" ? <RulesSection rules={settings.rules} /> : null}
          {section === "scope" ? (
            <ScopeSection settings={settings} onToggleFeedback={onToggleFeedback} onToggleShorts={onToggleShorts} />
          ) : null}
          {section === "history" ? <HistorySection aiAuditLog={aiAuditLog} /> : null}
          {section === "export" ? <ExportSection /> : null}
          <p className="settings-status" role="status">
            {status}
          </p>
        </main>
      </div>

      {dialogOpen ? (
        <AiConnectionDialog
          hasAiKey={hasAiKey}
          initialApiBase={settings.ai.apiBase}
          initialModel={settings.ai.model}
          onClose={() => setDialogOpen(false)}
          onSave={async (draft) => {
            await onSaveAiConfig(draft);
            setDialogOpen(false);
          }}
          onTest={onTestAiConnection}
        />
      ) : null}
    </div>
  );
}

function HomeView({
  aiState,
  autoFeedback,
  enabled,
  ruleCount,
  shortsBlock,
  onEdit,
  onToggleFeedback,
  onToggleShorts
}: {
  aiState: AiStatus["state"];
  autoFeedback: boolean;
  enabled: boolean;
  ruleCount: number;
  shortsBlock: boolean;
  onEdit: () => void;
  onToggleFeedback: (enabled: boolean) => void;
  onToggleShorts: (enabled: boolean) => void;
}) {
  return (
    <>
      <div className="glass hero-card">
        <div className="hero-line">
          <strong>{ruleCount}</strong>
          <span>条正则规则</span>
          <span className="llm-pill">
            <i />
            {enabled ? formatAiState(aiState) : "PAUSED"}
          </span>
        </div>
        <div className="breakdown" aria-hidden="true">
          <span style={{ width: "55%" }} />
          <span style={{ width: "30%" }} />
          <span style={{ width: "15%" }} />
        </div>
        <div className="legend">
          <Tip text="正则规则立即运行">
            <span>● Regex</span>
          </Tip>
          <Tip text="平台反馈自动执行">
            <span>● Feedback</span>
          </Tip>
          <Tip text="Shorts / B 站短视频">
            <span>● Shorts</span>
          </Tip>
        </div>
      </div>

      <div className="toggle-stack">
        <IconToggle
          checked={shortsBlock}
          icon={<IconVideo size={14} />}
          label="屏蔽短视频"
          tip="Shorts、B 站短视频流等"
          onChange={onToggleShorts}
        />
        <IconToggle
          checked={autoFeedback}
          icon={<IconFeedback size={14} />}
          label="平台反馈"
          tip="自动对过滤项点击不感兴趣或点踩"
          onChange={onToggleFeedback}
        />
      </div>

      <div className="popup-actions">
        <button className="btn btn-primary grow" type="button" onClick={onEdit}>
          <IconSpark size={12} />
          改写偏好
        </button>
      </div>
    </>
  );
}

function EditView({
  busy,
  preference,
  onGenerate,
  onPreferenceChange
}: {
  busy: boolean;
  preference: string;
  onGenerate: () => void;
  onPreferenceChange: (value: string) => void;
}) {
  return (
    <>
      <div className="view-head">
        <span>你想过滤什么</span>
        <QIcon text="用自然语言写，AI 会自动转成正则规则" />
        <small>{preference.length} / 300</small>
      </div>
      <textarea
        className="textarea popup-textarea"
        maxLength={300}
        placeholder="一句话就好..."
        value={preference}
        onChange={(event) => onPreferenceChange(event.currentTarget.value)}
      />
      <div className="chip-row">
        {preferenceChips.map((chip) => (
          <button key={chip} type="button" onClick={() => onPreferenceChange([preference.trim(), chip].filter(Boolean).join("\n"))}>
            + {chip}
          </button>
        ))}
      </div>
      <button className="btn btn-primary full" type="button" disabled={busy} onClick={onGenerate}>
        <IconSpark size={13} />
        {busy ? "生成中..." : "生成净化方案"}
      </button>
    </>
  );
}

function PlanView({
  ruleCount,
  rules,
  onOpenOptions
}: {
  ruleCount: number;
  rules: CleanFeedRule[];
  onOpenOptions: () => void;
}) {
  return (
    <>
      <div className="view-head">
        <IconShield size={13} />
        <span>当前方案</span>
        <small>{ruleCount} 条规则</small>
        <QIcon text="AI 从你的偏好自动生成" />
      </div>

      <div className="plan-list scroll">
        {rules.length > 0 ? (
          rules.map((rule) => (
            <div className="plan-row" key={rule.id}>
              <span className="plan-icon">R</span>
              <span className="plan-text">{rule.explanation}</span>
              <code>{rule.pattern}</code>
            </div>
          ))
        ) : (
          <StateCard kind="empty" compact />
        )}
      </div>

      <button className="btn btn-ghost full" type="button" onClick={onOpenOptions}>
        <IconSettings size={13} />
        打开高级设置
      </button>
    </>
  );
}

function AISection({
  aiAuditLog,
  aiCostSummary,
  aiStatus,
  settings,
  onEdit
}: {
  aiAuditLog: AiAuditLogEntry[];
  aiCostSummary: AiCostSummary;
  aiStatus: AiStatus;
  settings: CleanFeedSettings;
  onEdit: () => void;
}) {
  const connected = settings.ai.enabled && aiStatus.state !== "error";

  return (
    <>
      <SectionHeader title="模型连接" />
      <div className="glass-thin ai-card">
        <div className="ai-card-main">
          <span className={`status-dot${connected ? " is-ready" : ""}`} />
          <div>
            <strong>
              {formatProviderLabel(settings.ai.apiBase)} · {formatModelLabel(settings.ai.model)}
            </strong>
            <span>{settings.ai.apiBase}</span>
          </div>
          <button className="btn btn-ghost small" type="button" onClick={onEdit}>
            <IconLink size={12} />
            编辑
          </button>
        </div>
        <div className="ai-metrics">
          <Metric label="AI 状态" value={settings.ai.enabled ? aiStatus.state.toUpperCase() : "OFF"} />
          <Metric label="成本" value={formatUsd(aiCostSummary.estimatedCostUsd)} />
          <Metric label="入参" value={formatTokenCount(aiCostSummary.inputTokens)} />
          <Metric label="出参" value={formatTokenCount(aiCostSummary.outputTokens)} />
        </div>
        <AuditLogList compact entries={aiAuditLog.slice(0, 4)} />
      </div>
    </>
  );
}

function ReviewSection({
  busy,
  preference,
  onGenerateConfig,
  onPreferenceChange
}: {
  busy: boolean;
  preference: string;
  onGenerateConfig: () => Promise<void>;
  onPreferenceChange: (value: string) => void;
}) {
  return (
    <>
      <SectionHeader title="生成策略" sub="用自然语言描述，AI 只生成规则解释和正则表达式。" />
      <div className="glass-thin composer-card">
        <FieldLabel label="偏好" tip="用户只需要描述，规则由 AI 负责生成" />
        <textarea
          className="textarea settings-textarea"
          maxLength={600}
          placeholder="屏蔽短平快、标题党、低质量娱乐八卦、重复搬运；保留长视频、教程、深度分析、技术内容。"
          value={preference}
          onChange={(event) => onPreferenceChange(event.currentTarget.value)}
        />
        <div className="strategy-grid">
          <VerdictRow action="模糊" color="#8aa8c8" label="命中正则" tip="卡片会被模糊，鼠标悬停可查看" />
          <VerdictRow action="保留" color="#a8b8ce" label="不确定" tip="默认保留，避免误杀" />
          <VerdictRow action="反馈" color="#7ba192" label="低质项" tip="如果开启平台反馈，会尝试点击不感兴趣或点踩" />
        </div>
        <button className="btn btn-primary self-end" type="button" disabled={busy} onClick={() => void onGenerateConfig()}>
          <IconSpark size={13} />
          {busy ? "生成中..." : "生成正则规则"}
        </button>
      </div>
    </>
  );
}

function RulesSection({ rules }: { rules: CleanFeedRule[] }) {
  return (
    <>
      <SectionHeader title="规则详情" sub="由 AI 从偏好生成；每条规则只有解释和正则。" />
      <div className="glass-thin rules-list">
        {rules.length > 0 ? (
          rules.map((rule) => (
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
    </>
  );
}

function ScopeSection({
  settings,
  onToggleFeedback,
  onToggleShorts
}: {
  settings: CleanFeedSettings;
  onToggleFeedback: (enabled: boolean) => Promise<void>;
  onToggleShorts: (enabled: boolean) => Promise<void>;
}) {
  return (
    <>
      <SectionHeader title="开关" />
      <div className="scope-stack">
        <ScopeRow
          checked={settings.shorts.enabled}
          description="YouTube Shorts / Bilibili 短视频流"
          icon={<IconVideo size={18} />}
          title="屏蔽短视频"
          onChange={onToggleShorts}
        />
        <ScopeRow
          checked={settings.feedback.enabled}
          description="自动点击不感兴趣 / 点踩"
          icon={<IconFeedback size={18} />}
          title="平台反馈"
          onChange={onToggleFeedback}
        />
        <SiteRow domain="youtube.com" hits="YouTube" name="YouTube" />
        <SiteRow domain="bilibili.com" hits="Bilibili" name="Bilibili" />
      </div>
    </>
  );
}

function HistorySection({ aiAuditLog }: { aiAuditLog: AiAuditLogEntry[] }) {
  return (
    <>
      <SectionHeader title="审计日志" sub="模型调用记录保存在本地，包含入参、出参、token 和估算成本。" />
      <AuditLogList entries={aiAuditLog} />
    </>
  );
}

function ExportSection() {
  return (
    <>
      <SectionHeader title="导入 / 导出" />
      <div className="scope-stack">
        <ActionCard description="包含偏好、规则、站点" icon={<IconDownload size={18} />} title="导出配置" value="JSON" />
        <ActionCard description="覆盖当前设置" icon={<IconUpload size={18} />} title="导入配置" value="选择文件" />
        <ActionCard description="偏好 · 规则 · 缓存" icon={<IconTrash size={18} />} title="清除本地数据" value="清除" />
      </div>
    </>
  );
}

function AiConnectionDialog({
  hasAiKey,
  initialApiBase,
  initialModel,
  onClose,
  onSave,
  onTest
}: {
  hasAiKey: boolean;
  initialApiBase: string;
  initialModel: string;
  onClose: () => void;
  onSave: (draft: AiConnectionDraft) => Promise<void>;
  onTest: (draft: AiConnectionDraft) => Promise<void>;
}) {
  const [apiBase, setApiBase] = useState(initialApiBase);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initialModel);
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [message, setMessage] = useState(hasAiKey ? "已保存 Key" : "未测试");
  const [saving, setSaving] = useState(false);

  const draft = useMemo(() => ({ apiBase, apiKey, model }), [apiBase, apiKey, model]);

  const runTest = async () => {
    setTestState("testing");
    setMessage("连接中...");
    try {
      await onTest(draft);
      setTestState("ok");
      setMessage("连接正常");
    } catch (error) {
      setTestState("fail");
      setMessage(error instanceof Error ? error.message : "连接失败");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } catch (error) {
      setTestState("fail");
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-layer" onClick={onClose}>
      <div className="glass ai-dialog" role="dialog" aria-modal="true" aria-label="连接 AI" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <h2>连接 AI</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <IconClose size={14} />
          </button>
        </div>

        <FieldLabel label="API Base" tip="兼容 OpenAI 的接口地址" />
        <input className="input" value={apiBase} onChange={(event) => setApiBase(event.currentTarget.value)} />

        <FieldLabel label="API Key" tip="仅保存在本地，不会上传" />
        <div className="input-wrap">
          <input
            className="input"
            type={showKey ? "text" : "password"}
            value={apiKey}
            placeholder={hasAiKey ? "已保存，留空则继续使用当前 Key" : "sk-or-v1-..."}
            onChange={(event) => {
              setApiKey(event.currentTarget.value);
              setTestState("idle");
            }}
          />
          <button className="input-icon" type="button" aria-label="显示或隐藏 API Key" onClick={() => setShowKey(!showKey)}>
            <IconEye off={showKey} size={14} />
          </button>
        </div>

        <FieldLabel label="Model" tip="推荐 haiku 级别，足够快、便宜" />
        <input className="input" value={model} onChange={(event) => setModel(event.currentTarget.value)} />

        <div className="dialog-actions">
          <ConnectionState state={testState} message={message} />
          <div className="action-row">
            <button className="btn btn-ghost" type="button" disabled={testState === "testing"} onClick={() => void runTest()}>
              测试
            </button>
            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GenerationStage({ onDone, onGenerate }: { onDone: () => void; onGenerate: () => Promise<void> }) {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timers = generationSteps.map((_, index) => window.setTimeout(() => active && setProgress(index + 1), index * 700));

    void onGenerate()
      .then(() => {
        window.setTimeout(() => {
          if (active) {
            setProgress(generationSteps.length);
            onDone();
          }
        }, generationSteps.length * 700 + 260);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "生成失败");
        }
      });

    return () => {
      active = false;
      timers.forEach(window.clearTimeout);
    };
  }, [onDone, onGenerate]);

  return (
    <div className="generation-stage">
      <div className="generation-title">
        <div className="air-eyebrow">Step 3 / 3 · Generate</div>
        <h1 className="air-title">正在替你生成方案</h1>
      </div>

      <div className="orb" aria-hidden="true">
        <div />
        <div />
      </div>

      <div className="generation-list">
        {generationSteps.map((label, index) => {
          const done = progress > index;
          const active = progress === index;

          return (
            <div className={`generation-row${done ? " is-done" : ""}${active ? " is-active" : ""}`} key={label}>
              <span>
                {done ? <IconCheck size={10} /> : null}
                {active ? <i /> : null}
              </span>
              <strong>{label}</strong>
              {done ? <em>✓</em> : null}
            </div>
          );
        })}
      </div>

      <div className={`generation-note${error ? " is-error" : ""}`}>
        {error || (progress >= generationSteps.length ? "即将进入主界面..." : "通常只需要几秒")}
      </div>
    </div>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="step-dots">
      {[1, 2, 3].map((item) => (
        <span className={item === step ? "is-active" : item < step ? "is-done" : ""} key={item} />
      ))}
    </div>
  );
}

function Tip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <span className="tip">
      {children}
      <span className="tip-bubble">{text}</span>
    </span>
  );
}

function QIcon({ text }: { text: string }) {
  return (
    <Tip text={text}>
      <IconQuestion size={12} />
    </Tip>
  );
}

function IconToggle({
  checked,
  icon,
  label,
  onChange,
  tip
}: {
  checked: boolean;
  icon: ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
  tip: string;
}) {
  return (
    <div className="icon-toggle">
      <span>{icon}</span>
      <strong>{label}</strong>
      <QIcon text={tip} />
      <SwitchButton checked={checked} label={label} size="small" onChange={onChange} />
    </div>
  );
}

function IconButton({ children, onClick, tip }: { children: ReactNode; onClick: () => void; tip: string }) {
  return (
    <Tip text={tip}>
      <button className="icon-btn" type="button" onClick={onClick}>
        {children}
      </button>
    </Tip>
  );
}

function IconTab({ active, children, onClick, tip }: { active: boolean; children: ReactNode; onClick: () => void; tip: string }) {
  return (
    <Tip text={tip}>
      <button className={`tab${active ? " is-active" : ""}`} type="button" aria-pressed={active} onClick={onClick}>
        {children}
      </button>
    </Tip>
  );
}

function SwitchButton({
  checked,
  label,
  onChange,
  size = "default"
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  size?: "default" | "large" | "small";
}) {
  return (
    <button
      className={`switch ${checked ? "on" : ""} switch-${size}`}
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    />
  );
}

function FieldLabel({ label, tip }: { label: string; tip: string }) {
  return (
    <div className="field-label">
      <label className="label">{label}</label>
      <QIcon text={tip} />
    </div>
  );
}

function ConnectionState({ message, state }: { message: string; state: "idle" | "testing" | "ok" | "fail" }) {
  return (
    <div className={`connection-state is-${state}`}>
      {state === "ok" ? <IconCheck size={11} /> : <span />}
      <strong>{message}</strong>
    </div>
  );
}

function SectionHeader({ sub, title }: { sub?: string; title: string }) {
  return (
    <header className="section-head">
      <h1>{title}</h1>
      {sub ? <p>{sub}</p> : null}
    </header>
  );
}

function NavLabel({ children }: { children: ReactNode }) {
  return <span className="nav-label">{children}</span>;
}

function NavItem({
  active,
  badge,
  icon,
  label,
  onClick
}: {
  active: boolean;
  badge?: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item${active ? " is-active" : ""}`} type="button" aria-pressed={active} onClick={onClick}>
      <span>{icon}</span>
      <strong>{label}</strong>
      {badge ? <em>{badge}</em> : null}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AuditLogList({ compact = false, entries }: { compact?: boolean; entries: AiAuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className={`audit-empty${compact ? " is-compact" : ""}`}>
        <IconSpark size={14} />
        <span>暂无调用</span>
      </div>
    );
  }

  return (
    <div className={`audit-list${compact ? " is-compact" : ""}`}>
      {entries.map((entry) => (
        <details className="audit-entry" key={entry.id}>
          <summary>
            <span className={`audit-kind is-${entry.status}`}>{formatAuditKind(entry.kind)}</span>
            <span className="audit-meta">
              <strong>{formatAuditTime(entry.createdAt)}</strong>
              <em>
                IN {formatTokenCount(entry.usage.inputTokens)} / OUT {formatTokenCount(entry.usage.outputTokens)}
              </em>
            </span>
            <span className="audit-cost">{formatNullableUsd(entry.cost.totalUsd)}</span>
          </summary>
          <div className="audit-payload">
            <div>
              <span>入参</span>
              <pre>{formatAuditPayload(entry.input)}</pre>
            </div>
            <div>
              <span>出参</span>
              <pre>{formatAuditPayload(entry.output ?? entry.error ?? "")}</pre>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function VerdictRow({ action, color, label, tip }: { action: string; color: string; label: string; tip: string }) {
  return (
    <div className="verdict-row">
      <span style={{ "--dot": color } as CSSProperties} />
      <strong>{label}</strong>
      <em>→ {action}</em>
      <QIcon text={tip} />
    </div>
  );
}

function ScopeRow({
  checked,
  description,
  icon,
  onChange,
  title
}: {
  checked: boolean;
  description: string;
  icon: ReactNode;
  onChange: (enabled: boolean) => Promise<void>;
  title: string;
}) {
  return (
    <div className="scope-row glass-thin">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <SwitchButton checked={checked} label={title} onChange={(enabled) => void onChange(enabled)} />
    </div>
  );
}

function SiteRow({ domain, hits, name }: { domain: string; hits: string; name: string }) {
  return (
    <div className="scope-row glass-thin">
      <span className="site-avatar">{name.slice(0, 2).toUpperCase()}</span>
      <div>
        <strong>{name}</strong>
        <small>{domain}</small>
      </div>
      <em>{hits}</em>
    </div>
  );
}

function ActionCard({ description, icon, title, value }: { description: string; icon: ReactNode; title: string; value: string }) {
  return (
    <div className="scope-row glass-thin">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <button className="btn btn-ghost small" type="button">
        {value}
      </button>
    </div>
  );
}

function StateCard({ compact = false, kind }: { compact?: boolean; kind: "empty" }) {
  return (
    <div className={`state-card${compact ? " is-compact" : ""}`}>
      <div className="dawn-bg dawn-bg-soft" />
      <div>
        <span>
          <IconFlower size={20} />
        </span>
        <div className="air-eyebrow">EMPTY</div>
        <h2>还没有生成方案</h2>
        <p>写一句话描述你想过滤的内容，点「生成净化方案」。</p>
      </div>
    </div>
  );
}

function formatAiState(state: AiStatus["state"]) {
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

function formatProviderLabel(apiBase: string) {
  try {
    const hostname = new URL(apiBase).hostname.replace(/^www\./, "");
    return hostname === "openrouter.ai" ? "OpenRouter" : hostname;
  } catch {
    return "AI";
  }
}

function formatModelLabel(model: string) {
  if (model.includes("claude-haiku-4-5")) {
    return "Haiku 4.5";
  }

  return model;
}

function formatUsd(value: number) {
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: value < 0.01 ? 6 : 4,
    minimumFractionDigits: value > 0 && value < 0.01 ? 6 : 2
  })}`;
}

function formatNullableUsd(value: number | null) {
  return value === null ? "N/A" : formatUsd(value);
}

function formatTokenCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return String(value);
}

function formatAuditKind(kind: AiAuditLogEntry["kind"]) {
  switch (kind) {
    case "test_connection":
      return "TEST";
    case "generate_config":
      return "RULE";
    case "review_videos":
      return "LLM";
  }
}

function formatAuditTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  });
}

function formatAuditPayload(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return serialized.length > 1600 ? `${serialized.slice(0, 1600)}...` : serialized;
}

function Svg({ children, color = "currentColor", size = 16 }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3">
      {children}
    </svg>
  );
}

function IconFlower(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 3c2 2 2 5 0 7-2-2-2-5 0-7zM12 14c2 2 2 5 0 7-2-2-2-5 0-7zM3 12c2-2 5-2 7 0-2 2-5 2-7 0zM14 12c2-2 5-2 7 0-2 2-5 2-7 0z" />
    </Svg>
  );
}

function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

function IconSpark(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="2" />
    </Svg>
  );
}

function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12l5 5L20 6" />
    </Svg>
  );
}

function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

function IconLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Svg>
  );
}

function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
    </Svg>
  );
}

function IconEye({ off, ...props }: IconProps) {
  return (
    <Svg {...props}>
      {off ? <path d="M3 3l18 18" /> : null}
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

function IconQuestion(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17v.01" />
    </Svg>
  );
}

function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12l9-9 9 9M5 10v10h14V10" />
    </Svg>
  );
}

function IconEdit(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </Svg>
  );
}

function IconVideo(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="14" height="12" rx="1" />
      <path d="M17 10l4-2v8l-4-2" />
    </Svg>
  );
}

function IconFeedback(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 10v12H3V10h4zM21 11a2 2 0 0 0-2-2h-5.5l1-4a2 2 0 0 0-4-1L7 10v12h11a2 2 0 0 0 2-1.5l2-7a2 2 0 0 0-1-2.5z" />
    </Svg>
  );
}

function IconList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Svg>
  );
}

function IconGlobe(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </Svg>
  );
}

function IconRefresh(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3v6h6M21 21v-6h-6M3 9a9 9 0 0 1 15-3M21 15a9 9 0 0 1-15 3" />
    </Svg>
  );
}

function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v12M5 10l7 7 7-7M3 21h18" />
    </Svg>
  );
}

function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21V9M5 14l7-7 7 7M3 3h18" />
    </Svg>
  );
}

function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    </Svg>
  );
}
