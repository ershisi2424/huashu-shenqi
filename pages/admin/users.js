import Head from "next/head";
import UserManagementWorkspace from "../../components/admin/UserManagementWorkspace";

export default function AdminUsersPage() {
  return <><Head><title>用户管理 - 大哥维护工作台</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head><UserManagementWorkspace /></>;
}
