import Head from "next/head";
import AuditWorkspace from "../../components/admin/AuditWorkspace";

export default function AdminAuditPage() {
  return <><Head><title>操作日志 - 大哥维护工作台</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head><AuditWorkspace /></>;
}
