import Head from "next/head";
import ReadonlyAnchorWorkspace from "../../components/chat/ReadonlyAnchorWorkspace";

export default function ChatViewerPage() {
  return <><Head><title>主播工作台只读预览 - 大哥维护工作台</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head><ReadonlyAnchorWorkspace /></>;
}
