import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminNav from "./AdminNav";
import styles from "./admin.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const roleLabels = { super_admin: "最高管理", operator: "运营", anchor: "主播" };
const actionLabels = { "auth.login": "登录", "operator.register": "运营注册", "operator.approve": "批准运营", "anchor.apply": "主播申请", "anchor.create": "创建主播", "anchor.approve": "批准主播", "chat.brother.create": "新增维护对象", "chat.message.append": "记录聊天消息", "chat.message.edit": "修改聊天消息", "user.disable": "停用账号", "user.restore": "恢复账号", "user.delete": "永久删除账号" };

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未记录" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [logs, setLogs] = useState([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState("");

  const loadGroups = async () => {
    setLoading(true);
    setError("");
    try {
      const meResponse = await fetch(`${basePath}/api/auth/me/`);
      if (!meResponse.ok) return router.replace("/login?returnTo=/admin/audit");
      const me = await meResponse.json();
      if (!["super_admin", "operator"].includes(me.user?.role)) return router.replace("/chat");
      setUser(me.user);
      const params = role ? `?role=${encodeURIComponent(role)}` : "";
      const response = await fetch(`${basePath}/api/ops/audit/actors/${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取操作人列表失败");
      setGroups(Array.isArray(payload.items) ? payload.items : []);
      if (selected && !payload.items.some((item) => item.actor.id === selected.id)) {
        setSelected(null);
        setLogs([]);
      }
    } catch (caught) {
      setError(caught?.message || "读取操作人列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGroups(); }, [role]);

  const openActor = async (group) => {
    setSelected(group.actor);
    setDetailLoading(true);
    setExpanded("");
    setError("");
    try {
      const response = await fetch(`${basePath}/api/ops/audit/actor/${encodeURIComponent(group.actor.id)}/?limit=100`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取操作日志失败");
      setLogs(Array.isArray(payload.items) ? payload.items : []);
    } catch (caught) {
      setError(caught?.message || "读取操作日志失败");
      setLogs([]);
    } finally {
      setDetailLoading(false);
    }
  };

  return <main className={`${styles.adminPage} ${styles.auditPage}`}>
    <section className={styles.adminCard}>
      <header className={styles.adminHeader}>
        <div className={styles.adminHeading}><span className={styles.adminKicker}>运营记录</span><h1>操作日志</h1><p>按运营或主播查看谁在什么时候做了什么。</p></div>
        <div className={styles.adminHeaderActions}>{user && <span className={styles.adminRole}><span className={styles.adminRoleDot} aria-hidden="true" />{user.role === "super_admin" ? "最高管理" : "运营"}</span>}<a className={styles.adminBackLink} href={`${basePath}/chat/`}>回到聊天 <span aria-hidden="true">↗</span></a></div>
      </header>
      <AdminNav role={user?.role} active="audit" />
      {user && <div className={styles.adminIdentity}><span>{user.name}</span><span aria-hidden="true">·</span><span>{user.role === "super_admin" ? "全量日志" : "仅自己及所辖主播"}</span><small>只读</small></div>}
      <section className={styles.adminSummary} aria-label="日志概览"><div className={styles.adminSummaryCard}><span>操作人</span><strong>{loading ? "—" : groups.length}</strong><small>按角色筛选</small></div><div className={`${styles.adminSummaryCard} ${styles.adminSummaryAccent}`}><span>当前筛选</span><strong>{role ? roleLabels[role] : "全部"}</strong><small>选择操作人查看详情</small></div></section>
      {error && <div className={styles.adminNotice} role="alert"><span className={styles.adminNoticeIcon} aria-hidden="true">!</span><span>{error}</span></div>}
      <div className={styles.auditToolbarUnified}><label htmlFor="audit-role">角色筛选<select id="audit-role" value={role} onChange={(event) => setRole(event.target.value)}><option value="">全部角色</option><option value="operator">运营</option><option value="anchor">主播</option><option value="super_admin">最高管理</option></select></label><span>{groups.length} 位操作人</span></div>
      {loading ? <div className={styles.adminLoading} role="status" aria-live="polite" aria-busy="true"><span className={styles.adminSpinner} aria-hidden="true" />正在读取操作日志…</div> : <div className={styles.auditLayoutUnified}><aside className={styles.actorPanel}><div className={styles.panelLabel}>操作人</div><div className={styles.actorList}>{groups.length === 0 ? <div className={styles.adminEmpty}>暂无操作记录</div> : groups.map((group, index) => { const actorKey = group.actor.id || `actor-${index}`; return <Fragment key={actorKey}><button type="button" className={`${styles.actorCard} ${selected?.id === group.actor.id ? styles.actorCardActive : ""}`} onClick={() => openActor(group)}><span className={styles.actorAvatar}>{(group.actor.name || "？").slice(0, 1)}</span><span className={styles.actorMeta}><strong>{group.actor.name}</strong><small>{roleLabels[group.actor.role] || group.actor.role} · {group.eventCount} 次操作</small><small>最近：{group.lastActionAt ? formatDate(group.lastActionAt) : "暂无"}</small></span></button></Fragment>; })}</div></aside><section className={styles.auditDetail}><div className={styles.detailHead}>{selected ? <div><span className={styles.panelLabel}>操作详情</span><strong>{selected.name}</strong><small>{roleLabels[selected.role] || selected.role} · {selected.phone}</small></div> : <div><span className={styles.panelLabel}>操作详情</span><strong>选择一位操作人</strong><small>左侧列表会保留当前筛选结果</small></div>}{selected && <div className={styles.detailActions}>{selected.role === "anchor" && <button type="button" onClick={() => router.push(`/chat/viewer?anchorId=${encodeURIComponent(selected.id)}`)}>进入工作台</button>}<span>{logs.length} 条</span></div>}</div>{!selected ? <div className={styles.adminEmpty}>选择左侧操作人查看详情</div> : detailLoading ? <div className={styles.adminLoadingCompact} role="status" aria-busy="true"><span className={styles.adminSpinner} aria-hidden="true" />正在读取详情…</div> : logs.length === 0 ? <div className={styles.adminEmpty}>暂无该操作人的记录</div> : <div className={styles.auditList}>{logs.map((item, index) => { const open = expanded === item.id; const chat = item.chatMessage; const itemKey = item.id || `log-${index}`; return <Fragment key={itemKey}><article className={styles.auditItem}><div className={styles.auditItemHead}><div><strong>{actionLabels[item.action] || item.action}</strong><small>{formatDate(item.createdAt)}{item.target ? ` · 目标：${item.target.name}` : ""}</small></div><span>{chat ? "聊天" : "操作"}</span></div>{chat && <><button className={styles.auditExpand} type="button" aria-expanded={open} onClick={() => setExpanded(open ? "" : item.id)}>{open ? "收起聊天正文" : "展开聊天正文"}</button>{open && <div className={styles.auditChatBody}><span>{chat.sender === "anchor" ? "主播（右侧）" : "大哥（左侧）"}</span><p>{chat.text}</p><small>维护对象：{chat.brotherNickname} · 状态：{chat.status}</small></div>}</>}</article></Fragment>; })}</div>}</section></div>}
    </section>
  </main>;
}
