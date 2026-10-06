import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminNav from "./AdminNav";
import styles from "./admin.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const roleLabels = { super_admin: "最高管理", operator: "运营" };

function formatDate(value) {
  if (!value) return "时间未记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未记录" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function initialOf(value) {
  return (value || "？").trim().slice(0, 1) || "？";
}

export default function ApprovalCenter() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [anchorItems, setAnchorItems] = useState([]);
  const [overview, setOverview] = useState(null);
  const [anchorForm, setAnchorForm] = useState({ phone: "", name: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [operatorLoading, setOperatorLoading] = useState(false);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [operatorError, setOperatorError] = useState("");
  const [anchorError, setAnchorError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOperatorQueue = async () => {
    setOperatorLoading(true);
    setOperatorError("");
    try {
      const response = await fetch(`${basePath}/api/auth/approvals/`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取运营审批列表失败");
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (caught) {
      setOperatorError(caught?.message || "读取运营审批列表失败");
    } finally {
      setOperatorLoading(false);
    }
  };

  const loadAnchorQueue = async ({ visibleAsOperator = false } = {}) => {
    setAnchorLoading(true);
    setAnchorError("");
    try {
      const response = await fetch(`${basePath}/api/auth/anchor-approvals/`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取主播审批列表失败");
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setAnchorItems(nextItems);
      if (visibleAsOperator) setItems(nextItems);
      return nextItems;
    } catch (caught) {
      setAnchorError(caught?.message || "读取主播审批列表失败");
    } finally {
      setAnchorLoading(false);
    }
  };

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const meResponse = await fetch(`${basePath}/api/auth/me/`, { cache: "no-store" });
      if (!meResponse.ok) return router.replace("/login?returnTo=/admin");
      const me = await meResponse.json();
      if (!["super_admin", "operator"].includes(me.user?.role)) return router.replace("/chat");
      setUser(me.user);
      if (me.user.role === "super_admin") {
        await Promise.all([loadOperatorQueue(), loadAnchorQueue()]);
        setOverview(null);
      } else {
        const pendingAnchors = await loadAnchorQueue({ visibleAsOperator: true });
        setItems(pendingAnchors || []);
        setAnchorItems([]);
        const overviewResponse = await fetch(`${basePath}/api/ops/overview/?limit=200`, { cache: "no-store" });
        const overviewPayload = await overviewResponse.json();
        if (!overviewResponse.ok) throw new Error(overviewPayload.error || "读取主播工作台列表失败");
        setOverview(overviewPayload);
      }
    } catch (caught) {
      setError(caught?.message || "读取审批列表失败");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const decide = async (userId, action, kind = "operator") => {
    setBusyId(`${kind}:${action}:${userId}`);
    setError("");
    setNotice("");
    try {
      const endpoint = kind === "anchor" ? "/api/auth/anchor-approvals/" : "/api/auth/approvals/";
      const response = await fetch(`${basePath}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "审批失败");
      if (kind === "anchor") await loadAnchorQueue({ visibleAsOperator: user?.role === "operator" });
      else await loadOperatorQueue();
      setNotice(action === "approve" ? "申请已批准，账号可以继续使用" : "申请已拒绝");
    } catch (caught) {
      setError(caught?.message || "审批失败");
    } finally {
      setBusyId("");
    }
  };

  const createAnchor = async (event) => {
    event.preventDefault();
    setBusyId("create");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${basePath}/api/auth/anchors/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(anchorForm) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "新增主播账号失败");
      setAnchorForm({ phone: "", name: "", password: "" });
      await load({ silent: true });
      setNotice("主播账号已创建，可以登录");
    } catch (caught) {
      setError(caught?.message || "新增主播账号失败");
    } finally {
      setBusyId("");
    }
  };

  const roleLabel = roleLabels[user?.role] || "后台用户";
  const pendingLabel = user?.role === "super_admin" ? "待审批运营" : "待审批主播";
  const pendingHint = user?.role === "super_admin" ? "审批通过后，运营才能进入后台处理主播申请。" : "审批通过后，主播即可登录并开始记录维护对象。";
  const pendingCount = items.length + anchorItems.length;

  const renderApprovalQueue = (queueItems, kind, title, hint, emptyTitle, emptyHint) => <section className={styles.approvalSection} aria-labelledby={`${kind}-approval-queue-title`}>
    <div className={styles.approvalSectionHead}><div><span className={styles.approvalSectionKicker}>QUEUE</span><h2 id={`${kind}-approval-queue-title`}>{title}</h2><p>{hint}</p></div><span className={styles.approvalCount} aria-label={`${queueItems.length} 条待处理申请`}>{queueItems.length}</span></div>
    {(kind === "operator" ? operatorError : anchorError) ? <div className={styles.approvalError} role="alert">{kind === "operator" ? operatorError : anchorError}</div> : null}
    {queueItems.length === 0 ? <div className={styles.approvalEmpty}><span className={styles.approvalEmptyMark} aria-hidden="true">✓</span><div><strong>{emptyTitle}</strong><p>{emptyHint}</p></div></div> : <div className={styles.approvalQueue}>{queueItems.map((item, index) => {
      const approving = busyId === `${kind}:approve:${item.id}`;
      const rejecting = busyId === `${kind}:reject:${item.id}`;
      return <article className={styles.approvalItem} key={item.id}><span className={styles.approvalItemIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className={styles.approvalItemMain}><span className={styles.approvalAvatar} aria-hidden="true">{initialOf(item.name)}</span><div className={styles.approvalItemCopy}><h3>{item.name}</h3><p>{item.phone}{kind === "anchor" && item.operatorId ? " · 已选择运营" : ""}</p><time dateTime={item.createdAt}>申请于 {formatDate(item.createdAt)}</time></div></div><div className={styles.approvalItemActions}><button type="button" className={styles.approveButton} disabled={!!busyId} aria-busy={approving} onClick={() => decide(item.id, "approve", kind)}>{approving ? "正在批准…" : "批准"}</button><button type="button" className={styles.rejectButton} disabled={!!busyId} aria-busy={rejecting} onClick={() => decide(item.id, "reject", kind)}>{rejecting ? "正在拒绝…" : "拒绝"}</button></div></article>;
    })}</div>}
  </section>;

  return <main className={`${styles.page} ${styles.approvalPage}`}>
    <section className={styles.approvalCard}>
      <header className={styles.approvalHeader}>
        <div className={styles.approvalHeading}>
          <span className={styles.approvalKicker}>权限审批</span>
          <h1>审批中心</h1>
          <p>{user?.role === "super_admin" ? "处理全部运营和主播注册申请" : "处理主播注册申请"}</p>
        </div>
        <div className={styles.approvalHeaderActions}>
          {user && <span className={styles.approvalRole}><span className={styles.approvalRoleDot} aria-hidden="true" />{roleLabel}</span>}
          <a className={styles.approvalBackLink} href={`${basePath}/chat/`}>回到聊天 <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <AdminNav role={user?.role} active="approval" />

      {user && <div className={styles.approvalIdentity}><span>{user.name}</span><span aria-hidden="true">·</span><span>{roleLabel}</span><small>当前登录</small></div>}

      <section className={styles.approvalSummary} aria-label="审批概览">
        <div className={`${styles.approvalSummaryCard} ${styles.approvalSummaryPrimary}`}>
          <span>待处理申请</span>
          <strong>{loading ? "—" : pendingCount}</strong>
          <small>{loading ? "正在读取" : pendingCount ? "需要你处理" : "当前无需处理"}</small>
        </div>
        <div className={styles.approvalSummaryCard}>
          <span>当前权限</span>
          <strong>{roleLabel}</strong>
          <small>{user?.role === "super_admin" ? "运营与主播审批" : "主播账号审批"}</small>
        </div>
        {user?.role === "operator" && <div className={styles.approvalSummaryCard}>
          <span>我的主播</span>
          <strong>{loading ? "—" : overview?.anchors?.length || 0}</strong>
          <small>可进入只读工作台</small>
        </div>}
      </section>

      {notice && <div className={styles.approvalNotice} role="status" aria-live="polite"><span className={styles.approvalNoticeIcon} aria-hidden="true">✓</span><span>{notice}</span></div>}
      {error && <div className={styles.approvalError} role="alert"><span className={styles.approvalErrorIcon} aria-hidden="true">!</span><span>{error}</span></div>}

      {loading ? <div className={styles.approvalLoading} role="status" aria-live="polite" aria-busy="true"><span className={styles.approvalSpinner} aria-hidden="true" />正在读取审批申请…</div> : <>
        {user?.role === "operator"
          ? renderApprovalQueue(items, "anchor", pendingLabel, pendingHint, "当前没有待处理主播申请", "主播注册申请提交后，会出现在这里。")
          : renderApprovalQueue(items, "operator", pendingLabel, pendingHint, "当前没有待处理运营申请", "新的运营注册申请提交后，会出现在这里。")}
        {user?.role === "super_admin" && renderApprovalQueue(anchorItems, "anchor", "待审批主播", "最高管理员可以直接处理所有运营名下的主播申请。", "当前没有待处理主播申请", "主播选择运营并提交申请后，会出现在这里。")}

        {user?.role === "operator" && <>
          <section className={styles.createPanel} aria-labelledby="create-anchor-title">
            <div className={styles.createPanelHeader}><div><span className={styles.approvalSectionKicker}>NEW ACCOUNT</span><h2 id="create-anchor-title">新增主播账号</h2><p>直接创建已绑定到你名下的主播登录。</p></div><span className={styles.createPanelIndex} aria-hidden="true">02</span></div>
            <form onSubmit={createAnchor} className={styles.createForm} aria-busy={busyId === "create"}>
              <label className={styles.approvalField} htmlFor="anchor-name"><span>主播姓名</span><input id="anchor-name" required placeholder="例如：小满" value={anchorForm.name} onChange={(event) => setAnchorForm({ ...anchorForm, name: event.target.value })} /></label>
              <label className={styles.approvalField} htmlFor="anchor-phone"><span>手机号</span><input id="anchor-phone" required inputMode="tel" placeholder="登录手机号" value={anchorForm.phone} onChange={(event) => setAnchorForm({ ...anchorForm, phone: event.target.value })} /></label>
              <label className={styles.approvalField} htmlFor="anchor-password"><span>初始密码</span><input
                id="anchor-password"
                required
                minLength={8}
                type="password"
                placeholder="至少 8 位"
                value={anchorForm.password}
                onChange={(event) => setAnchorForm({ ...anchorForm, password: event.target.value })}
              /></label>
              <button className={styles.createButton} disabled={!!busyId} type="submit">{busyId === "create" ? <><span className={styles.buttonSpinner} aria-hidden="true" />正在创建…</> : "创建账号"}</button>
            </form>
          </section>

          <section className={`${styles.approvalSection} ${styles.anchorSection}`} aria-labelledby="my-anchors-title">
            <div className={styles.approvalSectionHead}><div><span className={styles.approvalSectionKicker}>WORKSPACE</span><h2 id="my-anchors-title">我的主播</h2><p>进入只读工作台，查看完整维护记录。</p></div><span className={styles.approvalCount}>{overview?.anchors?.length || 0}</span></div>
            {!overview?.anchors?.length ? <div className={styles.approvalEmpty}><span className={styles.approvalEmptyMark} aria-hidden="true">—</span><div><strong>还没有已绑定的主播</strong><p>主播注册并通过审批后，会出现在这里。</p></div></div> : <div className={styles.anchorList}>{overview.anchors.map((anchor) => <article className={styles.anchorItem} key={anchor.id}><div className={styles.anchorItemMain}><span className={styles.anchorAvatar} aria-hidden="true">{initialOf(anchor.name)}</span><div><h3>{anchor.name}</h3><p>{anchor.phone} · {anchor.brotherCount || 0} 个维护对象</p></div><span className={`${styles.anchorStatus} ${anchor.status === "active" ? styles.anchorStatusActive : ""}`}>{anchor.status === "active" ? "可登录" : anchor.status}</span></div><a className={styles.anchorOpenLink} href={`${basePath}/chat/viewer/?anchorId=${encodeURIComponent(anchor.id)}`}>进入主播工作台 <span aria-hidden="true">↗</span></a></article>)}</div>}
          </section>
        </>}
      </>}
    </section>
  </main>;
}
