import { useEffect, useMemo, useRef, useState } from "react";
import chatThread from "../../lib/chat-thread.cjs";
import chatStore from "../../lib/chat-local-store.cjs";
import chatScroll from "../../lib/chat-scroll.cjs";
import workspaceState from "../../lib/chat-workspace-state.cjs";
import { checkReplyDraft } from "../../lib/reply-check.cjs";
import { normalizeReplyStyle } from "../../lib/reply-style.cjs";
import styles from "./chat.module.css";

const { addMessage, createBrother, createMessage, editMessageText, markSent, sortChatBrothers } = chatThread;
const { chatStorageKey, clearChatSnapshot, clearReplyDraft, emptySnapshot, memoryEnabledKey, readActiveBrotherId, readChatSnapshot, readReplyDraft, writeActiveBrotherId, writeChatSnapshot, writeReplyDraft } = chatStore;
const { isNearBottom } = chatScroll;
const { shouldHydrateWorkspace } = workspaceState;
const EMPTY_PROFILE_SOURCES = { works: "", comments: "", statements: "" };
// 暂时隐藏入口，保留 OCR 链路供后续升级继续完善。
const ENABLE_SCREENSHOT_OCR = false;

function latest(items, predicate) {
  return items.filter(predicate).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).at(-1) || null;
}

function historyPairs(messages) {
  const pairs = [];
  let pendingBrother = null;
  for (const message of messages.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    if (message.sender === "brother" && message.status === "confirmed") {
      pendingBrother = message;
      continue;
    }
    if (message.sender === "anchor" && message.status === "sent" && pendingBrother) {
      pairs.push({ msg: pendingBrother.text, reply: message.text });
      pendingBrother = null;
    }
  }
  return pairs.slice(-10);
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--";
  }
}

function messageSourceLabel(message) {
  const edited = Date.parse(message?.updatedAt || "") > Date.parse(message?.createdAt || "");
  const base = message?.source === "screenshot_ocr" ? (message.sender === "anchor" && message.status !== "sent" ? "截图识别 · 右侧未发送" : "截图识别 · 左侧") : message?.source === "paste" ? "主播粘贴" : "主播确认";
  return edited ? `${base} · 已修改` : base;
}

function runtimeItemText(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return item.text || item.statement || item.content || item.signal || item.reason || "";
}

function readImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

export default function ChatWorkspace() {
  const [snapshot, setSnapshot] = useState(() => emptySnapshot());
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [newBrotherName, setNewBrotherName] = useState("");
  const [brotherInput, setBrotherInput] = useState("");
  const [anchorDraft, setAnchorDraft] = useState("");
  const [profileSources, setProfileSources] = useState(EMPTY_PROFILE_SOURCES);
  const [sentConfirmation, setSentConfirmation] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyHistory, setReplyHistory] = useState([]);
  const [replyHistoryBusy, setReplyHistoryBusy] = useState(false);
  const [candidateSaveState, setCandidateSaveState] = useState("idle");
  const [candidateSaveError, setCandidateSaveError] = useState("");
  const [profile, setProfile] = useState(null);
  const [coreDecision, setCoreDecision] = useState(null);
  const [algorithmCore, setAlgorithmCore] = useState(null);
  const [runtimeAnalysis, setRuntimeAnalysis] = useState(null);
  const [runtimeIntake, setRuntimeIntake] = useState(null);
  const [runtimeMeta, setRuntimeMeta] = useState(null);
  const [runtimeMemoryStatus, setRuntimeMemoryStatus] = useState(null);
  const [runtimeMemoryBusy, setRuntimeMemoryBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [ocrPreview, setOcrPreview] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingText, setEditingText] = useState("");
  const [openingMode, setOpeningMode] = useState("casual");
  const [openingTopics, setOpeningTopics] = useState([]);
  const [liveInvite, setLiveInvite] = useState(null);
  const [lastLiveInviteAt, setLastLiveInviteAt] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [storageScope, setStorageScope] = useState("");
  const [serverSync, setServerSync] = useState({ enabled: false, syncing: false, error: "" });
  const [serverBrothersRevision, setServerBrothersRevision] = useState(0);
  const [taskSummary, setTaskSummary] = useState(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskRefresh, setTaskRefresh] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState("");
  const [replyStyle, setReplyStyle] = useState("balanced");
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineForm, setTimelineForm] = useState({ type: "note", title: "", body: "" });
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [operatorNotes, setOperatorNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const serverBrotherIds = useRef(new Map());
  const workspaceTouchedRef = useRef(false);
  const workspaceRequestToken = useRef(0);
  const timelineRef = useRef(null);
  const wasNearBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadAuth = async () => {
      let nextScope = "guest";
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/me/`);
        if (response.ok) {
          const payload = await response.json();
          const user = payload.user || null;
          nextScope = user?.id ? `user:${user.id}` : "guest";
          if (!cancelled) setCurrentUser(user);
        }
        const healthResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/health/`);
        const health = await healthResponse.json();
        if (!cancelled) setAuthRequired(health.authRequired === true);
      } catch {
        // Keep the local development preview usable when the optional auth route is unavailable.
      } finally {
        if (!cancelled) {
          setStorageScope(nextScope);
          setAuthLoading(false);
        }
      }
    };
    loadAuth();
    return () => { cancelled = true; };
  }, []);

  const apiUrl = (path) => `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`;

  const syncServer = async (path, options = {}) => {
    if (!currentUser) return null;
    setServerSync((state) => ({ ...state, enabled: true, syncing: true, error: "" }));
    try {
      const response = await fetch(apiUrl(path), options);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "服务端同步失败");
      setServerSync({ enabled: true, syncing: false, error: "" });
      return payload;
    } catch (caught) {
      setServerSync({ enabled: true, syncing: false, error: caught?.message || "服务端同步失败" });
      return null;
    }
  };

  const ensureServerBrother = async (brother) => {
    if (!currentUser || !brother) return brother?.id || "";
    if (serverBrotherIds.current.has(brother.id)) return serverBrotherIds.current.get(brother.id);
    const payload = await syncServer("/api/chat/brothers/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: brother.id, nickname: brother.nickname, note: brother.note, profile: brother.profile }),
    });
    const serverId = payload?.item?.id || "";
    if (serverId) serverBrotherIds.current.set(brother.id, serverId);
    return serverId || brother.id;
  };

  const syncMessage = async (brother, message) => {
    if (!currentUser || !brother || !message) return;
    const serverBrotherId = await ensureServerBrother(brother);
    if (!serverBrotherId) return;
    await syncServer("/api/chat/messages/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brotherId: serverBrotherId, message }),
    });
    setTaskRefresh((value) => value + 1);
  };

  const syncMessageEdit = async (brother, message) => {
    if (!currentUser || !brother || !message) return;
    const serverBrotherId = await ensureServerBrother(brother);
    if (!serverBrotherId) return;
    await syncServer("/api/chat/messages/", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brotherId: serverBrotherId, messageId: message.id, text: message.text }),
    });
  };

  const syncWorkspaceSnapshot = async (brother, values = {}) => {
    if (!currentUser || currentUser.role !== "anchor" || !brother) return;
    const serverBrotherId = await ensureServerBrother(brother);
    if (!serverBrotherId) return;
    return syncServer("/api/chat/workspace-snapshots/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brotherId: serverBrotherId,
        snapshot: {
          latestDraft: values.latestDraft ?? anchorDraft,
          profileSources: values.profileSources ?? profileSources,
          replies: values.replies ?? replies,
          profile: values.profile ?? profile,
          coreDecision: values.coreDecision ?? coreDecision,
          algorithmCore: values.algorithmCore ?? algorithmCore,
          runtimeAnalysis: values.runtimeAnalysis ?? runtimeAnalysis,
          runtimeIntake: values.runtimeIntake ?? runtimeIntake,
          runtime: values.runtime ?? runtimeMeta,
          openingTopics: values.openingTopics ?? openingTopics,
          liveInvite: values.liveInvite ?? liveInvite,
          replyStyle: values.replyStyle ?? replyStyle,
        },
      }),
    });
  };

  useEffect(() => {
    if (!currentUser || !storageScope) return undefined;
    let cancelled = false;
    const loadServerBrothers = async () => {
      const payload = await syncServer("/api/chat/brothers/");
      if (cancelled || !Array.isArray(payload?.items)) return;
      for (const item of payload.items) if (item.clientId && item.id) serverBrotherIds.current.set(item.clientId, item.id);
      setServerBrothersRevision((value) => value + 1);
      const rememberedActiveId = readActiveBrotherId(window.localStorage, storageScope);
      setSnapshot((current) => {
        const localById = new Map(current.brothers.map((item) => [item.id, item]));
        const merged = sortChatBrothers(payload.items.map((item) => localById.get(item.clientId) || createBrother({ id: item.clientId, nickname: item.nickname, note: item.note, profile: item.profile, createdAt: item.createdAt, updatedAt: item.updatedAt })));
        const serverIds = new Set(merged.map((item) => item.id));
        const localOnly = sortChatBrothers(current.brothers.filter((item) => !serverIds.has(item.id)));
        const brothers = sortChatBrothers([...merged, ...localOnly]).slice(0, 200);
        const currentActiveId = current.activeBrotherId && brothers.some((item) => item.id === current.activeBrotherId) ? current.activeBrotherId : null;
        const rememberedId = !currentActiveId && rememberedActiveId && brothers.some((item) => item.id === rememberedActiveId) ? rememberedActiveId : null;
        const activeBrotherId = currentActiveId || rememberedId || brothers[0]?.id || null;
        if (activeBrotherId) writeActiveBrotherId(window.localStorage, storageScope, activeBrotherId);
        return { ...current, brothers, activeBrotherId };
      });
    };
    loadServerBrothers();
    return () => { cancelled = true; };
  }, [currentUser, storageScope]);

  useEffect(() => {
    if (!storageReady || !storageScope || !snapshot.activeBrotherId) return;
    writeActiveBrotherId(window.localStorage, storageScope, snapshot.activeBrotherId);
  }, [snapshot.activeBrotherId, storageReady, storageScope]);

  useEffect(() => {
    if (authLoading || !storageScope) return;
    serverBrotherIds.current.clear();
    workspaceRequestToken.current += 1;
    workspaceTouchedRef.current = false;
    setReplyHistory([]);
    const storageKey = chatStorageKey(storageScope);
    const memoryKey = memoryEnabledKey(storageScope);
    const enabled = window.localStorage.getItem(memoryKey) === "true";
    setMemoryEnabled(enabled);
    if (enabled) {
      try {
        const saved = readChatSnapshot(window.localStorage, true, storageKey);
        setSnapshot(saved);
        setProfileSources(saved.profileSources || EMPTY_PROFILE_SOURCES);
        setReplyStyle(normalizeReplyStyle(saved.replyStyle || "balanced"));
      } catch {
        setNotice("本地聊天记录格式无法识别，已使用空会话；原有其他记忆不受影响");
      }
    } else {
      setSnapshot(emptySnapshot());
      setProfileSources(EMPTY_PROFILE_SOURCES);
      setReplyStyle("balanced");
    }
    setStorageReady(true);
  }, [authLoading, storageScope]);

  useEffect(() => {
    if (!storageReady || !memoryEnabled || !storageScope) return;
    try {
      writeChatSnapshot(window.localStorage, true, { ...snapshot, profileSources, replyStyle }, chatStorageKey(storageScope));
    } catch {
      setNotice("本机聊天记录保存失败，当前页面内容仍可继续使用");
    }
  }, [memoryEnabled, profileSources, replyStyle, snapshot, storageReady, storageScope]);

  const activeBrother = useMemo(
    () => snapshot.brothers.find((brother) => brother.id === snapshot.activeBrotherId) || snapshot.brothers[0] || null,
    [snapshot.activeBrotherId, snapshot.brothers],
  );

  useEffect(() => {
    if (!currentUser || currentUser.role !== "anchor" || !activeBrother?.id) return undefined;
    const serverBrotherId = serverBrotherIds.current.get(activeBrother.id);
    if (!serverBrotherId) return undefined;
    const requestToken = ++workspaceRequestToken.current;
    let cancelled = false;
    const loadWorkspaceSnapshot = async () => {
      const payload = await syncServer(`/api/chat/workspace-snapshots/?brotherId=${encodeURIComponent(serverBrotherId)}`);
      const item = payload?.items?.[0];
      const localDraft = readReplyDraft(window.localStorage, storageScope, activeBrother.id);
      const localDraftIsNewer = Boolean(localDraft && (!item || Date.parse(localDraft.savedAt) > Date.parse(item.updatedAt || "")));
      const hydratedItem = localDraftIsNewer ? { ...(item || {}), ...localDraft } : item;
      if (cancelled || !shouldHydrateWorkspace({
        requestToken,
        currentToken: workspaceRequestToken.current,
        touched: workspaceTouchedRef.current,
        currentDraft: anchorDraft,
        currentReplies: replies,
        currentProfile: profile,
        item: hydratedItem,
      })) return;
      setAnchorDraft(hydratedItem.latestDraft || "");
      setProfileSources(hydratedItem.profileSources || EMPTY_PROFILE_SOURCES);
      setReplies(Array.isArray(hydratedItem.replies) ? hydratedItem.replies : []);
      setProfile(hydratedItem.profile || null);
      setCoreDecision(hydratedItem.coreDecision || null);
      setAlgorithmCore(hydratedItem.algorithmCore || null);
      setRuntimeAnalysis(hydratedItem.runtimeAnalysis || null);
      setRuntimeIntake(hydratedItem.runtimeIntake || null);
      setRuntimeMeta(hydratedItem.runtime || null);
      setOpeningTopics(Array.isArray(hydratedItem.openingTopics) ? hydratedItem.openingTopics : []);
      setLiveInvite(hydratedItem.liveInvite || null);
      setReplyStyle(normalizeReplyStyle(hydratedItem.replyStyle || "balanced"));
      if (localDraftIsNewer) {
        setCandidateSaveState("pending");
        setCandidateSaveError("刚才的候选已从本机暂存恢复，正在重新同步服务端");
        const saved = await syncWorkspaceSnapshot(activeBrother, localDraft);
        if (saved?.item) {
          clearReplyDraft(window.localStorage, storageScope, activeBrother.id);
          setCandidateSaveState("saved");
          setCandidateSaveError("");
        }
      } else if (hydratedItem?.replies?.length) {
        setCandidateSaveState("saved");
        setCandidateSaveError("");
      }
    };
    loadWorkspaceSnapshot();
    return () => { cancelled = true; };
  }, [activeBrother?.id, currentUser, serverBrothersRevision, storageScope]);

  useEffect(() => {
    setReplyHistory([]);
    if (!currentUser || !activeBrother?.id) return undefined;
    const serverBrotherId = serverBrotherIds.current.get(activeBrother.id);
    if (!serverBrotherId) return undefined;
    let cancelled = false;
    const loadReplyHistory = async () => {
      const payload = await syncServer(`/api/chat/reply-history/?brotherId=${encodeURIComponent(serverBrotherId)}&limit=30`);
      if (!cancelled && Array.isArray(payload?.items)) setReplyHistory(payload.items);
    };
    loadReplyHistory();
    return () => { cancelled = true; };
  }, [activeBrother?.id, currentUser?.id, serverBrothersRevision]);

  useEffect(() => {
    setRuntimeMemoryStatus(null);
    if (!currentUser || !activeBrother?.id) return undefined;
    const serverBrotherId = serverBrotherIds.current.get(activeBrother.id);
    if (!serverBrotherId) return undefined;
    let cancelled = false;
    fetch(apiUrl(`/api/chat/runtime-memory/?brotherId=${encodeURIComponent(serverBrotherId)}`))
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (!cancelled && payload?.status) setRuntimeMemoryStatus(payload.status); })
      .catch(() => {})
    return () => { cancelled = true; };
  }, [activeBrother?.id, currentUser?.id, serverBrothersRevision]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "anchor" || !activeBrother || (!anchorDraft.trim() && replies.length === 0 && !profile && !Object.values(profileSources).some(Boolean))) return undefined;
    const timer = window.setTimeout(() => { void syncWorkspaceSnapshot(activeBrother); }, 2000);
    return () => window.clearTimeout(timer);
  }, [activeBrother?.id, currentUser?.id, anchorDraft, replyStyle, profileSources.works, profileSources.comments, profileSources.statements]);

  const activeMessages = useMemo(
    () => snapshot.messages.filter((message) => message.brotherId === activeBrother?.id).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [activeBrother?.id, snapshot.messages],
  );

  const scrollTimelineToBottom = (behavior = "smooth") => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    timeline.scrollTo({ top: timeline.scrollHeight, behavior });
    wasNearBottomRef.current = true;
    setShowScrollToBottom(false);
  };

  const handleTimelineScroll = () => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const nearBottom = isNearBottom({ scrollTop: timeline.scrollTop, clientHeight: timeline.clientHeight, scrollHeight: timeline.scrollHeight });
    wasNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
  };

  useEffect(() => {
    wasNearBottomRef.current = true;
    setShowScrollToBottom(false);
    const frame = window.requestAnimationFrame(() => scrollTimelineToBottom("auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [activeBrother?.id]);

  useEffect(() => {
    if (!wasNearBottomRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => scrollTimelineToBottom("auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [activeMessages.length]);
  const latestBrotherMessage = useMemo(
    () => latest(activeMessages, (message) => message.sender === "brother" && message.status === "confirmed"),
    [activeMessages],
  );
  const replyCheck = useMemo(() => checkReplyDraft({
    draft: anchorDraft,
    currentMessage: latestBrotherMessage?.text || "",
    recentReplies: activeMessages.filter((message) => message.sender === "anchor" && message.status === "sent").slice(-5).map((message) => message.text),
  }), [activeMessages, anchorDraft, latestBrotherMessage?.text]);
  const replyCheckDisplay = anchorDraft.trim() ? replyCheck : { level: "idle", warnings: [], suggestions: ["输入或选择回复后，这里会检查自然度与边界"] };
  const replyCheckTone = replyCheckDisplay.level === "review" ? styles.replyCheck_review : replyCheckDisplay.level === "block" ? styles.replyCheck_block : styles.replyCheck_idle;

  useEffect(() => {
    if (!currentUser || !activeBrother?.id) return undefined;
    let cancelled = false;
    const loadServerMessages = async () => {
      const serverId = serverBrotherIds.current.get(activeBrother.id);
      if (!serverId) return;
      const payload = await syncServer(`/api/chat/messages/?brotherId=${encodeURIComponent(serverId)}`);
      if (cancelled || !Array.isArray(payload?.items) || payload.items.length === 0) return;
      setSnapshot((current) => {
        const serverById = new Map(payload.items.map((item) => [item.id, item]));
        const known = new Set(current.messages.map((item) => item.id));
        const imported = payload.items.filter((item) => !known.has(item.id)).map((item) => ({ ...item, brotherId: activeBrother.id }));
        const merged = current.messages.map((item) => {
          const server = serverById.get(item.id);
          return server ? { ...item, favorite: server.favorite, pinned: server.pinned } : item;
        });
        return { ...current, messages: [...merged, ...imported].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) };
      });
    };
    loadServerMessages();
    return () => { cancelled = true; };
  }, [activeBrother?.id, currentUser, serverBrothersRevision]);

  useEffect(() => {
    if (!currentUser || !activeBrother?.id) {
      setTaskSummary(null);
      return undefined;
    }
    const serverId = serverBrotherIds.current.get(activeBrother.id);
    if (!serverId) return undefined;
    let cancelled = false;
    const loadTasks = async () => {
      const payload = await syncServer(`/api/chat/tasks/?brotherId=${encodeURIComponent(serverId)}&limit=20`);
      if (!cancelled && payload?.items) setTaskSummary(payload);
    };
    loadTasks();
    return () => { cancelled = true; };
  }, [activeBrother?.id, currentUser?.id, serverBrothersRevision, snapshot.messages.length, taskRefresh]);

  useEffect(() => {
    setTimelineEvents([]);
    setOperatorNotes([]);
    setNoteDraft("");
    if (!currentUser || !activeBrother?.id) return undefined;
    const serverId = serverBrotherIds.current.get(activeBrother.id);
    if (!serverId) return undefined;
    let cancelled = false;
    const loadContext = async () => {
      const timelinePayload = await syncServer(`/api/chat/timeline/?brotherId=${encodeURIComponent(serverId)}&limit=60`);
      if (!cancelled && Array.isArray(timelinePayload?.items)) setTimelineEvents(timelinePayload.items);
      if (currentUser.role !== "anchor") {
        const notesPayload = await syncServer(`/api/chat/notes/?brotherId=${encodeURIComponent(serverId)}&limit=60`);
        if (!cancelled && Array.isArray(notesPayload?.items)) setOperatorNotes(notesPayload.items);
      }
    };
    loadContext();
    return () => { cancelled = true; };
  }, [activeBrother?.id, currentUser?.id, currentUser?.role, serverBrothersRevision]);

  const runChatSearch = async (event) => {
    event?.preventDefault?.();
    const term = searchQuery.trim();
    if (!term) return setSearchResults([]);
    setSearchBusy(true);
    try {
      if (currentUser) {
        const payload = await syncServer(`/api/chat/search/?q=${encodeURIComponent(term)}&limit=60`);
        setSearchResults(Array.isArray(payload?.items) ? payload.items : []);
      } else {
        const lowered = term.toLowerCase();
        const items = snapshot.messages.filter((message) => message.text.toLowerCase().includes(lowered)).map((message) => {
          const brother = snapshot.brothers.find((item) => item.id === message.brotherId);
          return { messageId: message.id, brotherId: message.brotherId, brotherNickname: brother?.nickname || "维护对象", text: message.text, sender: message.sender, createdAt: message.createdAt };
        });
        setSearchResults(items.slice(-60).reverse());
      }
    } finally {
      setSearchBusy(false);
    }
  };

  const jumpToSearchResult = (result) => {
    const localId = result.clientId || result.brotherId;
    if (localId && snapshot.brothers.some((item) => item.id === localId)) setActiveBrother(localId);
    setHighlightMessageId(result.messageId || "");
    window.setTimeout(() => {
      const node = document.querySelector(`[data-message-id="${result.messageId}"]`);
      node?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }, 80);
  };

  useEffect(() => {
    if (!highlightMessageId) return undefined;
    const timer = window.setTimeout(() => setHighlightMessageId(""), 2200);
    return () => window.clearTimeout(timer);
  }, [highlightMessageId]);

  const toggleMessageMark = async (message, field) => {
    if (!message || currentUser?.role !== "anchor") return setNotice("运营和管理账号只能只读查看聊天记录");
    const nextValue = !message[field];
    const applyLocalMark = (itemValue) => setSnapshot((current) => ({ ...current, messages: current.messages.map((item) => {
      if (item.brotherId !== message.brotherId) return item;
      if (field === "pinned" && itemValue) return { ...item, pinned: item.id === message.id };
      return item.id === message.id ? { ...item, [field]: itemValue } : item;
    }) }));
    applyLocalMark(nextValue);
    const serverId = serverBrotherIds.current.get(activeBrother?.id);
    if (!currentUser || !serverId) {
      setNotice(nextValue ? (field === "favorite" ? "已在本机收藏" : "已在本机置顶") : (field === "favorite" ? "已取消本机收藏" : "已取消本机置顶"));
      return;
    }
    const payload = await syncServer("/api/chat/marks/", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brotherId: serverId, messageId: message.id, [field]: nextValue }) });
    if (!payload?.item) {
      applyLocalMark(Boolean(message[field]));
      setNotice("消息标记同步失败，已恢复原状态");
      return;
    }
    setSnapshot((current) => ({ ...current, messages: current.messages.map((item) => item.id === message.id ? { ...item, favorite: payload.item.favorite, pinned: payload.item.pinned } : item) }));
    setNotice(nextValue ? (field === "favorite" ? "消息已收藏" : "消息已置顶") : (field === "favorite" ? "已取消收藏" : "已取消置顶"));
  };

  const addTimelineEvent = async (event) => {
    event.preventDefault();
    if (currentUser?.role !== "anchor" || !activeBrother || !timelineForm.title.trim()) return setNotice("请填写时间线事件标题");
    const serverId = serverBrotherIds.current.get(activeBrother.id);
    if (!serverId) return setNotice("当前对象还没有服务端记录，请先录入一条消息");
    setTimelineBusy(true);
    const payload = await syncServer("/api/chat/timeline/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brotherId: serverId, ...timelineForm }) });
    if (payload?.item) {
      setTimelineEvents((current) => [payload.item, ...current]);
      setTimelineForm({ type: "note", title: "", body: "" });
      setNotice("关系时间线已记录");
    }
    setTimelineBusy(false);
  };

  const addOperatorNote = async (event) => {
    event.preventDefault();
    if (!noteDraft.trim() || !activeBrother || currentUser?.role === "anchor") return;
    const serverId = serverBrotherIds.current.get(activeBrother.id);
    if (!serverId) return setNotice("当前对象还没有服务端记录");
    setNotesBusy(true);
    const payload = await syncServer("/api/chat/notes/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brotherId: serverId, body: noteDraft }) });
    if (payload?.item) {
      setOperatorNotes((current) => [payload.item, ...current]);
      setNoteDraft("");
      setNotice("运营内部备注已保存，仅运营和最高管理可见");
    }
    setNotesBusy(false);
  };

  const updateCurrentTask = async (taskId, status, dueAt = undefined) => {
    if (!taskId || currentUser?.role !== "anchor") return;
    setTaskBusy(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/chat/tasks/"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, status, ...(dueAt ? { dueAt } : {}) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "维护任务更新失败");
      setTaskSummary((current) => current ? { ...current, items: current.items.map((item) => item.id === taskId ? payload.item : item) } : current);
      setTaskRefresh((value) => value + 1);
      setNotice(status === "done" ? "当前任务已完成" : status === "snoozed" ? "当前任务已放到稍后处理" : "当前任务状态已更新");
    } catch (caught) {
      setError(caught?.message || "维护任务更新失败");
    } finally {
      setTaskBusy(false);
    }
  };

  const nextFollowUpAt = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const syncTaskPlan = async ({ decision, profile: nextProfile } = {}) => {
    if (currentUser?.role !== "anchor") return;
    const task = taskSummary?.items?.find((item) => !["done", "dismissed"].includes(item.status));
    if (!task) return;
    const nextAction = decision?.action || task.nextAction || "根据最新聊天上下文选择自然回复";
    const reason = decision?.observationWindow || nextProfile?.summary || task.reason;
    const priority = ["high", "normal", "low"].includes(decision?.priority) ? decision.priority : task.priority;
    try {
      const response = await fetch(apiUrl("/api/chat/tasks/"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, status: task.status, nextAction, reason, priority }) });
      if (response.ok) setTaskRefresh((value) => value + 1);
    } catch {
      // 任务计划更新失败不阻断 AI 回复，聊天候选仍可继续使用。
    }
  };

  const markWorkspaceTouched = () => {
    workspaceTouchedRef.current = true;
  };

  const setActiveBrother = (id) => {
    workspaceRequestToken.current += 1;
    workspaceTouchedRef.current = false;
    setSnapshot((current) => ({ ...current, activeBrotherId: id }));
    setBrotherInput("");
    setAnchorDraft("");
    setProfileSources(EMPTY_PROFILE_SOURCES);
    setReplies([]);
    setRuntimeAnalysis(null);
    setRuntimeIntake(null);
    setRuntimeMeta(null);
    setReplyHistory([]);
    setTimelineForm({ type: "note", title: "", body: "" });
    setNoteDraft("");
    setOcrPreview(null);
    setOpeningTopics([]);
    setLiveInvite(null);
    setError("");
  };

  const addBrother = async (event) => {
    event.preventDefault();
    try {
      const nickname = newBrotherName.trim();
      if (!nickname) return setNotice("先填写维护对象昵称");
      const brother = createBrother({ nickname });
      if (snapshot.brothers.some((item) => item.nickname === brother.nickname)) return setNotice("这个昵称已经存在");
      setSnapshot((current) => ({
        ...current,
        brothers: [brother, ...current.brothers].slice(0, 200),
        activeBrotherId: brother.id,
      }));
      setNewBrotherName("");
      setNotice(`已新增 ${brother.nickname}，可以录入他的第一条消息`);
      await ensureServerBrother(brother);
    } catch {
      setNotice("维护对象昵称不能为空");
    }
  };

  const confirmBrotherMessage = () => {
    if (!activeBrother) return setNotice("请先新增或选择一位维护对象");
    const text = brotherInput.trim();
    if (!text) return setNotice("请先输入或粘贴大哥消息");
    markWorkspaceTouched();
    const message = createMessage({
      id: `msg_${Date.now().toString(36)}_brother`,
      brotherId: activeBrother.id,
      sender: "brother",
      source: "paste",
      status: "confirmed",
      text,
    });
    setSnapshot((current) => ({ ...current, messages: addMessage(current.messages, message) }));
    setBrotherInput("");
    setReplies([]);
    setError("");
    setNotice("大哥消息已录入左侧聊天记录，可以生成 AI 回复");
    void syncMessage(activeBrother, message);
  };

  const beginEditMessage = (message) => {
    if (currentUser && currentUser.role !== "anchor") return setNotice("运营和管理账号只能只读查看聊天记录");
    if (!message) return;
    setEditingMessageId(message.id);
    setEditingText(message.text || "");
    setError("");
    setNotice(message.status === "sent" ? "已发送消息可修改；保存后保留已发送状态和原发送时间" : "已进入修改状态，保存后会同步聊天记录");
  };

  const cancelEditMessage = () => {
    setEditingMessageId("");
    setEditingText("");
  };

  const saveMessageEdit = async (message) => {
    if (!message || !activeBrother) return;
    if (currentUser && currentUser.role !== "anchor") return setNotice("运营和管理账号只能只读查看聊天记录");
    const text = editingText.trim();
    if (!text) return setNotice("修改内容不能为空");
    try {
      markWorkspaceTouched();
      const updatedMessages = editMessageText(snapshot.messages, message.id, text);
      const updated = updatedMessages.find((item) => item.id === message.id);
      setSnapshot((current) => ({ ...current, messages: editMessageText(current.messages, message.id, text) }));
      cancelEditMessage();
      setReplies([]);
      setNotice("聊天内容已修改，并开始同步服务端");
      await syncMessageEdit(activeBrother, updated);
    } catch (caught) {
      setError(caught?.message || "聊天内容修改失败");
    }
  };

  const handleOcrFile = async (event) => {
    if (!ENABLE_SCREENSHOT_OCR) return setNotice("截图识别功能正在升级，暂未开放");
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^(image\/(png|jpeg|webp))$/i.test(file.type)) return setNotice("截图仅支持 PNG、JPG 或 WebP");
    if (file.size > 8 * 1024 * 1024) return setNotice("截图不能超过 8MB");
    setOcrBusy(true);
    setError("");
    setNotice("");
    try {
      const imageDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("截图读取失败"));
        reader.readAsDataURL(file);
      });
      const dimensions = await readImageDimensions(imageDataUrl);
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/ocr/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, imageWidth: dimensions.width || undefined, imageHeight: dimensions.height || undefined, language: "chi_sim+eng" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "截图识别失败");
      if (payload.requiresConfirmation !== true) throw new Error("截图识别结果未通过确认流程");
      setOcrPreview({ importId: payload.importId, blocks: Array.isArray(payload.blocks) ? payload.blocks : [] });
      setNotice(payload.blocks?.length ? "识别完成：左侧气泡自动归为大哥，右侧气泡自动归为主播；请确认后按顺序写入" : "没有识别出文字，请改为手动粘贴");
    } catch (caught) {
      setError(caught?.message || "截图识别失败");
    } finally {
      setOcrBusy(false);
    }
  };

  const confirmOcrBlock = (index) => {
    if (!activeBrother || !ocrPreview?.blocks?.[index]) return;
    const block = ocrPreview.blocks[index];
    const text = String(block.text || "").trim();
    if (!text) return setNotice("请先补充这条识别内容，或直接丢弃");
    if (!["brother", "anchor"].includes(block.sender)) return setNotice("这条气泡暂时无法判断左右归属，请先手动选择大哥或主播");
    markWorkspaceTouched();
    const message = createMessage({
      id: `msg_${Date.now().toString(36)}_ocr_${index}`,
      brotherId: activeBrother.id,
      sender: block.sender === "anchor" ? "anchor" : "brother",
      source: "screenshot_ocr",
      status: "confirmed",
      text,
    });
    setSnapshot((current) => ({ ...current, messages: addMessage(current.messages, message) }));
    setOcrPreview((current) => {
      const blocks = current.blocks.filter((_, blockIndex) => blockIndex !== index);
      return blocks.length ? { ...current, blocks } : null;
    });
    setReplies([]);
    setNotice(block.sender === "anchor" ? "截图内容已确认写入右侧（未标记为抖音已发送）" : "截图内容已确认写入左侧，可以生成 AI 回复");
    void syncMessage(activeBrother, message);
  };

  const confirmOcrBlocks = async () => {
    if (!activeBrother || !ocrPreview?.blocks?.length) return;
    const blocks = ocrPreview.blocks;
    const unresolvedIndex = blocks.findIndex((block) => !String(block.text || "").trim() || !["brother", "anchor"].includes(block.sender));
    if (unresolvedIndex >= 0) return setNotice(`请先处理第 ${unresolvedIndex + 1} 条截图内容的文字或左右归属`);
    markWorkspaceTouched();
    const baseTime = Date.now();
    const messages = blocks.map((block, index) => createMessage({
      id: `msg_${baseTime.toString(36)}_ocr_${index}`,
      brotherId: activeBrother.id,
      sender: block.sender,
      source: "screenshot_ocr",
      status: "confirmed",
      text: String(block.text).trim(),
      createdAt: new Date(baseTime + index).toISOString(),
    }));
    setSnapshot((current) => messages.reduce((next, message) => ({ ...next, messages: addMessage(next.messages, message) }), current));
    setOcrPreview(null);
    setReplies([]);
    setNotice(`已按截图从上到下写入 ${messages.length} 条消息，左右气泡已复现；右侧仍需主播实际发送后再标记`);
    for (const message of messages) await syncMessage(activeBrother, message);
  };

  const updateOcrBlock = (index, field, value) => {
    setOcrPreview((current) => current ? {
      ...current,
      blocks: current.blocks.map((block, blockIndex) => blockIndex === index ? { ...block, [field]: value } : block),
    } : current);
  };

  const discardOcrBlock = (index) => {
    setOcrPreview((current) => {
      if (!current) return null;
      const blocks = current.blocks.filter((_, blockIndex) => blockIndex !== index);
      return blocks.length ? { ...current, blocks } : null;
    });
    setNotice("已丢弃这条截图识别内容，未写入聊天记录");
  };

  const copyDraft = async () => {
    const text = anchorDraft.trim();
    if (!text) return setNotice("先选择一条候选或填写主播回复");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand("copy"); } catch { /* 浏览器拒绝剪贴板时仍保留草稿 */ }
      textarea.remove();
    }
    setCopied(true);
    setNotice("回复已复制，请到抖音实际发送；工具不会代发");
    window.setTimeout(() => setCopied(false), 1600);
  };

  const confirmSent = () => {
    if (!activeBrother) return setNotice("请先选择维护对象");
    if (!sentConfirmation) return setNotice("请先确认你已经在抖音实际发送");
    const text = anchorDraft.trim();
    if (!text) return setNotice("主播回复输入框为空");
    const draft = createMessage({
      id: `msg_${Date.now().toString(36)}_anchor`,
      brotherId: activeBrother.id,
      sender: "anchor",
      source: "manual",
      status: "draft",
      text,
    });
    const sent = markSent(draft);
    setSnapshot((current) => ({ ...current, messages: addMessage(current.messages, sent) }));
    setAnchorDraft("");
    setSentConfirmation(false);
    setNotice("已记录为主播右侧消息；发送行为由主播在抖音完成");
    void syncMessage(activeBrother, sent);
  };

  const saveReplyHistory = async ({ sourceMessageId, currentMessage, replies: historyReplies, profile: historyProfile, coreDecision: historyDecision, algorithmCore: historyAlgorithmCore, replyStyle: historyReplyStyle = replyStyle }) => {
    if (!currentUser || currentUser.role !== "anchor" || !activeBrother || !Array.isArray(historyReplies) || historyReplies.length === 0) return null;
    const serverBrotherId = await ensureServerBrother(activeBrother);
    if (!serverBrotherId) return null;
    setReplyHistoryBusy(true);
    try {
      const payload = await syncServer("/api/chat/reply-history/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brotherId: serverBrotherId,
          sourceMessageId,
          currentMessage,
          replyStyle: historyReplyStyle,
          replies: historyReplies,
          profile: historyProfile,
          coreDecision: historyDecision,
          algorithmCore: historyAlgorithmCore,
        }),
      });
      if (payload?.item) setReplyHistory((items) => [payload.item, ...items.filter((item) => item.id !== payload.item.id)].slice(0, 30));
      else setNotice("候选已显示，但回复历史暂未同步，请稍后重试");
      return payload?.item ? payload : null;
    } finally {
      setReplyHistoryBusy(false);
    }
  };

  const saveGeneratedCandidates = async ({ brother = activeBrother, sourceMessageId = latestBrotherMessage?.id, currentMessage = latestBrotherMessage?.text || "", replies: candidateReplies = replies, profile: candidateProfile = profile, coreDecision: candidateDecision = coreDecision, algorithmCore: candidateAlgorithmCore = algorithmCore, runtimeAnalysis: candidateRuntimeAnalysis = runtimeAnalysis, runtimeIntake: candidateRuntimeIntake = runtimeIntake, runtime: candidateRuntimeMeta = runtimeMeta, openingTopics: candidateOpeningTopics = openingTopics, liveInvite: candidateLiveInvite = liveInvite, replyStyle: candidateReplyStyle = replyStyle } = {}) => {
    if (!currentUser || currentUser.role !== "anchor" || !brother || !Array.isArray(candidateReplies) || candidateReplies.length === 0) return false;
    const localDraft = { savedAt: new Date().toISOString(), replies: candidateReplies, profile: candidateProfile, coreDecision: candidateDecision, algorithmCore: candidateAlgorithmCore, runtimeAnalysis: candidateRuntimeAnalysis, runtimeIntake: candidateRuntimeIntake, runtime: candidateRuntimeMeta, openingTopics: candidateOpeningTopics, liveInvite: candidateLiveInvite, replyStyle: candidateReplyStyle };
    setCandidateSaveState("saving");
    setCandidateSaveError("");
    try {
      writeReplyDraft(window.localStorage, storageScope, brother.id, localDraft);
    } catch {
      setCandidateSaveError("本机暂存不可用，将继续尝试保存到服务端");
    }
    const workspacePayload = await syncWorkspaceSnapshot(brother, { replies: candidateReplies, profile: candidateProfile, coreDecision: candidateDecision, algorithmCore: candidateAlgorithmCore, runtimeAnalysis: candidateRuntimeAnalysis, runtimeIntake: candidateRuntimeIntake, runtime: candidateRuntimeMeta, openingTopics: candidateOpeningTopics, liveInvite: candidateLiveInvite, replyStyle: candidateReplyStyle });
    if (!workspacePayload?.item) {
      setCandidateSaveState("pending");
      setCandidateSaveError("候选已暂存在本机，但服务端还未确认保存；请点击“重试保存”");
      return false;
    }
    clearReplyDraft(window.localStorage, storageScope, brother.id);
    const historyPayload = await saveReplyHistory({ sourceMessageId, currentMessage, replies: candidateReplies, profile: candidateProfile, coreDecision: candidateDecision, algorithmCore: candidateAlgorithmCore, replyStyle: candidateReplyStyle });
    setCandidateSaveState("saved");
    setCandidateSaveError(historyPayload?.item ? "" : "候选已保存；本次回复历史同步失败，可继续使用当前候选");
    return true;
  };

  const retrySaveCandidates = () => {
    if (!replies.length || !activeBrother) return setNotice("当前没有可保存的 AI 候选");
    void saveGeneratedCandidates({ brother: activeBrother, replies, profile, coreDecision, algorithmCore, openingTopics, liveInvite, replyStyle });
  };

  const restoreReplyHistory = (item) => {
    if (!item) return;
    markWorkspaceTouched();
    setReplies(Array.isArray(item.replies) ? item.replies : []);
    setProfile(item.profile || null);
    setCoreDecision(item.coreDecision || null);
    setAlgorithmCore(item.algorithmCore || null);
    setReplyStyle(normalizeReplyStyle(item.replyStyle || replyStyle));
    setAnchorDraft("");
    setNotice("已恢复这次 AI 候选，选择后仍可继续修改");
  };

  const generateReplies = async () => {
    if (!activeBrother) return setNotice("请先新增或选择一位维护对象");
    if (!latestBrotherMessage) return setNotice("先确认录入一条大哥消息，再生成回复");
    markWorkspaceTouched();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const scopedBrotherId = currentUser ? await ensureServerBrother(activeBrother) : activeBrother.id;
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/profile/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          account: activeBrother.nickname,
          brotherId: scopedBrotherId,
          currentMessage: latestBrotherMessage.text,
          sources: profileSources,
          history: historyPairs(activeMessages),
          replyCount: 6,
          replyPreferences: ["自然聊天", "温柔关心", "轻松幽默", "成熟克制"],
          replyStyle,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI 分析失败");
      const nextReplies = Array.isArray(payload.replies) ? payload.replies : [];
      const nextProfile = payload.profile || null;
      const nextCoreDecision = payload.coreDecision || null;
      const nextAlgorithmCore = payload.algorithmCore || null;
      const nextRuntimeAnalysis = payload.analysis || null;
      const nextRuntimeIntake = payload.intake || null;
      const nextRuntimeMeta = payload.runtime || null;
      setReplies(nextReplies);
      setProfile(nextProfile);
      setCoreDecision(nextCoreDecision);
      setAlgorithmCore(nextAlgorithmCore);
      setRuntimeAnalysis(nextRuntimeAnalysis);
      setRuntimeIntake(nextRuntimeIntake);
      setRuntimeMeta(nextRuntimeMeta);
      setReplyStyle(normalizeReplyStyle(payload.replyStyle || replyStyle));
      setOpeningTopics([]);
      setLiveInvite(null);
      const candidatesSaved = await saveGeneratedCandidates({ brother: activeBrother, sourceMessageId: latestBrotherMessage.id, currentMessage: latestBrotherMessage.text, replies: nextReplies, profile: nextProfile, coreDecision: nextCoreDecision, algorithmCore: nextAlgorithmCore, runtimeAnalysis: nextRuntimeAnalysis, runtimeIntake: nextRuntimeIntake, runtime: nextRuntimeMeta, openingTopics: [], liveInvite: null, replyStyle: normalizeReplyStyle(payload.replyStyle || replyStyle) });
      void syncTaskPlan({ decision: nextCoreDecision, profile: nextProfile });
      setNotice(candidatesSaved ? "AI 已生成候选并保存；点选后还可以继续修改" : "AI 已生成候选，但服务端还在等待保存");
    } catch (caught) {
      setError(caught?.message || "AI 分析失败");
    } finally {
      setLoading(false);
    }
  };

  const generateOpening = async (mode = openingMode) => {
    if (!activeBrother) return setNotice("请先新增或选择一位维护对象");
    if (!latestBrotherMessage) return setNotice("先确认录入一条大哥消息，再生成日常开场");
    markWorkspaceTouched();
    setOpeningMode(mode);
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const scopedBrotherId = currentUser ? await ensureServerBrother(activeBrother) : activeBrother.id;
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/profile/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          account: activeBrother.nickname,
          brotherId: scopedBrotherId,
          currentMessage: latestBrotherMessage.text,
          sources: profileSources,
          history: historyPairs(activeMessages),
          replyCount: 6,
          replyPreferences: ["自然聊天", "温柔关心", "轻松幽默", "成熟克制"],
          replyStyle,
          generationMode: "opening",
          openingMode: mode,
          allowLiveInvite: true,
          lastLiveInviteAt,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "日常开场生成失败");
      const nextReplies = Array.isArray(payload.replies) ? payload.replies : [];
      const nextProfile = payload.profile || null;
      const nextCoreDecision = payload.coreDecision || null;
      const nextAlgorithmCore = payload.algorithmCore || null;
      const nextRuntimeAnalysis = payload.analysis || null;
      const nextRuntimeIntake = payload.intake || null;
      const nextRuntimeMeta = payload.runtime || null;
      const nextOpeningTopics = Array.isArray(payload.openingTopics) ? payload.openingTopics : [];
      const nextLiveInvite = payload.liveInvite || null;
      setReplies(nextReplies);
      setProfile(nextProfile);
      setCoreDecision(nextCoreDecision);
      setAlgorithmCore(nextAlgorithmCore);
      setRuntimeAnalysis(nextRuntimeAnalysis);
      setRuntimeIntake(nextRuntimeIntake);
      setRuntimeMeta(nextRuntimeMeta);
      setReplyStyle(normalizeReplyStyle(payload.replyStyle || replyStyle));
      setOpeningTopics(nextOpeningTopics);
      setLiveInvite(nextLiveInvite);
      if (payload.liveInvite?.allowed) setLastLiveInviteAt(new Date().toISOString());
      const candidatesSaved = await saveGeneratedCandidates({ brother: activeBrother, sourceMessageId: latestBrotherMessage.id, currentMessage: latestBrotherMessage.text, replies: nextReplies, profile: nextProfile, coreDecision: nextCoreDecision, algorithmCore: nextAlgorithmCore, runtimeAnalysis: nextRuntimeAnalysis, runtimeIntake: nextRuntimeIntake, runtime: nextRuntimeMeta, openingTopics: nextOpeningTopics, liveInvite: nextLiveInvite, replyStyle: normalizeReplyStyle(payload.replyStyle || replyStyle) });
      void syncTaskPlan({ decision: nextCoreDecision, profile: nextProfile });
      setNotice(candidatesSaved ? "AI 日常开场已保存，选中后仍可修改" : "AI 已生成日常开场，但服务端还在等待保存");
    } catch (caught) {
      setError(caught?.message || "日常开场生成失败");
    } finally {
      setLoading(false);
    }
  };

  const updateRuntimeMemory = async (action) => {
    if (!currentUser || currentUser.role !== "anchor" || !activeBrother) return setNotice("长期记忆只能由主播本人管理");
    const serverBrotherId = serverBrotherIds.current.get(activeBrother.id) || await ensureServerBrother(activeBrother);
    if (!serverBrotherId) return setNotice("当前对象还没有服务端记录");
    setRuntimeMemoryBusy(true);
    try {
      const response = await fetch(apiUrl("/api/chat/runtime-memory/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, brotherId: serverBrotherId, ...(action === "enable" ? { consent: true } : {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "长期记忆操作失败");
      setRuntimeMemoryStatus(payload.status || null);
      setNotice(action === "enable" ? "已明确同意启用该维护对象的长期记忆" : action === "revoke" ? "该对象的长期记忆已撤销并清除" : action === "pause" ? "长期记忆已暂停写入" : "长期记忆已恢复");
    } catch (caught) {
      setError(caught?.message || "长期记忆操作失败");
    } finally {
      setRuntimeMemoryBusy(false);
    }
  };

  const enableMemory = () => {
    try {
      window.localStorage.setItem(memoryEnabledKey(storageScope), "true");
      writeChatSnapshot(window.localStorage, true, { ...snapshot, profileSources, replyStyle }, chatStorageKey(storageScope));
      setMemoryEnabled(true);
      setNotice("本地聊天记忆已启用");
    } catch {
      setNotice("本机存储失败，聊天记忆未启用");
    }
  };

  const disableMemory = () => {
    clearChatSnapshot(window.localStorage, chatStorageKey(storageScope));
    window.localStorage.removeItem(memoryEnabledKey(storageScope));
    setMemoryEnabled(false);
    setSnapshot(emptySnapshot());
    setBrotherInput("");
    setAnchorDraft("");
    setProfileSources(EMPTY_PROFILE_SOURCES);
    setReplies([]);
    setNotice("本地聊天记忆已清除");
  };

  const logout = async () => {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/logout/`, { method: "POST" }).catch(() => {});
    window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login`);
  };

  if (authLoading) return <div className={styles.authGate}>正在检查登录状态…</div>;
  if (authRequired && !currentUser) return <div className={styles.authGate}><div><strong>需要登录后使用聊天工作台</strong><p>局域网服务已开启账号权限，请使用主播或运营账号登录。</p><button type="button" onClick={() => window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login`)}>去登录</button></div></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>MOBILE CHAT · PHASE 2</div>
          <h1>微信式聊天工作台</h1>
          <p>主播手动录入或识别大哥消息，AI 结合画像生成候选，主播复制后自行在抖音发送。</p>
        </div>
        <div className={styles.headerActions}><div className={styles.headerStatus}>不连接抖音发送接口{currentUser && <span> · {serverSync.syncing ? "服务端同步中" : serverSync.error ? "服务端同步异常" : "服务端同步已开启"}</span>}</div>{currentUser && <div className={styles.userBadge}><a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/tasks/`}>任务中心</a>{currentUser.name} · {currentUser.role === "super_admin" ? "超级管理员" : currentUser.role === "operator" ? "运营" : "主播"}{currentUser.role !== "anchor" && <button type="button" onClick={() => window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/admin`)}>运营复盘</button>}<button type="button" onClick={logout}>退出</button></div>}</div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.brothers} aria-label="维护对象列表">
          <div className={styles.panelTitle}>维护对象 <span>{snapshot.brothers.length}</span></div>
          <form className={styles.chatSearch} onSubmit={runChatSearch} role="search">
            <label htmlFor="chat-search">搜索聊天</label>
            <div className={styles.chatSearchRow}><input id="chat-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜昵称或聊天正文" maxLength={160} /><button type="submit" disabled={searchBusy || !searchQuery.trim()}>{searchBusy ? "…" : "搜"}</button></div>
          </form>
          {searchResults.length > 0 && <div className={styles.searchResults} aria-label="聊天搜索结果"><div className={styles.searchResultTitle}>搜索结果 · {searchResults.length}</div>{searchResults.slice(0, 8).map((result) => <button type="button" className={styles.searchResult} key={`${result.messageId}-${result.createdAt}`} onClick={() => jumpToSearchResult(result)}><strong>{result.brotherNickname}</strong><span>{result.text}</span><small>{result.sender === "brother" ? "大哥" : "主播"} · {formatTime(result.createdAt)}</small></button>)}</div>}
          {snapshot.brothers.map((brother) => (
            <button type="button" className={`${styles.brotherItem} ${activeBrother?.id === brother.id ? styles.active : ""}`} key={brother.id} onClick={() => setActiveBrother(brother.id)}>
              <span className={styles.avatar}>{brother.nickname.slice(0, 1)}</span>
              <span className={styles.brotherCopy}><strong>{brother.nickname}</strong><small>{snapshot.messages.filter((item) => item.brotherId === brother.id).length} 条记录</small></span>
            </button>
          ))}
          <form onSubmit={addBrother} className={styles.addForm}>
            <input aria-label="新维护对象昵称" value={newBrotherName} onChange={(event) => setNewBrotherName(event.target.value)} placeholder="大哥昵称" maxLength={80} />
            <button type="submit">＋ 新增</button>
          </form>
          <div className={styles.memoryBox}>
            <strong>本地聊天记忆</strong>
            <span>{memoryEnabled ? "已启用，仅保存在本机" : "默认关闭"}</span>
            {memoryEnabled ? <button type="button" onClick={disableMemory}>清除本地聊天</button> : <button type="button" onClick={enableMemory}>启用记忆</button>}
          </div>
        </aside>

        <main className={styles.chat}>
          <div className={styles.chatHeader}>
            <div className={styles.chatIdentity}><span className={styles.avatar}>{activeBrother?.nickname?.slice(0, 1) || "?"}</span><div><strong>{activeBrother?.nickname || "先新增一位大哥"}</strong><small>本地聊天记录 · 左侧大哥 / 右侧主播</small></div></div>
            <span className={styles.readonlyHint}>主播确认制</span>
          </div>

          <div className={styles.timeline} ref={timelineRef} onScroll={handleTimelineScroll} aria-label="聊天记录" aria-live="polite" tabIndex="0">
            {!activeBrother && <div className={styles.empty}>新增维护对象后，开始录入第一条消息。</div>}
            {activeBrother && activeMessages.length === 0 && <div className={styles.empty}>还没有记录。请在下方输入大哥发来的消息。</div>}
            {activeMessages.map((message) => (
              <div className={`${styles.messageRow} ${message.direction === "right" ? styles.right : styles.left} ${highlightMessageId === message.id ? styles.highlightMessage : ""}`} data-message-id={message.id} key={message.id}>
                <div className={styles.bubbleWrap}><span className={styles.sender}>{message.sender === "brother" ? activeBrother.nickname : "主播"}</span>{editingMessageId === message.id ? <div className={styles.messageEdit}><textarea aria-label={`修改聊天内容 ${message.id}`} value={editingText} onChange={(event) => setEditingText(event.target.value)} maxLength={2000} /><div className={styles.messageEditActions}><button type="button" onClick={() => saveMessageEdit(message)}>保存修改</button><button type="button" onClick={cancelEditMessage}>取消</button></div></div> : <><div className={`${styles.bubble} ${message.direction === "right" ? styles.anchorBubble : styles.brotherBubble}`}>{message.text}</div><small className={styles.messageMeta}>{messageSourceLabel(message)} · {formatTime(message.sentAt || message.createdAt)}{message.pinned ? " · 已置顶" : ""}{message.favorite ? " · 已收藏" : ""}</small><div className={styles.messageMarkTools}>{(!currentUser || currentUser.role === "anchor") && <><button type="button" onClick={() => toggleMessageMark(message, "favorite")} aria-label={message.favorite ? "取消收藏" : "收藏"}>{message.favorite ? "★ 已收藏" : "☆ 收藏"}</button><button type="button" onClick={() => toggleMessageMark(message, "pinned")} aria-label={message.pinned ? "取消置顶" : "置顶"}>{message.pinned ? "⌃ 已置顶" : "⌃ 置顶"}</button><button type="button" className={styles.editMessageButton} onClick={() => beginEditMessage(message)}>修改</button></>}</div></>}</div>
              </div>
            ))}
            {showScrollToBottom && <button type="button" className={styles.scrollToBottom} onClick={() => scrollTimelineToBottom("smooth")} aria-label="回到底部">↓ 回到底部</button>}
          </div>

          <section className={styles.composer} aria-label="消息录入和回复">
            <label className={styles.fieldLabel} htmlFor="brother-input"><strong>① 大哥消息</strong><span>主播手动输入或粘贴</span></label>
            <details className={styles.profileSourcePanel}>
              <summary>画像素材（可选，不填也能生成）</summary>
              <p>只粘贴你有权使用的作品、评论或公开发言；工具不会登录或抓取抖音。</p>
              <label htmlFor="profile-works">作品文案<textarea id="profile-works" value={profileSources.works} onChange={(event) => { markWorkspaceTouched(); setProfileSources({ ...profileSources, works: event.target.value }); }} placeholder="粘贴他公开作品里的文字或你有权提供的内容…" maxLength={6000} /></label>
              <label htmlFor="profile-comments">近期评论<textarea id="profile-comments" value={profileSources.comments} onChange={(event) => { markWorkspaceTouched(); setProfileSources({ ...profileSources, comments: event.target.value }); }} placeholder="粘贴近期评论内容，尽量保留原话…" maxLength={6000} /></label>
              <label htmlFor="profile-statements">公开发言<textarea id="profile-statements" value={profileSources.statements} onChange={(event) => { markWorkspaceTouched(); setProfileSources({ ...profileSources, statements: event.target.value }); }} placeholder="粘贴公开发言或双方已授权的聊天片段…" maxLength={6000} /></label>
            </details>
            {ENABLE_SCREENSHOT_OCR && <>
              <div className={styles.importRow}>
                <label className={styles.importButton} htmlFor="screenshot-input">{ocrBusy ? "识别中…" : "导入截图识别"}</label>
                <input id="screenshot-input" className={styles.hiddenFile} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleOcrFile} disabled={ocrBusy} />
                <span>识别结果必须逐条确认</span>
              </div>
              {ocrPreview && <div className={styles.ocrPreview} aria-label="截图识别待确认内容">
              <strong>截图识别预览</strong>
              <span className={styles.ocrHint}>左侧气泡自动归为大哥 · 右侧气泡自动归为主播 · 居中或无坐标需要人工确认</span>
              <button type="button" className={styles.ocrConfirmAll} disabled={ocrPreview.blocks.some((block) => !String(block.text || "").trim() || !["brother", "anchor"].includes(block.sender))} onClick={confirmOcrBlocks}>按截图顺序写入聊天</button>
              {ocrPreview.blocks.map((block, index) => <div className={styles.ocrBlock} key={block.id || `${ocrPreview.importId}-${index}`}>
                <textarea aria-label={`截图识别内容 ${index + 1}`} value={block.text} onChange={(event) => updateOcrBlock(index, "text", event.target.value)} maxLength={800} />
                <label className={styles.ocrSender}>这条内容属于：<select value={block.sender === "unknown" ? "unknown" : block.sender === "anchor" ? "anchor" : "brother"} onChange={(event) => updateOcrBlock(index, "sender", event.target.value)}><option value="unknown">未判断（请确认）</option><option value="brother">大哥（左侧）</option><option value="anchor">主播（右侧，未标记已发送）</option></select></label>
                <div className={styles.ocrActions}><button type="button" disabled={!String(block.text || "").trim() || !["brother", "anchor"].includes(block.sender)} onClick={() => confirmOcrBlock(index)}>确认写入{block.sender === "anchor" ? "右侧" : block.sender === "brother" ? "左侧" : "聊天"}</button><button type="button" onClick={() => discardOcrBlock(index)}>丢弃</button></div>
              </div>)}
              </div>}
            </>}
            <textarea id="brother-input" aria-label="大哥消息输入框" value={brotherInput} onChange={(event) => setBrotherInput(event.target.value)} placeholder="把大哥发来的消息输入或粘贴到这里…" maxLength={2000} />
            <button type="button" className={styles.confirmButton} onClick={confirmBrotherMessage} disabled={!activeBrother || !brotherInput.trim()}>确认录入左侧</button>
            <label className={styles.fieldLabel} htmlFor="anchor-draft"><strong>② 主播回复</strong><span>候选放入后可自由修改</span></label>
            <textarea id="anchor-draft" aria-label="主播回复输入框" value={anchorDraft} onChange={(event) => { markWorkspaceTouched(); setAnchorDraft(event.target.value); }} placeholder="选择 AI 候选，或自己输入想发送的话…" maxLength={2000} />
            <div className={`${styles.replyCheck} ${replyCheckTone}`} aria-live="polite"><div><strong>发送前检查</strong><span>{replyCheckDisplay.level === "idle" ? "等待输入" : replyCheckDisplay.level === "clear" ? "自然度和边界暂未发现明显问题" : replyCheckDisplay.level === "block" ? "需要先补充回复内容" : "建议主播确认后再发送"}</span></div>{replyCheckDisplay.warnings.length > 0 && <ul>{replyCheckDisplay.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}{replyCheckDisplay.suggestions.length > 0 && <small>{replyCheckDisplay.suggestions[0]}</small>}</div>
            <div className={styles.openingTools} aria-label="画像驱动日常开场"><div className={styles.fieldLabel}><strong>画像开场</strong><span>基于已确认记录</span></div><div className={styles.openingButtons}><button type="button" onClick={() => generateOpening("morning")} disabled={loading || !latestBrotherMessage}>早安问候</button><button type="button" onClick={() => generateOpening("after_work")} disabled={loading || !latestBrotherMessage}>下班关心</button><button type="button" onClick={() => generateOpening("continue_topic")} disabled={loading || !latestBrotherMessage}>接着上次话题</button><button type="button" onClick={() => generateOpening("casual")} disabled={loading || !latestBrotherMessage}>轻松聊两句</button></div></div>
            <div className={styles.actionRow}><button type="button" className={styles.generateButton} aria-label="生成 AI 回复" onClick={generateReplies} disabled={loading || !latestBrotherMessage}>{loading ? "生成中…" : "③ 生成 AI 回复"}</button><button type="button" className={styles.copyButton} aria-label="复制回复" onClick={copyDraft} disabled={!anchorDraft.trim()}>{copied ? "已复制" : "复制回复"}</button></div>
            <label className={styles.sentCheck}><input type="checkbox" checked={sentConfirmation} onChange={(event) => setSentConfirmation(event.target.checked)} /> 我已在抖音实际发送</label>
            <button type="button" className={styles.sentButton} aria-label="标记已发送" onClick={confirmSent} disabled={!sentConfirmation || !anchorDraft.trim()}>④ 标记已发送</button>
            <p className={styles.composerNote}>复制不会自动写入右侧聊天；只有主播确认已在抖音发出后，才记录为已发送。</p>
          </section>
        </main>

        <aside className={styles.aiPanel} aria-label="AI 回复和画像">
          <div className={styles.aiTitle}><div><strong>AI 回复候选</strong><small>GLM-5.3 · 选择后放入输入框</small></div><span>goutoujunshi</span></div>
          {replies.length > 0 && <div className={styles.replySaveStatus} aria-live="polite"><span>{candidateSaveState === "saving" ? "候选保存中…" : candidateSaveState === "pending" ? "候选待同步" : candidateSaveState === "saved" ? "候选已保存" : "候选未保存"}</span>{candidateSaveState === "pending" && currentUser?.role === "anchor" && <button type="button" onClick={retrySaveCandidates}>重试保存</button>}{candidateSaveError && <small>{candidateSaveError}</small>}</div>}
          <div className={styles.replyStyleControl}><label htmlFor="reply-style"><strong>回复风格</strong><span>只调整表达，不改变边界和事实</span></label><select id="reply-style" value={replyStyle} onChange={(event) => { markWorkspaceTouched(); setReplyStyle(normalizeReplyStyle(event.target.value)); }}><option value="balanced">自然平衡</option><option value="warm">温暖细腻</option><option value="humorous">轻松幽默</option><option value="mature">成熟克制</option><option value="brief">简短利落</option><option value="direct">直接清楚</option></select></div>
          {error && <div className={styles.error}>{error}</div>}
          {notice && <div className={styles.notice}>{notice}</div>}
          {coreDecision && <div className={styles.decision}><strong>本轮目标：{coreDecision.action}</strong><small>{coreDecision.observationWindow}</small></div>}
          {runtimeAnalysis && <details className={styles.runtimePanel} open><summary><span>本轮判断依据</span><small>{runtimeMeta?.name || "goutoujunshi"} · {runtimeMeta?.sourceRevision?.slice(0, 7) || "本地"}</small></summary><div className={styles.runtimeBody}><div className={styles.runtimeGoal}><span>主目标</span><strong>{runtimeAnalysis.primaryGoal || "承接"}</strong><small>{runtimeAnalysis.emotion?.label || "情绪未明确"}{Number.isFinite(Number(runtimeAnalysis.emotion?.intensity)) ? ` · 强度 ${runtimeAnalysis.emotion.intensity}/5` : ""}</small></div>{runtimeAnalysis.facts?.length > 0 && <div className={styles.runtimeGroup}><strong>已确认事实</strong><ul>{runtimeAnalysis.facts.slice(0, 4).map((item, index) => <li key={`fact-${index}`}>{runtimeItemText(item)}</li>)}</ul></div>}{runtimeAnalysis.unknowns?.length > 0 && <div className={styles.runtimeGroup}><strong>仍需保持未知</strong><ul>{runtimeAnalysis.unknowns.slice(0, 4).map((item, index) => <li key={`unknown-${index}`}>{runtimeItemText(item)}</li>)}</ul></div>}<div className={styles.runtimeBoundary}><span>停止条件</span><p>{runtimeAnalysis.stopCondition || runtimeAnalysis.decision?.stopCondition || "对方明确拒绝或出现边界风险"}</p></div>{runtimeIntake?.needsProfile && <div className={styles.runtimeIntake}><strong>资料不足时先补充</strong><p>{runtimeIntake.questions?.[0] || "先确认关系和已知事实"}</p></div>}{runtimeMemoryStatus && <div className={styles.runtimeMemory}><div><strong>长期记忆</strong><span>{runtimeMemoryStatus.paused ? "已暂停" : runtimeMemoryStatus.consentEnabled ? "已启用" : "默认关闭"} · 仅用于当前主播与当前对象</span></div>{currentUser?.role === "anchor" && <div className={styles.runtimeMemoryActions}>{runtimeMemoryStatus.consentEnabled ? <>{runtimeMemoryStatus.paused ? <button type="button" disabled={runtimeMemoryBusy} onClick={() => updateRuntimeMemory("resume")}>恢复</button> : <button type="button" disabled={runtimeMemoryBusy} onClick={() => updateRuntimeMemory("pause")}>暂停</button>}<button type="button" disabled={runtimeMemoryBusy} onClick={() => updateRuntimeMemory("revoke")}>撤销并清除</button></> : <button type="button" disabled={runtimeMemoryBusy} onClick={() => updateRuntimeMemory("enable")}>明确同意启用</button>}</div>}</div>}</div></details>}
          {taskSummary && <section className={styles.taskCard} aria-label="当前维护任务"><div className={styles.taskCardHead}><div><strong>维护任务</strong><small>{taskSummary.summary?.pendingReply || 0} 待回复 · {taskSummary.summary?.followUp || 0} 待跟进</small></div><a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/tasks/`}>查看全部</a></div>{taskSummary.items?.filter((item) => !["done", "dismissed"].includes(item.status)).slice(0, 1).map((task) => <div className={styles.taskCardBody} key={task.id}><span className={styles.taskStatus}>{task.status === "pending_reply" ? "待回复" : task.status === "follow_up" ? "待跟进" : task.status === "snoozed" ? "稍后处理" : task.status}</span><strong className={styles.followUpLabel}>下次跟进建议</strong><p>{task.nextAction || task.reason || "等待主播确认下一步"}</p>{task.dueAt && <small className={styles.followUpDue}>建议时间：{formatTime(task.dueAt)}</small>}{currentUser?.role === "anchor" ? <div className={styles.taskActions}><button type="button" disabled={taskBusy} onClick={() => updateCurrentTask(task.id, "snoozed", nextFollowUpAt(4))}>4 小时后</button><button type="button" disabled={taskBusy} onClick={() => updateCurrentTask(task.id, "follow_up", nextFollowUpAt(24))}>明天再聊</button><button type="button" disabled={taskBusy} onClick={() => updateCurrentTask(task.id, "done")}>已完成</button></div> : <small className={styles.taskReadonly}>运营和管理只读查看</small>}</div>)}{!taskSummary.items?.some((item) => !["done", "dismissed"].includes(item.status)) && <div className={styles.taskEmpty}>当前对象没有待处理任务</div>}</section>}
          {openingTopics.length > 0 && <div className={styles.openingTopicPanel}><strong>可以自然接的话题</strong><div className={styles.topicButtons}>{openingTopics.map((topic) => <button key={topic} type="button" onClick={() => { markWorkspaceTouched(); setAnchorDraft(topic); setNotice("话题提示已放入主播回复输入框，请按真实语气补充；不是固定话术"); }}>{topic}</button>)}</div></div>}
          {liveInvite?.allowed && liveInvite.text && <article className={styles.liveInvite}><div><strong>直播内容邀请</strong><small>仅供人工选择，不含礼物或消费要求</small></div><p>{liveInvite.text}</p><button type="button" onClick={() => { markWorkspaceTouched(); setAnchorDraft(liveInvite.text); setNotice("直播邀请已放入输入框，请按真实语气修改后再决定是否发送"); }}>放入输入框</button></article>}
          <div className={styles.replyList}>
            {replies.length === 0 && <div className={styles.emptyPanel}>确认一条大哥消息后，点“生成 AI 回复”。</div>}
            {replies.map((reply, index) => (
              <article className={styles.replyCard} key={`${reply.style || "reply"}-${index}`}>
                <div className={styles.replyMeta}><span>{reply.style || `候选 ${index + 1}`}</span><small>AI 原创</small></div>
                <p>{reply.text}</p>
                {reply.rationale && <small className={styles.rationale}>{reply.rationale}</small>}
                <button type="button" onClick={() => { markWorkspaceTouched(); setAnchorDraft(reply.text || ""); setNotice("候选已放入主播回复输入框，可继续修改"); }}>放入输入框</button>
              </article>
            ))}
          </div>
          <details className={styles.replyHistory} open={replyHistory.length > 0}>
            <summary>回复历史 <span>{replyHistoryBusy ? "保存中…" : replyHistory.length}</span></summary>
            {replyHistory.length === 0 ? <small className={styles.replyHistoryEmpty}>每次 AI 生成的候选都会按当前主播和维护对象保存，方便之后回溯。</small> : <div className={styles.replyHistoryList}>{replyHistory.map((item) => <article key={item.id} className={styles.replyHistoryItem}><div className={styles.replyHistoryHead}><strong>{formatDateTime(item.createdAt)} · {item.replyStyle}</strong><small>{item.currentMessage || "未记录当时消息"}</small></div><div className={styles.replyHistoryReplies}>{item.replies.slice(0, 6).map((reply, index) => <p key={`${item.id}-${index}`}><span>{index + 1}</span>{reply.text}</p>)}</div>{currentUser?.role === "anchor" && <button type="button" onClick={() => restoreReplyHistory(item)}>恢复这批候选</button>}</article>)}</div>}
          </details>
          <details className={styles.relationshipTimeline} open={timelineEvents.length > 0}><summary>关系时间线 <span>{timelineEvents.length}</span></summary><div className={styles.timelineEvents}>{timelineEvents.length === 0 && <small>只记录主播确认过的事实和手工事件，不自动推断敏感信息。</small>}{timelineEvents.map((event) => <article key={event.id}><div><strong>{event.title}</strong><time>{formatDateTime(event.occurredAt)}</time></div><p>{event.body || "未补充说明"}</p><small>{event.createdByName || "主播"} · {event.type}</small></article>)}</div>{currentUser?.role === "anchor" ? <form className={styles.timelineForm} onSubmit={addTimelineEvent}><select aria-label="时间线事件类型" value={timelineForm.type} onChange={(event) => setTimelineForm({ ...timelineForm, type: event.target.value })}><option value="note">备注</option><option value="first_contact">首次联系</option><option value="milestone">重要节点</option><option value="follow_up">跟进</option><option value="boundary">边界确认</option></select><input aria-label="时间线事件标题" value={timelineForm.title} onChange={(event) => setTimelineForm({ ...timelineForm, title: event.target.value })} placeholder="例如：聊到最近项目" maxLength={120} /><textarea aria-label="时间线事件内容" value={timelineForm.body} onChange={(event) => setTimelineForm({ ...timelineForm, body: event.target.value })} placeholder="写下已确认的事实或下次可接的话题…" maxLength={1200} /><button type="submit" disabled={timelineBusy || !timelineForm.title.trim()}>记录事件</button></form> : <small className={styles.readonlyLine}>运营和管理只读查看 · 主播确认后才会写入</small>}</details>
          {currentUser?.role !== "anchor" && <details className={styles.operatorNotes} open={operatorNotes.length > 0}><summary>运营内部备注 <span>{operatorNotes.length}</span></summary><p className={styles.notesHint}>仅运营和最高管理可见，不会出现在主播端聊天记录中。</p><div className={styles.noteList}>{operatorNotes.map((note) => <article key={note.id}><p>{note.body}</p><small>{note.createdByName || "运营"} · {formatDateTime(note.createdAt)}</small></article>)}</div><form onSubmit={addOperatorNote}><textarea aria-label="运营内部备注" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="记录下次跟进重点、边界或需要复盘的细节…" maxLength={2000} /><button type="submit" disabled={notesBusy || !noteDraft.trim()}>保存备注</button></form></details>}
          <details className={styles.profilePanel}><summary>画像分析与边界</summary>{profile ? <div className={styles.profileBody}><p>{profile.summary || "信息有限，保持开放提问"}</p><div className={styles.chips}>{(profile.interests || []).map((item) => <span key={item}>#{item}</span>)}</div><div><b>沟通风格：</b>{profile.communicationStyle || "未明确"}</div><div><b>适合话题：</b>{(profile.preferredTopics || []).join("、") || "等待更多证据"}</div><div><b>避免话题：</b>{(profile.avoidTopics || []).join("、") || "暂无"}</div>{algorithmCore?.revision && <div className={styles.algorithm}>核心算法：goutoujunshi · {algorithmCore.revision.slice(0, 7)}</div>}</div> : <div className={styles.emptyPanel}>生成回复后查看基于证据的画像，不把猜测当事实。</div>}</details>
        </aside>
      </div>
    </div>
  );
}
