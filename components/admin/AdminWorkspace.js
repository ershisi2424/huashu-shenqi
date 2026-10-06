import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import styles from "./admin.module.css";

const AUDIT_ACTION_LABELS = {
  "bootstrap.admin.create": "初始化最高权限",
  "operator.register": "运营注册",
  "operator.approve": "批准运营",
  "operator.reject": "拒绝运营",
  "anchor.apply": "主播申请",
  "anchor.create": "创建主播",
  "anchor.approve": "批准主播",
  "anchor.reject": "拒绝主播",
  "auth.login": "登录",
  "chat.brother.create": "新增维护对象",
  "chat.message.append": "记录聊天消息",
  "chat.message.edit": "修改聊天消息",
};

const AUDIT_ROLE_LABELS = { super_admin: "最高管理", operator: "运营", anchor: "主播" };

export default function AdminWorkspace() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [items, setItems] = useState([]);
  const [overview, setOverview] = useState(null);
  const [anchorForm, setAnchorForm] = useState({ phone: "", name: "", password: "" });
  const [anchorItems, setAnchorItems] = useState([]);
  const [pendingAnchors, setPendingAnchors] = useState([]);
  const [anchorDecisionId, setAnchorDecisionId] = useState("");
  const [auditItems, setAuditItems] = useState([]);
  const [auditCursor, setAuditCursor] = useState(null);
  const [auditFilters, setAuditFilters] = useState({ role: "", action: "", from: "", to: "" });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [expandedAuditId, setExpandedAuditId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAudit = async ({ reset = false } = {}) => {
    setAuditLoading(true);
    setAuditError("");
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (!reset && auditCursor) params.set("cursor", auditCursor);
      if (auditFilters.role) params.set("role", auditFilters.role);
      if (auditFilters.action) params.set("action", auditFilters.action);
      if (auditFilters.from) params.set("from", `${auditFilters.from}T00:00:00.000Z`);
      if (auditFilters.to) params.set("to", `${auditFilters.to}T23:59:59.999Z`);
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/ops/audit/?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取操作审计失败");
      const incoming = Array.isArray(payload.items) ? payload.items : [];
      setAuditItems((current) => {
        if (reset) return incoming;
        const known = new Set(current.map((item) => item.id));
        return [...current, ...incoming.filter((item) => !known.has(item.id))];
      });
      setAuditCursor(payload.nextCursor || null);
      if (reset) setExpandedAuditId("");
    } catch (caught) {
      setAuditError(caught?.message || "读取操作审计失败");
    } finally {
      setAuditLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const meResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/me/`);
      if (!meResponse.ok) return router.replace("/login?returnTo=/admin");
      const mePayload = await meResponse.json();
      setCurrentUser(mePayload.user || null);
      if (!["super_admin", "operator"].includes(mePayload.user?.role)) {
        setError("当前账号不能查看运营复盘");
        return;
      }
      const overviewResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/ops/overview/`);
      const overviewPayload = await overviewResponse.json();
      if (!overviewResponse.ok) throw new Error(overviewPayload.error || "读取运营复盘失败");
      setOverview(overviewPayload);
      await loadAudit({ reset: true });
      if (mePayload.user.role === "super_admin") {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/approvals/`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "读取审批列表失败");
        setItems(Array.isArray(payload.items) ? payload.items : []);
      } else {
        const anchorsResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/anchors/`);
        const anchorsPayload = await anchorsResponse.json();
        if (!anchorsResponse.ok) throw new Error(anchorsPayload.error || "读取主播账号失败");
        setAnchorItems(Array.isArray(anchorsPayload.items) ? anchorsPayload.items : []);
        const pendingResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/anchor-approvals/`);
        const pendingPayload = await pendingResponse.json();
        if (!pendingResponse.ok) throw new Error(pendingPayload.error || "读取主播申请失败");
        setPendingAnchors(Array.isArray(pendingPayload.items) ? pendingPayload.items : []);
      }
    } catch (caught) {
      setError(caught?.message || "读取审批列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const decide = async (userId, action) => {
    setNotice("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/approvals/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "审批失败");
      setItems((current) => current.filter((item) => item.id !== userId));
      setNotice(action === "approve" ? "运营账号已批准，可以登录" : "运营账号已拒绝");
    } catch (caught) {
      setError(caught?.message || "审批失败");
    }
  };

  const createAnchor = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/anchors/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(anchorForm),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "新增主播账号失败");
      setAnchorItems((current) => [...current, payload.user]);
      setAnchorForm({ phone: "", name: "", password: "" });
      setNotice("主播账号已创建，可以用手机号和密码登录");
    } catch (caught) {
      setError(caught?.message || "新增主播账号失败");
    }
  };

  const decideAnchor = async (userId, action) => {
    setAnchorDecisionId(userId);
    setError("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/anchor-approvals/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "主播审批失败");
      setPendingAnchors((current) => current.filter((item) => item.id !== userId));
      setAnchorItems((current) => action === "approve" ? [...current, payload.user] : current);
      setNotice(action === "approve" ? "主播账号已批准，可以登录" : "主播申请已拒绝");
    } catch (caught) {
      setError(caught?.message || "主播审批失败");
    } finally {
      setAnchorDecisionId("");
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.topline}><div><div className={styles.eyebrow}>OPERATIONS CONSOLE</div><h1>{currentUser?.role === "operator" ? "运营复盘" : "最高权限运营中心"}</h1><p>查看主播回复情况、聊天记录和账号权限。</p></div><button onClick={() => router.push("/chat")}>回到聊天</button></div>
        {currentUser && <div className={styles.identity}>当前账号：{currentUser.name} · {currentUser.role === "super_admin" ? "超级管理员 · 全量查看" : "运营 · 所属主播只读复盘"}</div>}
        {notice && <div className={styles.notice}>{notice}</div>}
        {error && <div className={styles.error}>{error}</div>}
        {loading ? <div className={styles.empty}>读取中…</div> : <>
          {currentUser?.role === "super_admin" && <section><div className={styles.sectionTitle}><strong>待审批运营</strong><span>{items.length}</span></div>{items.length === 0 ? <div className={styles.empty}>暂无待审批运营</div> : <div className={styles.list}>{items.map((item) => <article className={styles.item} key={item.id}><div><strong>{item.name}</strong><small>{item.phone} · 注册于 {new Date(item.createdAt).toLocaleString("zh-CN")}</small></div><div className={styles.actions}><button onClick={() => decide(item.id, "approve")}>批准</button><button onClick={() => decide(item.id, "reject")}>拒绝</button></div></article>)}</div>}</section>}
          <section><div className={styles.sectionTitle}><strong>运营复盘</strong><span>只读</span></div><div className={styles.metrics}><div><b>{overview?.operators?.length || 0}</b><small>运营账号</small></div><div><b>{overview?.anchors?.length || 0}</b><small>主播账号</small></div><div><b>{overview?.recentMessages?.length || 0}</b><small>最近消息</small></div></div><div className={styles.subsectionTitle}>主播账号</div>{(overview?.anchors || anchorItems).length === 0 ? <div className={styles.empty}>还没有主播账号</div> : <div className={styles.list}>{(overview?.anchors || anchorItems).map((item) => <article className={styles.item} key={item.id}><div><strong>{item.name}</strong><small>{item.phone} · {item.status === "active" ? "可登录" : item.status}</small></div><div className={styles.itemStats}>{item.brotherCount || 0} 位维护对象 · {item.messageCount || 0} 条消息</div></article>)}</div>}</section>
          {currentUser?.role === "operator" && <section className={styles.anchorCreate}>
            <div className={styles.subsectionTitle}>新增主播账号</div>
            <form onSubmit={createAnchor} className={styles.formGrid}>
              <input aria-label="主播姓名" placeholder="主播姓名" value={anchorForm.name} onChange={(event) => setAnchorForm({ ...anchorForm, name: event.target.value })} />
              <input aria-label="主播手机号" placeholder="手机号" value={anchorForm.phone} onChange={(event) => setAnchorForm({ ...anchorForm, phone: event.target.value })} />
              <input
                aria-label="主播密码"
                type="password"
                placeholder="初始密码（至少 8 位）"
                value={anchorForm.password}
                onChange={(event) => setAnchorForm({ ...anchorForm, password: event.target.value })}
              />
              <button type="submit">创建主播登录</button>
            </form>
          </section>}
          {currentUser?.role === "operator" && <section><div className={styles.sectionTitle}><strong>待审批主播</strong><span>{pendingAnchors.length}</span></div>{pendingAnchors.length === 0 ? <div className={styles.empty}>暂无待审批主播</div> : <div className={styles.list}>{pendingAnchors.map((item) => <article className={styles.item} key={item.id}><div><strong>{item.name}</strong><small>{item.phone} · 申请于 {new Date(item.createdAt).toLocaleString("zh-CN")}</small></div><div className={styles.actions}><button disabled={anchorDecisionId === item.id} onClick={() => decideAnchor(item.id, "approve")}>{anchorDecisionId === item.id ? "处理中…" : "批准"}</button><button disabled={anchorDecisionId === item.id} onClick={() => decideAnchor(item.id, "reject")}>拒绝</button></div></article>)}</div>}</section>}
          <section><div className={styles.subsectionTitle}>最近消息记录</div>{!overview?.recentMessages?.length ? <div className={styles.empty}>还没有服务端聊天记录</div> : <div className={styles.messageList}>{overview.recentMessages.map((message) => <article key={message.id}><div><strong>{message.brotherNickname}</strong><small>{message.anchorName}{message.operatorName ? ` · ${message.operatorName}` : ""} · {new Date(message.createdAt).toLocaleString("zh-CN")}</small></div><p className={message.sender === "anchor" ? styles.anchorMessage : ""}>{message.text}</p></article>)}</div>}</section>
          <section className={styles.auditSection}>
            <div className={styles.sectionTitle}><strong>操作审计</strong><span>只读 · {currentUser?.role === "super_admin" ? "全量" : "自己及所辖主播"}</span></div>
            <div className={styles.auditFilters}>
              <label>角色筛选<select value={auditFilters.role} onChange={(event) => setAuditFilters({ ...auditFilters, role: event.target.value })}><option value="">全部角色</option><option value="super_admin">最高管理</option><option value="operator">运营</option><option value="anchor">主播</option></select></label>
              <label>动作筛选<select value={auditFilters.action} onChange={(event) => setAuditFilters({ ...auditFilters, action: event.target.value })}><option value="">全部动作</option>{Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>开始日期<input type="date" value={auditFilters.from} onChange={(event) => setAuditFilters({ ...auditFilters, from: event.target.value })} /></label>
              <label>结束日期<input type="date" value={auditFilters.to} onChange={(event) => setAuditFilters({ ...auditFilters, to: event.target.value })} /></label>
              <button className={styles.auditQueryButton} type="button" onClick={() => loadAudit({ reset: true })} disabled={auditLoading}>{auditLoading ? "查询中…" : "查询审计"}</button>
            </div>
            {auditError && <div className={styles.error}>{auditError}</div>}
            {!auditLoading && !auditItems.length ? <div className={styles.empty}>当前筛选范围暂无操作记录</div> : <div className={styles.auditList}>{auditItems.map((item) => {
              const actorLabel = item.actor ? `${item.actor.name} · ${AUDIT_ROLE_LABELS[item.actor.role] || item.actor.role}` : "系统记录";
              const targetLabel = item.target ? `目标：${item.target.name} · ${AUDIT_ROLE_LABELS[item.target.role] || item.target.role}` : "";
              const expanded = expandedAuditId === item.id;
              return <article className={styles.auditItem} key={item.id}>
                <div className={styles.auditItemHead}><div><strong>{AUDIT_ACTION_LABELS[item.action] || item.action}</strong><small>{new Date(item.createdAt).toLocaleString("zh-CN")} · {actorLabel}</small></div><span>{item.chatMessage ? "聊天" : "操作"}</span></div>
                {(targetLabel || item.chatMessage?.brotherNickname) && <div className={styles.auditContext}>{targetLabel}{item.chatMessage?.brotherNickname ? ` · 维护对象：${item.chatMessage.brotherNickname}` : ""}</div>}
                {item.chatMessage && <><button className={styles.auditExpand} type="button" aria-expanded={expanded} onClick={() => setExpandedAuditId(expanded ? "" : item.id)}>{expanded ? "收起聊天正文" : "展开聊天正文"}</button>{expanded && <div className={styles.auditChatBody}><span>{item.chatMessage.sender === "anchor" ? "主播（右侧）" : "大哥（左侧）"}</span><p>{item.chatMessage.text}</p><small>状态：{item.chatMessage.status}{item.chatMessage.sentAt ? ` · 已发送于 ${new Date(item.chatMessage.sentAt).toLocaleString("zh-CN")}` : ""}</small></div>}</>}
              </article>;
            })}</div>}
            {auditCursor && <button className={styles.auditMore} type="button" onClick={() => loadAudit()} disabled={auditLoading}>{auditLoading ? "读取中…" : "加载更多"}</button>}
          </section>
        </>}
        <p className={styles.boundary}>聊天内容来自主播手动确认或截图逐条确认；运营只能查看服务端已同步记录，不会代替主播向抖音发送消息。</p>
      </section>
    </main>
  );
}
