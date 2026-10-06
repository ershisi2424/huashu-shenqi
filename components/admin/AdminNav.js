import Link from "next/link";

import styles from "./admin.module.css";

export default function AdminNav({ role, active }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return <nav className={styles.nav} aria-label="后台导航">
    <Link className={active === "approval" ? styles.navActive : ""} href={`${basePath}/admin/`}>审批中心</Link>
    <Link className={active === "audit" ? styles.navActive : ""} href={`${basePath}/admin/audit/`}>操作日志</Link>
    {role && <Link className={active === "tasks" ? styles.navActive : ""} href={`${basePath}/tasks/`}>维护任务</Link>}
    {role === "super_admin" && <Link className={active === "users" ? styles.navActive : ""} href={`${basePath}/admin/users/`}>用户管理</Link>}
    {role === "super_admin" && <Link className={active === "settings" ? styles.navActive : ""} href={`${basePath}/admin/settings/`}>服务配置</Link>}
    {role === "super_admin" && <Link className={active === "usage" ? styles.navActive : ""} href={`${basePath}/admin/usage/`}>工具使用</Link>}
  </nav>;
}
