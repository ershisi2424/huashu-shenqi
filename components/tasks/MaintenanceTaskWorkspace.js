import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import styles from "./task.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const STATUS_LABELS = { pending_reply: "待回复", follow_up: "待跟进", snoozed: "稍后处理", done: "已完成", dismissed: "已忽略" };
const PRIORITY_LABELS = { high: "优先", normal: "常规", low: "低优先" };
const EMPTY_FORM = { brotherId: "", title: "", nextAction: "", reason: "", priority: "normal", dueAt: "" };

function formatDate(value) {
  if (!value) return "未安排时间";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未记录" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MaintenanceTaskWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [brothers, setBrothers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createRequestId, setCreateRequestId] = useState("");
  const loadSequence = useRef(0);

  const load = async ({ silent = false } = {}) => {
    const sequence = ++loadSequence.current;
    const currentLoad = () => sequence === loadSequence.current;
    if (!silent) setLoading(true);
    setError("");
    try {
      const meResponse = await fetch(`${basePath}/api/auth/me/`, { cache: "no-store" });
      if (!currentLoad()) return false;
      if (!meResponse.ok) { router.replace(`/login?returnTo=${encodeURIComponent(router.asPath || "/tasks")}`); return false; }
      const me = await meResponse.json();
      if (!currentLoad()) return false;
      if (!me.user) { router.replace(`/login?returnTo=${encodeURIComponent(router.asPath || "/tasks")}`); return false; }
      setUser(me.user);
      const brothersResponse = await fetch(`${basePath}/api/chat/brothers/?scope=managed`, { cache: "no-store" });
      if (!currentLoad()) return false;
      if (brothersResponse.ok) {
        const brotherPayload = await brothersResponse.json();
        setBrothers(Array.isArray(brotherPayload.items) ? brotherPayload.items : []);
      }
      const query = ["open", "pending_reply", "follow_up", "snoozed", "done"].includes(statusFilter) && statusFilter !== "open" ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const response = await fetch(`${basePath}/api/chat/tasks/${query}`, { cache: "no-store" });
      if (!currentLoad()) return false;
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取维护任务失败");
      const allItems = Array.isArray(payload.items) ? payload.items : [];
      setItems(statusFilter === "open" ? allItems.filter((item) => !["done", "dismissed"].includes(item.status)) : allItems);
      setSummary(payload.summary || null);
      return true;
    } catch (caught) {
      if (currentLoad()) setError(caught?.message || "读取维护任务失败");
      return false;
    } finally {
      if (!silent && currentLoad()) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const openCount = useMemo(() => Number(summary?.pendingReply || 0) + Number(summary?.followUp || 0) + Number(summary?.snoozed || 0), [summary]);
  const canWrite = user?.role === "anchor";
  const canCreate = ["anchor", "operator", "super_admin"].includes(user?.role);
  const workBackendHref = user?.role === "anchor" ? `${basePath}/chat/` : `${basePath}/admin/`;

  const createTask = async (event) => {
    event.preventDefault();
    if (!form.brotherId || !form.title.trim()) {
      setError("请选择维护对象并填写任务标题");
      return;
    }
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const requestId = createRequestId || globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!createRequestId) setCreateRequestId(requestId);
      const response = await fetch(`${basePath}/api/chat/tasks/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, title: form.title.trim(), dueAt: form.dueAt || null, requestId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "新增维护任务失败");
      const refreshed = await load({ silent: true });
      if (!refreshed) throw new Error("任务已保存，但刷新列表失败，请稍后重试");
      setForm(EMPTY_FORM);
      setCreateRequestId("");
      setNotice("维护任务已添加");
    } catch (caught) {
      setError(caught?.message || "新增维护任务失败");
    } finally {
      setCreating(false);
    }
  };

  const updateTask = async (taskId, status) => {
    setBusyId(`${taskId}:${status}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${basePath}/api/chat/tasks/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "更新任务失败");
      const refreshed = await load({ silent: true });
      if (!refreshed) throw new Error("任务已更新，但刷新列表失败，请稍后重试");
      setNotice(status === "done" ? "任务已完成" : status === "snoozed" ? "任务已放到稍后处理" : "任务状态已更新");
    } catch (caught) {
      setError(caught?.message || "更新任务失败");
    } finally {
      setBusyId("");
    }
  };

  const roleLabel = user?.role === "super_admin" ? "最高管理" : user?.role === "operator" ? "运营" : "主播";

  return <main className={styles.page}>
    <section className={styles.shell}>
      <header className={styles.header}>
        <div><span className={styles.kicker}>MAINTENANCE QUEUE</span><h1>维护任务中心</h1><p>把每一次确认过的消息，变成主播可以完成的下一步。</p></div>
        <div className={styles.headerActions}><span className={styles.role}>{user ? `${user.name} · ${roleLabel}` : "正在检查权限"}</span><a className={styles.workBackendLink} href={workBackendHref}>返回工作后台 <span aria-hidden="true">↗</span></a></div>
      </header>
      <nav className={styles.tabs} aria-label="任务筛选">
        {[['open', '待处理'], ['pending_reply', '待回复'], ['follow_up', '待跟进'], ['snoozed', '稍后处理'], ['done', '已完成']].map(([value, label]) => <button key={value} type="button" className={statusFilter === value ? styles.tabActive : ""} onClick={() => setStatusFilter(value)}>{label}{value === "open" ? <b>{openCount}</b> : value === "pending_reply" ? <b>{summary?.pendingReply || 0}</b> : value === "follow_up" ? <b>{summary?.followUp || 0}</b> : value === "snoozed" ? <b>{summary?.snoozed || 0}</b> : <b>{summary?.done || 0}</b>}</button>)}
      </nav>
      {notice && <div className={styles.notice} role="status">✓ {notice}</div>}
      {error && <div className={styles.error} role="alert">! {error}</div>}
      <section className={styles.summary} aria-label="任务概览">
        <div><span>待回复</span><strong>{summary?.pendingReply ?? "—"}</strong><small>新消息确认后自动进入</small></div>
        <div><span>待跟进</span><strong>{summary?.followUp ?? "—"}</strong><small>需要留出一点时间</small></div>
        <div><span>开放任务</span><strong>{loading ? "—" : openCount}</strong><small>{canWrite ? "主播可以更新状态" : canCreate ? "可新增任务，状态由主播更新" : "当前账号只读查看"}</small></div>
      </section>
      {canCreate && <section className={styles.createPanel} aria-labelledby="create-task-title">
        <div className={styles.createHeader}><div><span className={styles.createKicker}>NEW TASK</span><h2 id="create-task-title">添加维护任务</h2></div><small>只记录建议，不会自动发送消息</small></div>
        <form className={styles.createForm} onSubmit={createTask}>
          <label>维护对象<select value={form.brotherId} onChange={(event) => setForm((current) => ({ ...current, brotherId: event.target.value }))} required><option value="">请选择维护对象</option>{brothers.map((brother) => <option key={brother.id} value={brother.id}>{brother.nickname}</option>)}</select></label>
          <label>任务标题<input value={form.title} maxLength={120} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="例如：今晚跟进工作状态" required /></label>
          <label>下一步建议<input value={form.nextAction} maxLength={1000} onChange={(event) => setForm((current) => ({ ...current, nextAction: event.target.value }))} placeholder="例如：明晚再自然问候" /></label>
          <label>备注原因<textarea value={form.reason} maxLength={1000} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="补充为什么需要跟进" rows={2} /></label>
          <div className={styles.createRow}><label>优先级<select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}><option value="high">优先</option><option value="normal">常规</option><option value="low">低优先</option></select></label><label>提醒时间<input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} /></label></div>
          <button className={styles.createButton} type="submit" disabled={creating || !brothers.length}>{creating ? "正在添加…" : "添加维护任务"}</button>
          {!brothers.length && <small className={styles.createHint}>当前权限范围内还没有维护对象</small>}
        </form>
      </section>}
      {loading ? <div className={styles.empty}>正在读取维护任务…</div> : items.length === 0 ? <div className={styles.empty}><span>✓</span><strong>{statusFilter === "open" ? "当前没有待处理任务" : "这个筛选下还没有任务"}</strong><p>确认一条大哥消息后，系统会自动建立待回复任务。</p></div> : <div className={styles.list}>{items.map((item) => {
        const busy = busyId.startsWith(`${item.id}:`);
        const isOpen = !["done", "dismissed"].includes(item.status);
        return <article className={`${styles.card} ${styles[`priority${item.priority}`] || ""}`} key={item.id}>
          <div className={styles.cardTop}><div><span className={styles.status}>{STATUS_LABELS[item.status] || item.status}</span><span className={styles.priority}>{PRIORITY_LABELS[item.priority] || item.priority}</span><h2>{item.title}</h2></div><time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></div>
          <div className={styles.ownerLine}><strong>{item.brotherNickname || "维护对象"}</strong><span>{item.ownerName || "主播"}</span>{item.operatorName && <span>运营：{item.operatorName}</span>}</div>
          <p className={styles.reason}>{item.reason || "等待主播确认下一步"}</p>
          {item.nextAction && <div className={styles.nextAction}><span>下一步</span>{item.nextAction}</div>}
          <div className={styles.cardFooter}><small>更新时间 {formatDate(item.updatedAt)}{item.dueAt ? ` · 提醒 ${formatDate(item.dueAt)}` : ""}</small><div className={styles.cardActions}>{user?.role !== "anchor" && <span className={styles.readonly}>只读查看</span>}{user?.role === "anchor" && isOpen && <><button type="button" disabled={busy} onClick={() => updateTask(item.id, "snoozed")}>{busyId === `${item.id}:snoozed` ? "处理中…" : "稍后处理"}</button>{item.status !== "follow_up" && <button type="button" disabled={busy} onClick={() => updateTask(item.id, "follow_up")}>{busyId === `${item.id}:follow_up` ? "处理中…" : "转待跟进"}</button>}<button type="button" className={styles.doneButton} disabled={busy} onClick={() => updateTask(item.id, "done")}>{busyId === `${item.id}:done` ? "处理中…" : "已完成"}</button></>}</div></div>
        </article>;
      })}</div>}
      <footer className={styles.footerNote}>任务只记录建议跟进和主播确认结果；不会自动发送抖音消息，也不会读取平台后台。</footer>
    </section>
  </main>;
}
