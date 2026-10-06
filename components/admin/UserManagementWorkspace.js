import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AdminNav from "./AdminNav";
import styles from "./admin.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const roleLabels = { super_admin: "最高管理", operator: "运营", anchor: "主播" };

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "暂无操作" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function UserManagementWorkspace() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const meResponse = await fetch(`${basePath}/api/auth/me/`);
      if (!meResponse.ok) return router.replace("/login?returnTo=/admin/users");
      const me = await meResponse.json();
      if (me.user?.role !== "super_admin") return router.replace("/admin");
      setUser(me.user);
      const response = await fetch(`${basePath}/api/admin/users/`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "读取用户使用情况失败");
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (caught) {
      setError(caught?.message || "读取用户使用情况失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const changeStatus = async (target, status) => {
    setBusyId(target.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${basePath}/api/admin/users/${encodeURIComponent(target.id)}/status/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "状态更新失败");
      setItems((current) => current.map((item) => item.id === target.id ? { ...item, status: payload.user.status, usageStatus: payload.user.status === "disabled" ? "inactive" : item.usageStatus } : item));
      setNotice(status === "disabled" ? "账号已停用，会话已撤销" : "账号已恢复");
    } catch (caught) {
      setError(caught?.message || "状态更新失败");
    } finally {
      setBusyId("");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError("");
    setNotice("");
    try {
      const prepareResponse = await fetch(`${basePath}/api/admin/users/${encodeURIComponent(deleteTarget.id)}/delete-confirm/`, { method: "POST" });
      const prepared = await prepareResponse.json();
      if (!prepareResponse.ok) throw new Error(prepared.error || "删除确认失败");
      const response = await fetch(`${basePath}/api/admin/users/${encodeURIComponent(deleteTarget.id)}/`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmationToken: prepared.token }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "删除失败");
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice("用户及其工作台数据已永久删除，审计快照已保留");
    } catch (caught) {
      setError(caught?.message || "删除失败");
    } finally {
      setBusyId("");
    }
  };

  const activeCount = items.filter((item) => item.status === "active").length;
  const disabledCount = items.filter((item) => item.status === "disabled").length;

  return <main className={`${styles.adminPage} ${styles.usersPage}`}>
    <section className={styles.adminCard}>
      <header className={styles.adminHeader}>
        <div className={styles.adminHeading}><span className={styles.adminKicker}>账号治理</span><h1>用户管理</h1><p>查看账号状态和使用情况，必要时停用或删除。</p></div>
        <div className={styles.adminHeaderActions}>{user && <span className={styles.adminRole}><span className={styles.adminRoleDot} aria-hidden="true" />最高管理</span>}<a className={styles.adminBackLink} href={`${basePath}/chat/`}>回到聊天 <span aria-hidden="true">↗</span></a></div>
      </header>
      <AdminNav role={user?.role} active="users" />
      {user && <div className={styles.adminIdentity}><span>{user.name}</span><span aria-hidden="true">·</span><span>最高管理</span><small>账号管理</small></div>}
      <section className={styles.adminSummary} aria-label="用户概览"><div className={styles.adminSummaryCard}><span>全部账号</span><strong>{loading ? "—" : items.length}</strong><small>运营、主播与最高管理</small></div><div className={`${styles.adminSummaryCard} ${styles.adminSummaryAccent}`}><span>正常使用</span><strong>{loading ? "—" : activeCount}</strong><small>可正常登录</small></div><div className={styles.adminSummaryCard}><span>已停用</span><strong>{loading ? "—" : disabledCount}</strong><small>数据仍然保留</small></div></section>
      {notice && <div className={`${styles.adminNotice} ${styles.adminNoticeSuccess}`} role="status" aria-live="polite"><span className={styles.adminNoticeIcon} aria-hidden="true">✓</span><span>{notice}</span></div>}
      {error && <div className={`${styles.adminNotice} ${styles.adminNoticeError}`} role="alert"><span className={styles.adminNoticeIcon} aria-hidden="true">!</span><span>{error}</span></div>}
      <div className={styles.adminWarning}><strong>操作前请确认</strong><span>停用会撤销登录会话但保留数据；永久删除会清理账号、维护对象和聊天正文，审计仅保留脱敏快照。</span></div>
      {loading ? <div className={styles.adminLoading} role="status" aria-live="polite" aria-busy="true"><span className={styles.adminSpinner} aria-hidden="true" />正在读取用户使用情况…</div> : items.length === 0 ? <div className={styles.adminEmpty}>暂无用户</div> : <div className={styles.userTableUnified}>{items.map((item) => {
        const isBusy = busyId === item.id;
        const statusClass = item.status === "active" ? styles.statusActive : item.status === "disabled" ? styles.statusDisabled : styles.statusPending;
        return <article className={styles.userRowUnified} key={item.id}><div className={styles.userMain}><div className={styles.userAvatar}>{(item.name || "？").slice(0, 1)}</div><div><strong>{item.name}</strong><small>{roleLabels[item.role] || item.role} · {item.phone}</small><small>{item.operator ? `所属运营：${item.operator.name}` : "无上级运营"}</small></div></div><div className={styles.userStats}><span className={`${styles.statusPill} ${statusClass}`}>{item.status === "active" ? "可用" : item.status === "disabled" ? "已停用" : "待审批"}</span><small>{item.brotherCount} 个维护对象 · {item.messageCount} 条消息</small><small>{item.lastActionAt ? `最近操作 ${formatDate(item.lastActionAt)}` : "暂无操作"}</small></div><div className={styles.userActionsUnified}>{item.role === "anchor" && <a className={styles.workspaceLinkUnified} href={`${basePath}/chat/viewer/?anchorId=${encodeURIComponent(item.id)}`}>进入工作台 <span aria-hidden="true">↗</span></a>}{item.id === user?.id ? <span className={styles.muted}>当前登录</span> : item.status === "disabled" ? <button disabled={!!busyId} onClick={() => changeStatus(item, "active")}>{isBusy ? "恢复中…" : "恢复"}</button> : <button disabled={!!busyId || item.status !== "active"} onClick={() => changeStatus(item, "disabled")}>{isBusy ? "停用中…" : "停用"}</button>}<button className={styles.dangerButtonUnified} disabled={!!busyId || item.id === user?.id} onClick={() => setDeleteTarget(item)}>永久删除</button></div></article>;
      })}</div>}
      {deleteTarget && <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="delete-title"><span className={styles.modalKicker}>不可逆操作</span><h2 id="delete-title">确认永久删除？</h2><p>将删除「{deleteTarget.name}」的账号、维护对象和聊天正文。此操作不可恢复，审计仅保留脱敏快照。</p><div className={styles.modalActions}><button disabled={!!busyId} onClick={() => setDeleteTarget(null)}>取消</button><button className={styles.dangerButton} disabled={!!busyId} onClick={confirmDelete}>{busyId === deleteTarget.id ? "删除中…" : "确认永久删除"}</button></div></section></div>}
    </section>
  </main>;
}
