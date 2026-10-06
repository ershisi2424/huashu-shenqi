import Head from "next/head";
import ApprovalCenter from "../components/admin/ApprovalCenter";

export default function AdminPage() {
  return (
    <>
      <Head><title>审批中心 - 大哥维护工作台</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <ApprovalCenter />
    </>
  );
}
