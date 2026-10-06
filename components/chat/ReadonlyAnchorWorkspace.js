import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import styles from "./chat.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); } catch { return "--:--"; }
}

function runtimeItemText(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return item.text || item.statement || item.content || item.signal || item.reason || "";
}

export default function ReadonlyAnchorWorkspace() {
  const router = useRouter();
  const [payload, setPayload] = useState(null);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authExpired, setAuthExpired] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [operatorNotes, setOperatorNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState("");
  const active = useMemo(() => payload?.brothers?.find((item) => item.id === activeId) || payload?.brothers?.[0] || null, [payload, activeId]);
  const canReview = ["operator", "super_admin"].includes(currentUser?.role);

  useEffect(() => {
    if (!router.isReady || !router.query.anchorId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      setAuthExpired(false);
      setCurrentUser(null);
      // Clear the previous anchor's private data before authentication or the
      // next snapshot completes.  A query change must never briefly expose the
      // old chat, profile, AI candidates, or operator draft.
      setPayload(null);
      setActiveId("");
      setOperatorNotes([]);
      setNoteDraft("");
      try {
        const meResponse = await fetch(`${basePath}/api/auth/me/`, { cache: "no-store" });
        const me = await meResponse.json().catch(() => ({}));
        if (!meResponse.ok) {
          if (meResponse.status === 401) {
            const authError = new Error("当前登录已失效");
            authError.status = 401;
            throw authError;
          }
          const permissionError = new Error(me.error || "当前账号无权查看主播工作台");
          permissionError.status = meResponse.status;
          throw permissionError;
        }
        const user = me.user || null;
        if (!user || !["operator", "super_admin"].includes(user.role)) {
          const permissionError = new Error("当前账号无权查看主播工作台");
          permissionError.status = 403;
          throw permissionError;
        }
        if (cancelled) return;
        setCurrentUser(user);
        const response = await fetch(`${basePath}/api/chat/workspace-snapshots/?anchorId=${encodeURIComponent(router.query.anchorId)}`, { cache: "no-store" });
        const next = await response.json();
        if (!response.ok) {
          const snapshotError = new Error(next.error || (response.status === 401 ? "当前登录已失效" : "读取主播工作台失败"));
          snapshotError.status = response.status;
          throw snapshotError;
        }
        if (!cancelled) { setPayload(next); setActiveId(next.brothers?.[0]?.id || ""); }
      } catch (caught) {
        if (!cancelled) {
          if (caught?.status === 401) {
            setAuthExpired(true);
            setCurrentUser(null);
            setError("当前登录已失效");
          } else {
            setError(caught?.message || "读取主播工作台失败");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [router.isReady, router.query.anchorId]);

  useEffect(() => {
    if (!canReview || !active?.id) {
      setOperatorNotes([]);
      return undefined;
    }
    let cancelled = false;
    setNotesError("");
    fetch(`${basePath}/api/chat/notes/?brotherId=${encodeURIComponent(active.id)}&limit=60`).then(async (response) => {
      const next = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(next.error || "读取运营点评失败");
      return next;
    }).then((next) => {
      if (!cancelled) setOperatorNotes(Array.isArray(next.items) ? next.items : []);
    }).catch((caught) => {
      if (!cancelled) setNotesError(caught?.message || "读取运营点评失败");
    });
    return () => { cancelled = true; };
  }, [active?.id, canReview]);

  const addOperatorNote = async (event) => {
    event.preventDefault();
    if (!canReview || !active?.id || !noteDraft.trim()) return;
    setNotesBusy(true);
    setNotesError("");
    try {
      const response = await fetch(`${basePath}/api/chat/notes/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brotherId: active.id, body: noteDraft.trim() }) });
      const next = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(next.error || "保存运营点评失败");
      if (next.item) setOperatorNotes((items) => [next.item, ...items]);
      setNoteDraft("");
    } catch (caught) {
      setNotesError(caught?.message || "保存运营点评失败");
    } finally {
      setNotesBusy(false);
    }
  };

  return <div className={styles.page}><header className={styles.header}><div><div className={styles.eyebrow}>READ-ONLY WORKSPACE</div><h1>{payload?.anchor?.name || "主播工作台"}</h1><p>运营和最高管理只读查看完整聊天、最新草稿、AI 候选与画像，不会代替主播操作。</p></div><div className={styles.headerActions}><div className={styles.headerStatus}>只读预览</div><a className={styles.readonlyBack} href={`${basePath}/admin/`}>返回后台</a></div></header>{error && <div className={styles.error}>{error}{authExpired && <div><a className={styles.readonlyBack} href={`${basePath}/login?returnTo=${encodeURIComponent(router.asPath || "/chat/viewer")}`}>去登录</a></div>}</div>}{loading ? <div className={styles.authGate}>读取中…</div> : <div className={`${styles.layout} ${styles.readonlyLayout}`}><aside className={styles.brothers}><div className={styles.panelTitle}>维护对象 <span>{payload?.brothers?.length || 0}</span></div>{(payload?.brothers || []).map((brother) => <button key={brother.id} className={`${styles.brotherItem} ${active?.id === brother.id ? styles.active : ""}`} onClick={() => setActiveId(brother.id)}><span className={styles.avatar}>{brother.nickname.slice(0, 1)}</span><span className={styles.brotherCopy}><strong>{brother.nickname}</strong><small>{brother.messages?.length || 0} 条记录</small></span></button>)}</aside><main className={styles.chat}><div className={styles.chatHeader}><div className={styles.chatIdentity}><span className={styles.avatar}>{active?.nickname?.slice(0, 1) || "?"}</span><div><strong>{active?.nickname || "暂无维护对象"}</strong><small>左侧大哥 / 右侧主播 · 只读</small></div></div><span className={styles.readonlyHint}>运营可见</span></div><div className={styles.timeline}>{!active ? <div className={styles.empty}>该主播还没有维护对象。</div> : active.messages?.map(
 (message) =>
<div className={`${styles.messageRow} ${message.direction === "right" ? styles.right : styles.left}`} key={message.id}><div className={styles.bubbleWrap}><span className={styles.sender}>{message.sender === "brother" ? active.nickname : "主播"}</span><div className={`${styles.bubble} ${message.direction === "right" ? styles.anchorBubble : styles.brotherBubble}`}>{message.text}</div><small className={styles.messageMeta}>{message.status} · {formatTime(message.sentAt || message.createdAt)}</small></div></div>)}</div></main><aside className={styles.aiPanel}><div className={styles.aiTitle}><div><strong>最新工作台状态</strong><small>仅展示最近一次保存内容</small></div><span>只读</span></div>{active?.workspace ? <><div className={styles.readonlyDraft}><strong>最新草稿</strong><p>{active.workspace.latestDraft || "主播尚未留下草稿"}</p></div><div className={styles.replyList}>{(active.workspace.replies || []).length ? active.workspace.replies.map((reply, index) => <article className={styles.replyCard} key={`${reply.style || "reply"}-${index}`}><div className={styles.replyMeta}><span>{reply.style || `候选 ${index + 1}`}</span><small>AI 候选</small></div><p>{reply.text}</p>{reply.rationale && <small className={styles.rationale}>{reply.rationale}</small>}</article>) : <div className={styles.emptyPanel}>暂无 AI 候选</div>}</div>{active.workspace.runtimeAnalysis && <details className={styles.runtimePanel} open><summary><span>本轮判断依据</span><small>{active.workspace.runtime?.sourceRevision?.slice(0, 7) || "本地"}</small></summary><div className={styles.runtimeBody}><div className={styles.runtimeGoal}><span>主目标</span><strong>{active.workspace.runtimeAnalysis.primaryGoal || "承接"}</strong><small>{active.workspace.runtimeAnalysis.emotion?.label || "情绪未明确"}</small></div>{active.workspace.runtimeAnalysis.facts?.length > 0 && <div className={styles.runtimeGroup}><strong>已确认事实</strong><ul>{active.workspace.runtimeAnalysis.facts.slice(0, 4).map((item, index) => <li key={`fact-${index}`}>{runtimeItemText(item)}</li>)}</ul></div>}{active.workspace.runtimeAnalysis.unknowns?.length > 0 && <div className={styles.runtimeGroup}><strong>仍需保持未知</strong><ul>{active.workspace.runtimeAnalysis.unknowns.slice(0, 4).map((item, index) => <li key={`unknown-${index}`}>{runtimeItemText(item)}</li>)}</ul></div>}<div className={styles.runtimeBoundary}><span>停止条件</span><p>{active.workspace.runtimeAnalysis.stopCondition || active.workspace.runtimeAnalysis.decision?.stopCondition || "对方明确拒绝或出现边界风险"}</p></div></div></details>}<details className={styles.profilePanel} open><summary>画像分析</summary>{active.workspace.profile ? <div className={styles.profileBody}><p>{active.workspace.profile.summary || "信息有限"}</p><div className={styles.chips}>{(active.workspace.profile.interests || []).map((item) => <span key={item}>#{item}</span>)}</div><div><b>沟通风格：</b>{active.workspace.profile.communicationStyle || "未明确"}</div></div> : <div className={styles.emptyPanel}>暂无画像</div>}</details></> : <div className={styles.emptyPanel}>主播尚未保存工作台快照</div>}{canReview && <details className={styles.operatorNotes} open><summary>运营维护点评 <span>{operatorNotes.length}</span></summary><p className={styles.notesHint}>只对运营和最高管理可见，用于记录回复方向、跟进重点和复盘建议。</p>{notesError && <div className={styles.error} role="alert">{notesError}</div>}<div className={styles.noteList}>{operatorNotes.map((note) => <article key={note.id}><p>{note.body}</p><small>{note.createdByName || "运营"} · {new Date(note.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></article>)}</div><form onSubmit={addOperatorNote}><textarea aria-label="运营维护点评" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="写下这位主播下一轮的回复方向或边界提醒…" maxLength={2000} /><button type="submit" disabled={notesBusy || !noteDraft.trim()}>{notesBusy ? "保存中…" : "保存点评"}</button></form></details>}</aside></div>}</div>;
}
