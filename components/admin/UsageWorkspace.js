import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminNav from "./AdminNav";
import styles from "./admin.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const roleLabels = { super_admin: "最高管理", operator: "运营", anchor: "主播" };

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function UsageWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meResponse = await fetch(`${basePath}/api/auth/me/`);
        if (!meResponse.ok) return router.replace("/login?returnTo=/admin/usage");
        const me = await meResponse.json();
        if (me.user?.role !== "super_admin") return router.replace("/admin/");
        const [usageResponse, healthResponse] = await Promise.all([fetch(`${basePath}/api/admin/usage/?limit=100`), fetch(`${basePath}/api/health/`)]);
        const usagePayload = await usageResponse.json();
        const healthPayload = await healthResponse.json();
        if (!usageResponse.ok) throw new Error(usagePayload.error || "读取工具使用情况失败");
        if (!cancelled) { setUser(me.user); setUsage(usagePayload); setHealth(healthPayload); }
      } catch (caught) {
        if (!cancelled) setError(caught?.message || "读取工具使用情况失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const summary = usage?.summary || {};
  return <main className={`${styles.adminPage} ${styles.usagePage}`}>
    <section className={styles.adminCard}>
      <header className={styles.adminHeader}>
        <div className={styles.adminHeading}><span className={styles.adminKicker}>SYSTEM USAGE</span><h1>工具使用情况</h1><p>查看 AI 接口调用、运行状态和主播工作台使用率。</p></div>
        <div className={styles.adminHeaderActions}><span className={styles.adminRole}>{roleLabels[user?.role] || "最高管理"}</span><a className={styles.adminBackLink} href={`${basePath}/admin/`}>回到审批中心 ↗</a></div>
      </header>
      <AdminNav role={user?.role} active="usage" />
      {loading ? <div className={styles.adminLoading}>读取中…</div> : error ? <div className={styles.adminError}>{error}</div> : <>
        <section className={styles.usageStatusRow} aria-label="运行状态"><div><span>服务状态</span><strong>{health?.status === "configured" ? "已配置" : "待配置"}</strong><small>{health?.provider || "zhipu"} · {health?.model || "GLM-5.3"}</small></div><div><span>调用总数</span><strong>{summary.total || 0}</strong><small>当前保留的调用记录</small></div><div><span>成功率</span><strong>{summary.total ? `${Math.round((summary.success * 1000) / summary.total) / 10}%` : "—"}</strong><small>{summary.error || 0} 次失败</small></div><div><span>平均耗时</span><strong>{summary.averageLatencyMs == null ? "—" : `${summary.averageLatencyMs} ms`}</strong><small>仅统计已记录延迟</small></div><div><span>服务运行</span><strong>{health?.runtime?.uptimeSeconds == null ? "—" : `${Math.floor(health.runtime.uptimeSeconds / 3600)}h`}</strong><small>{health?.runtime?.nodeVersion || "Node.js"}</small></div></section>
        <section className={styles.usagePanel}><div className={styles.usagePanelHead}><div><span className={styles.adminKicker}>API CALLS</span><h2>调用分布</h2></div><small>不会显示 API Key 或请求正文</small></div>{!usage?.breakdown?.length ? <div className={styles.adminEmpty}>暂无调用记录</div> : <div className={styles.usageBreakdown}>{usage.breakdown.map((item) => <div key={`${item.provider}-${item.model}-${item.operation}-${item.status}`}><span>{item.provider || "未标注"} · {item.model || "未标注"}</span><small>{item.operation} · {item.status}</small><strong>{item.count}</strong></div>)}</div>}</section>
        <section className={styles.usagePanel}><div className={styles.usagePanelHead}><div><span className={styles.adminKicker}>RECENT EVENTS</span><h2>最近调用</h2></div><small>{usage?.generatedAt ? `更新于 ${formatDate(usage.generatedAt)}` : ""}</small></div>{!usage?.items?.length ? <div className={styles.adminEmpty}>暂无调用记录</div> : <div className={styles.usageEvents}>{usage.items.map((item) => <article key={item.id}><div><strong>{item.operation}</strong><small>{item.actor?.name || "未知账号"} · {roleLabels[item.actor?.role] || item.actor?.role || "—"}{item.brother?.nickname ? ` · ${item.brother.nickname}` : ""}</small></div><span className={item.status === "success" ? styles.usageSuccess : styles.usageFailure}>{item.status === "success" ? "成功" : item.status}</span><time>{formatDate(item.createdAt)}{item.latencyMs == null ? "" : ` · ${item.latencyMs} ms`}</time></article>)}</div>}</section>
      </>}
      <p className={styles.adminBoundary}>这里只记录服务端聚合指标；不会读取抖音后台，也不会代主播发送消息。</p>
    </section>
  </main>;
}
