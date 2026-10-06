import Head from "next/head";
import MaintenanceTaskWorkspace from "../components/tasks/MaintenanceTaskWorkspace";

export default function TasksPage() {
  return <><Head><title>维护任务中心 - 大哥维护工作台</title><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head><MaintenanceTaskWorkspace /></>;
}
