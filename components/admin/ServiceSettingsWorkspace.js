import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AdminNav from "./AdminNav";
import styles from "./admin.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const STANDARD_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const CODING_PLAN_BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4";

function endpointModeFor(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "").toLowerCase() === CODING_PLAN_BASE_URL ? "coding_plan" : "standard_api";
}

function statusCopy(status) {
  return {
    configured: "已读取配置",
    configuration_required: "等待配置",
    tested: "实际调用成功",
    failed: "测试调用失败",
  }[status] || "正在检查";
}

function formatTime(value) {
  if (!value) return "尚未测试";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未记录" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatProviderError(payload = {}) {
  const diagnostics = payload?.diagnostics && typeof payload.diagnostics === "object" ? payload.diagnostics : {};
  const upstream = [
    Number.isFinite(Number(diagnostics.upstreamStatus)) ? `HTTP ${Number(diagnostics.upstreamStatus)}` : "",
    typeof diagnostics.upstreamCode === "string" && diagnostics.upstreamCode.trim() ? `错误码 ${diagnostics.upstreamCode.trim()}` : "",
  ].filter(Boolean).join(" / ");
  return `${payload?.error || "测试调用失败"}${upstream ? `（上游 ${upstream}）` : ""}`;
}

export default function ServiceSettingsWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ apiKey: "", model: "glm-5.3", baseUrl: "https://open.bigmodel.cn/api/paas/v4" });
  const [apiMode, setApiMode] = useState("standard_api");
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState("checking");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState(null);
  const loginHref = `${basePath}/login?returnTo=${encodeURIComponent("/admin/settings/")}`;

  const load = async () => {
    setLoading(true);
    setError("");
    setAccess("checking");
    let redirecting = false;
    const redirectToLogin = async () => {
      redirecting = true;
      setAccess("redirecting");
      await router.replace(loginHref);
    };
    try {
      const meResponse = await fetch(`${basePath}/api/auth/me/`, { cache: "no-store" });
      if (!meResponse.ok) {
        await redirectToLogin();
        return;
      }
      const me = await meResponse.json();
      if (me.user?.role !== "super_admin") {
        redirecting = true;
        setAccess("redirecting");
        await router.replace("/admin/");
        return;
      }
      setUser(me.user);
      setAccess("granted");
      const response = await fetch(`${basePath}/api/admin/settings/`, { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401) {
        await redirectToLogin();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "读取服务配置失败");
      setConfig(payload);
      setForm((current) => ({ ...current, model: payload.model || current.model, baseUrl: payload.baseUrl || current.baseUrl }));
      setApiMode(endpointModeFor(payload.baseUrl));
    } catch (caught) {
      setError(caught?.message || "读取服务配置失败");
      if (!redirecting) setAccess("error");
    } finally {
      if (!redirecting) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`${basePath}/api/admin/settings/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "保存服务配置失败");
      setConfig(payload);
      setForm((current) => ({ ...current, apiKey: "", model: payload.model || current.model, baseUrl: payload.baseUrl || current.baseUrl }));
      setApiMode(endpointModeFor(payload.baseUrl));
      setNotice("配置已保存；建议重启服务后再测试调用");
      setTestResult(null);
    } catch (caught) {
      setError(caught?.message || "保存服务配置失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`${basePath}/api/admin/settings/test/`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(formatProviderError(payload));
      setTestResult(payload);
      setConfig((current) => ({ ...(current || {}), status: "tested", configured: true, provider: payload.provider, model: payload.model }));
      setNotice("测试调用成功，AI 服务可以响应");
    } catch (caught) {
      setTestResult(null);
      setConfig((current) => current ? { ...current, status: "failed" } : current);
      setError(caught?.message || "测试调用失败");
    } finally {
      setTesting(false);
    }
  };

  const status = config?.status || "configuration_required";
  const statusLabel = useMemo(() => statusCopy(status), [status]);
  const roleLabel = user?.name ? `${user.name} · 最高管理` : "最高管理";

  return <main className={`${styles.adminPage} ${styles.settingsPage}`}>
    <section className={styles.adminCard}>
      <header className={styles.adminHeader}>
        <div className={styles.adminHeading}><span className={styles.adminKicker}>SYSTEM CONTROL</span><h1>服务配置</h1><p>统一管理全站 AI 服务与接口地址</p></div>
        <div className={styles.adminHeaderActions}><span className={styles.adminRole}><span className={styles.adminRoleDot} aria-hidden="true" />超级管理员</span><a className={styles.adminBackLink} href={`${basePath}/chat/`}>回到聊天 <span aria-hidden="true">↗</span></a></div>
      </header>
      <AdminNav role={user?.role} active="settings" />
      <div className={styles.adminIdentity}><span>{roleLabel}</span><small>只有最高权限账号可以修改服务配置</small></div>

      {notice && <div className={`${styles.adminNotice} ${styles.adminNoticeSuccess}`} role="status" aria-live="polite"><span className={styles.adminNoticeIcon} aria-hidden="true">✓</span><span>{notice}</span></div>}
      {error && <div className={`${styles.adminNotice} ${styles.adminNoticeError}`} role="alert"><span className={styles.adminNoticeIcon} aria-hidden="true">!</span><span>{error}</span></div>}

      {loading || access !== "granted" ? <div className={styles.adminLoading} role="status" aria-busy="true"><span className={styles.adminSpinner} aria-hidden="true" />{access === "redirecting" ? "正在跳转到登录页…" : access === "error" ? "服务配置暂不可用" : "正在验证管理员权限…"}{(access === "redirecting" || error === "请先登录") && <a className={styles.adminBackLink} href={loginHref}>返回登录</a>}</div> : <>
        <section className={styles.adminSummary} aria-label="服务概览">
          <div className={`${styles.adminSummaryCard} ${status === "tested" ? styles.adminSummaryAccent : ""}`}><span>服务状态</span><strong>{statusLabel}</strong><small>{status === "tested" ? "实际测试调用已成功" : config?.configured ? "配置已读取，等待真实测试" : "请填写服务端 API Key"}</small></div>
          <div className={styles.adminSummaryCard}><span>模型</span><strong>{config?.model || form.model}</strong><small>当前统一使用的模型</small></div>
          <div className={styles.adminSummaryCard}><span>服务商</span><strong>智谱 AI</strong><small>GLM-5.3 OpenAI 兼容接口</small></div>
        </section>

        <div className={styles.settingsLayout}>
          <section className={styles.settingsPanel} aria-labelledby="settings-form-title">
            <div className={styles.settingsPanelHead}><div><span className={styles.panelLabel}>PROVIDER</span><h2 id="settings-form-title">智谱 AI 服务</h2><p>画像分析、回复生成和日常开场都会读取这里的服务端配置。</p></div><span className={styles.settingsStatusPill}>{statusLabel}</span></div>
            <form onSubmit={save} aria-busy={saving}>
              <label className={styles.settingsField} htmlFor="admin-api-key"><span>API Key</span><input
                id="admin-api-key"
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                placeholder={config?.configured ? "已配置，留空保持不变" : "填入智谱 API Key"}
                autoComplete="new-password"
              /></label>
              <div className={styles.settingsFieldGrid}>
                <label className={styles.settingsField} htmlFor="admin-model"><span>模型</span><input id="admin-model" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="glm-5.3" /></label>
                <label className={styles.settingsField} htmlFor="admin-api-mode"><span>账号类型</span><select id="admin-api-mode" value={apiMode} onChange={(event) => { const nextMode = event.target.value; setApiMode(nextMode); setForm({ ...form, baseUrl: nextMode === "coding_plan" ? CODING_PLAN_BASE_URL : STANDARD_BASE_URL }); }}><option value="standard_api">资源包 / 充值余额（通用 API）</option><option value="coding_plan">GLM Coding Plan（专用 API）</option></select></label>
              </div>
              <label className={styles.settingsField} htmlFor="admin-base-url"><span>接口地址</span><input id="admin-base-url" value={form.baseUrl} onChange={(event) => { const nextBaseUrl = event.target.value; setForm({ ...form, baseUrl: nextBaseUrl }); setApiMode(endpointModeFor(nextBaseUrl)); }} placeholder={STANDARD_BASE_URL} inputMode="url" /></label>
              <p className={styles.settingsFieldHelp}>Key 来自 GLM Coding Plan 时选择“专用 API”；资源包或充值余额 Key 选择“通用 API”。两类 Key 与额度端点不能互换。当前选择只会填充接口地址，保存后才会生效。</p>
              <div className={styles.settingsActionRow}><button className={styles.primaryAction} type="submit" disabled={saving || testing} aria-busy={saving}>{saving ? "保存中…" : "保存配置"}</button><button className={styles.secondaryAction} type="button" onClick={test} disabled={saving || testing} aria-busy={testing}>{testing ? "测试中…" : "测试调用"}</button></div>
            </form>
          </section>

          <aside className={styles.settingsStatus} aria-labelledby="settings-status-title">
            <span className={styles.panelLabel}>STATUS</span><h2 id="settings-status-title">调用状态</h2><p>“已读取配置”不等于接口权限可用，测试调用会发送一条最小合成请求。</p>
            <dl className={styles.settingsMetrics}><div><dt>接口地址</dt><dd>{config?.baseUrl || form.baseUrl}</dd></div><div><dt>最近测试</dt><dd>{formatTime(testResult?.testedAt)}</dd></div><div><dt>Key 返回</dt><dd>永不返回</dd></div></dl>
            <div className={styles.settingsHint}><strong>安全边界</strong><span>API Key 仅保存在服务端配置文件，不写入浏览器存储、数据库或接口响应；设置接口不返回 API Key。普通主播和运营只能使用 AI，不可修改配置。</span></div>
          </aside>
        </div>
      </>}
    </section>
  </main>;
}
