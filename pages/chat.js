import Head from "next/head";
import ChatWorkspace from "../components/chat/ChatWorkspace";

export default function ChatPage() {
  return (
    <>
      <Head>
        <title>微信式聊天工作台 - 大哥维护神器</title>
        <meta name="description" content="主播手动录入大哥消息，使用 AI 生成可编辑回复" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <ChatWorkspace />
    </>
  );
}
