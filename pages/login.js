import Head from "next/head";
import LoginWorkspace from "../components/auth/LoginWorkspace";

export default function LoginPage() {
  return (
    <>
      <Head><title>登录 - 大哥维护工作台</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <LoginWorkspace />
    </>
  );
}
