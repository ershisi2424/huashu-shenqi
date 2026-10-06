import Head from "next/head";
import SetupWorkspace from "../components/auth/SetupWorkspace";

export default function SetupPage() {
  return (
    <>
      <Head><title>首次初始化 - 大哥维护工作台</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <SetupWorkspace />
    </>
  );
}
