import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Head from "next/head";
import { normalizeBrothers } from "../lib/brother-storage";
import { readMemoryState, writeMemoryState, updateMemorySection } from "../lib/local-memory";
import { estimateProfileRequest } from "../lib/request-budget";
import {
  personalities,
  getStats,
  exportBrotherRecord,
} from "../lib/generator";
import { projectRuntimeAnalysis } from "../lib/runtime-ui-projection.cjs";

const AI_REPLY_PREFERENCES = [
  { key: "natural", label: "自然聊天", emoji: "🌿" },
  { key: "warm", label: "温柔关心", emoji: "🌤️" },
  { key: "humor", label: "轻松幽默", emoji: "😄" },
  { key: "mature", label: "成熟克制", emoji: "🪴" },
  { key: "flirty", label: "轻微暧昧", emoji: "✨" },
  { key: "boundary", label: "边界清晰", emoji: "🧭" },
  { key: "concise", label: "简短利落", emoji: "⚡" },
  { key: "empathy", label: "高情商共情", emoji: "🫶" },
];
const AI_REPLY_PREFERENCE_MAP = Object.fromEntries(AI_REPLY_PREFERENCES.map(item => [item.key, item.label]));

const ALL_EXAMPLES = [
  { msg: "在吗 想你了", hint: "开场" },
  { msg: "刚给你刷了个嘉年华 不用谢", hint: "刷礼物" },
  { msg: "给你转了点心意 收一下", hint: "感谢打赏" },
  { msg: "我喜欢你 做我女朋友吧", hint: "告白" },
  { msg: "发张照片看看呗", hint: "越界" },
  { msg: "今天加班好累啊", hint: "安慰" },
  { msg: "能借我3万块吗 周转不开", hint: "借钱" },
  { msg: "我帮你守塔了 血条差点被偷", hint: "PK" },
  { msg: "今天我生日 你不祝我吗", hint: "生日" },
  { msg: "给我唱一首后来吧 睡不着", hint: "点歌" },
  { msg: "下播啦 今天谢谢你", hint: "下播" },
  { msg: "今天被老板骂了 真不想干了", hint: "吐槽" },
  { msg: "周末有空吗 出来吃个饭", hint: "邀约" },
];

const INTENSITY_LEVELS = [
  { key: "warmup", label: "保持距离", emoji: "🌿" },
  { key: "daily",  label: "日常维护", emoji: "💬" },
  { key: "heatup", label: "升温撩拨", emoji: "🔥" },
];

const TAB_RESULT = "result";
const TAB_HISTORY = "history";
const TAB_FAV = "fav";
const TAB_BROS = "bros";

export default function Home() {
  const [message, setMessage] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [results, setResults] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [intensity, setIntensity] = useState("auto");
  const [activeTab, setActiveTab] = useState(TAB_RESULT);
  const [history, setHistory] = useState([]);
  const [fav, setFav] = useState([]);
  const [docked, setDocked] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [broNickname, setBroNickname] = useState("");
  const [broAddress, setBroAddress] = useState("");
  const [brothers, setBrothers] = useState([]);
  const [broDetailId, setBroDetailId] = useState(null);
  const [now, setNow] = useState(null);
  // 🧠 新增：当前选中的大哥（独立会话隔离）
  const [activeBroId, setActiveBroId] = useState(null);
  // 🧠 新增：会话历史面板开关
  const [showSession, setShowSession] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [aiSources, setAiSources] = useState({ account: "", works: "", comments: "", statements: "" });
  const [aiConsent, setAiConsent] = useState(false);
  const [aiProfile, setAiProfile] = useState(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState("");
  const [zhipuHealth, setZhipuHealth] = useState(null);
  const [apiHealthRefreshing, setApiHealthRefreshing] = useState(false);
  const [apiHealthError, setApiHealthError] = useState("");
  const [requestBudget, setRequestBudget] = useState(null);

  const persistMemory = useCallback((section, value) => {
    try {
      updateMemorySection(localStorage, section, value);
    } catch {
      setMemoryNotice("本机存储失败，当前内容未保存");
      return false;
    }
    return true;
  }, []);

  const refreshZhipuHealth = useCallback(async () => {
    setApiHealthRefreshing(true);
    setApiHealthError("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/health/`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const payload = await response.json();
      setZhipuHealth(payload);
      return payload;
    } catch {
      setApiHealthError("暂时无法读取服务端状态，请确认 Next.js 服务仍在运行");
      setZhipuHealth((current) => current || { status: "unreachable" });
      return null;
    } finally {
      setApiHealthRefreshing(false);
    }
  }, []);

  const textareaRef = useRef(null);
  const aiPanelRef = useRef(null);
  const memoryFileRef = useRef(null);

  const stats = useMemo(() => getStats(), []);

  useEffect(() => {
    const savedMemory = localStorage.getItem("hh_memory_enabled") === "true";
    setMemoryEnabled(savedMemory);
    let savedMemoryState = { history: [], favorites: [], brothers: [], preferences: {} };
    if (savedMemory) {
      try {
        savedMemoryState = readMemoryState(localStorage);
        setHistory(savedMemoryState.history);
        setFav(savedMemoryState.favorites);
        setBrothers(normalizeBrothers(savedMemoryState.brothers));
      } catch {
        setMemoryNotice("本机记忆格式无法读取，已保持为空");
      }
    }
    // 🧠 记忆：加载用户偏好设置
    const savedPrefs = savedMemory ? savedMemoryState.preferences : {};
    if (savedPrefs.selectedTags) setSelectedTags(savedPrefs.selectedTags);
    if (savedPrefs.intensity) setIntensity(savedPrefs.intensity);
    if (savedPrefs.broNickname) setBroNickname(savedPrefs.broNickname);
    if (savedPrefs.broAddress) setBroAddress(savedPrefs.broAddress);
    // 🧠 记忆：恢复上次选中的大哥（独立会话）
    if (savedPrefs.activeBroId) {
      setActiveBroId(savedPrefs.activeBroId);
      const bro = savedMemoryState.brothers.find(b => b.id === savedPrefs.activeBroId);
      if (bro) {
        setBroNickname(bro.nickname || "");
        if (bro.address) setBroAddress(bro.address);
        if (bro.aiProfile) setAiProfile(bro.aiProfile);
      }
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    refreshZhipuHealth();
  }, [refreshZhipuHealth]);

  useEffect(() => {
    if (storageReady && memoryEnabled) persistMemory("brothers", brothers);
  }, [brothers, storageReady, memoryEnabled, persistMemory]);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      setNow(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);


  useEffect(() => {
    const onVis = () => {
      if (typeof window === "undefined" || !window.visualViewport) return;
      const vv = window.visualViewport;
      setDocked(vv.height < window.innerHeight - 80);
    };
    if (typeof window !== "undefined" && window.visualViewport) {
      window.visualViewport.addEventListener("resize", onVis);
      window.visualViewport.addEventListener("scroll", onVis);
    }
    return () => {
      if (typeof window !== "undefined" && window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onVis);
        window.visualViewport.removeEventListener("scroll", onVis);
      }
    };
  }, []);

  // 🧠 记忆：自动保存用户偏好（回复风格/浓度/称呼/当前大哥）
  useEffect(() => {
    const prefs = { selectedTags, intensity, broNickname, broAddress, activeBroId };
    if (memoryEnabled) persistMemory("preferences", prefs);
  }, [selectedTags, intensity, broNickname, broAddress, activeBroId, memoryEnabled, persistMemory]);

  // 🧠 核心：检测备注名变化 → 自动切换/新建独立会话
  const prevNicknameRef = useRef("");
  useEffect(() => {
    if (!broNickname.trim()) return;
    const currentNick = broNickname.trim();
    // 跳过初始化阶段
    if (!prevNicknameRef.current && !activeBroId) {
      prevNicknameRef.current = currentNick;
      return;
    }
    // 备注名变了
    if (prevNicknameRef.current !== currentNick && prevNicknameRef.current) {
      // 检查是否已存在这个大哥
      const existing = brothers.find(b => b.nickname === currentNick);
      if (existing) {
        // 已存在 → 切换到这个大哥
        setActiveBroId(existing.id);
        setBroAddress(existing.address || broAddress);
      } else {
        // 不存在 → 清除 activeBroId，等生成时自动创建
        // 但保留 address 设置
        setActiveBroId(null);
      }
    }
    prevNicknameRef.current = currentNick;
  }, [broNickname]);

  const pushHistory = useCallback((msg, tags, arr, analysisOverride = null, metadata = {}) => {
    const record = {
      id: Date.now() + "" + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      msg,
      tags: [...tags],
      items: arr.map(r => ({
        label: r.label, emoji: r.emoji, scenario: r.scenario,
        text: r.text,
      })),
      analysis: analysisOverride || arr._analysis || null,
      aiSources: metadata.aiSources || null,
      context: Array.isArray(metadata.context) ? metadata.context.slice(0, 10) : [],
      broNickname: metadata.broNickname || "",
      broAddress: metadata.broAddress || "",
    };
    setHistory(prev => {
      const next = [record, ...prev].slice(0, 20);
      if (memoryEnabled) persistMemory("history", next);
      return next;
    });
  }, [memoryEnabled, persistMemory]);

  const toggleFav = useCallback((row) => {
    setFav(prev => {
      const existIdx = prev.findIndex(f => f.text === row.text && f.label === row.label);
      let next;
      if (existIdx >= 0) next = prev.filter((_, i) => i !== existIdx);
      else {
        next = [{
          id: Date.now() + "" + Math.random().toString(36).slice(2, 6),
          ts: Date.now(),
          label: row.label, emoji: row.emoji, scenario: row.scenario,
          text: row.text, sourceMsg: message,
        }, ...prev].slice(0, 50);
      }
      if (memoryEnabled) persistMemory("favorites", next);
      return next;
    });
  }, [message, memoryEnabled, persistMemory]);

  const favContains = (row) => fav.some(f => f.text === row.text && f.label === row.label);

  const toggleTag = (key) => setSelectedTags(prev =>
    prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // 获取输入框内容（兼容 IME）
  const getMsg = (override) => {
    if (typeof override === "string" && override.trim()) return override.trim();
    const ta = textareaRef.current;
    if (ta && ta.value && ta.value.trim()) return ta.value.trim();
    return message.trim();
  };

  // 🧠 选择/创建大哥（独立会话入口）
  const selectBrother = (broId) => {
    const bro = brothers.find(b => b.id === broId);
    if (!bro) return;
    setActiveBroId(broId);
    setBroNickname(bro.nickname || "");
    if (bro.address) setBroAddress(bro.address);
    setAiProfile(bro.aiProfile || null);
    setAiError("");
    // 自动填充历史上下文到输入框下方
    setShowSession(true);
  };

  // 🧠 新建大哥
  const createNewBrother = () => {
    setActiveBroId(null);
    setBroNickname("");
    setBroAddress("");
    setMessage("");
    setResults([]);
    setAnalysis(null);
    setShowSession(false);
    setAiProfile(null);
    setAiSources({ account: "", works: "", comments: "", statements: "" });
    setAiConsent(false);
    setAiError("");
  };

  // 🧠 获取当前大哥的独立会话历史（按 nickname 查找，确保隔离）
  const getCurrentBroContext = () => {
    const nickname = broNickname.trim();
    if (!nickname) return [];
    // 以 nickname 为准查找（确保即使 activeBroId 未更新也能正确匹配）
    let bro = brothers.find(b => b.nickname === nickname);
    if (!bro && activeBroId) {
      bro = brothers.find(b => b.id === activeBroId);
    }
    if (!bro || !bro.sessions) return [];
    return (bro.sessions || []).slice(0, 10).map(s => ({
      msg: s.msg,
      scenario: s.scenario,
      reply: s.reply,
      ts: s.ts,
    }));
  };

  // 所有生成入口都先完成关系目标判断，再由智谱 GLM-5.3 直接原创回复。
  const handleGenerate = () => handleAiGenerate();

  // 🧠 向当前大哥的会话追加一条记录（独立存储，按 nickname 严格隔离）
  const appendBroSession = (msg, analysis, reply, generatedResults = [], nicknameOverride = broNickname, addressOverride = broAddress) => {
    const nickname = nicknameOverride.trim();
    if (!nickname) return;

    setBrothers(prev => {
      // 🧠 严格按 nickname 查找（不依赖 activeBroId，彻底隔离）
      let existingIdx = -1;
      // 先按 nickname 精确匹配
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].nickname === nickname) {
          existingIdx = i;
          break;
        }
      }
      // 如果有 activeBroId 且 nickname 也匹配，那就是同一个
      // 如果 nickname 不匹配但 activeBroId 存在，忽略 activeBroId（以 nickname 为准）

      const scenarioKey = analysis?.scenarioKey || "unknown";
      const brotherType = analysis?.brotherType || "unknown";
      const sessionEntry = {
        id: "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        msg,
        reply,
        scenario: scenarioKey,
        brotherType,
        ts: Date.now(),
      };

      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const sessions = [sessionEntry, ...(existing.sessions || [])].slice(0, 100);
        const scenarioStats = { ...(existing.scenarioStats || {}) };
        scenarioStats[scenarioKey] = (scenarioStats[scenarioKey] || 0) + 1;
        const typeStats = { ...(existing.typeStats || {}) };
        typeStats[brotherType] = (typeStats[brotherType] || 0) + 1;
        const topStyles = generatedResults.slice(0, 3).map(r => r.label).filter(Boolean);
        const bestStyles = [...new Set([...topStyles, ...(existing.bestStyles || [])])].slice(0, 5);
        const updated = {
          ...existing,
          sessions,
          scenarioStats,
          typeStats,
          bestStyles,
          lastInteraction: Date.now(),
          interactionCount: (existing.interactionCount || 0) + 1,
          address: addressOverride.trim() || existing.address,
          brotherMessage: msg,
          analysis,
          replies: generatedResults,
        };
        // 更新当前激活的大哥
        setTimeout(() => setActiveBroId(existing.id), 0);
        return prev.map((b, i) => i === existingIdx ? updated : b);
      } else {
        // 全新的大哥（nickname 从未出现过）
        const newBro = {
          id: "bro_" + Date.now().toString(36),
          nickname,
          address: addressOverride.trim(),
          sessions: [sessionEntry],
          scenarioStats: { [scenarioKey]: 1 },
          typeStats: { [brotherType]: 1 },
          bestStyles: generatedResults.slice(0, 3).map(r => r.label).filter(Boolean),
          lastInteraction: Date.now(),
          interactionCount: 1,
          createdAt: Date.now(),
          brotherMessage: msg,
          analysis,
          replies: generatedResults,
        };
        setTimeout(() => setActiveBroId(newBro.id), 0);
        return [newBro, ...prev].slice(0, 200);
      }
    });
  };

  const runAiGeneration = async ({
    messageOverride = "",
    contextOverride = null,
    nicknameOverride = broNickname,
    addressOverride = broAddress,
    sourcesOverride = null,
  } = {}) => {
    const msg = getMsg(messageOverride);
    if (isGenerating || isAiGenerating) return;
    if (!msg) return setAiError("请先输入对方当前发言");
    if (!aiConsent) {
      if (aiPanelRef.current) aiPanelRef.current.open = true;
      return setAiError("所有回复都由智谱 GLM-5.3 原创生成，请先确认素材授权");
    }

    setIsAiGenerating(true);
    setIsGenerating(true);
    setAiError("");
    setResults([]);
    setRequestBudget(null);
    setActiveTab(TAB_RESULT);
    try {
      const broContext = Array.isArray(contextOverride) ? contextOverride : getCurrentBroContext();
      const sources = sourcesOverride && typeof sourcesOverride === "object" ? sourcesOverride : aiSources;
      const contextualTags = {
        hasHistory: broContext.length > 0,
        contextCount: broContext.length,
      };
      // Formal analysis is server-owned. Clear the previous result while the
      // request is pending so an old relationship state cannot look current.
      setAnalysis(null);
      setRequestBudget(estimateProfileRequest({
        ...sources,
        currentMessage: msg,
        history: broContext,
        replyCount: 8,
      }));

      const replyPreferences = selectedTags.length
        ? selectedTags.map(key => AI_REPLY_PREFERENCE_MAP[key] || personalities[key]?.label || key)
        : ["自然聊天", "温柔关心", "轻松幽默", "成熟克制"];

      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/profile/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sources,
          currentMessage: msg,
          history: broContext,
          replyCount: 8,
          replyPreferences,
          consent: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI 分析失败");

      const projectedAnalysis = projectRuntimeAnalysis(payload);
      if (!projectedAnalysis) throw new Error("AI 分析结果缺少 Runtime 状态");
      projectedAnalysis._contextualTags = contextualTags;
      const aiReplies = (payload.replies || []).map((row, i) => {
        return {
          personality: `ai_${i}`,
          label: row.style || `GLM-5.3 回复 ${i + 1}`,
          emoji: "🤖",
          scenarioKey: projectedAnalysis.scenarioKey,
          scenario: "GLM-5.3 原创回复",
          intensity: projectedAnalysis.crossLine ? "warmup" : "daily",
          text: row.text,
          rationale: row.rationale,
          sendWhen: row.sendWhen,
          branches: row.branches,
          observationWindow: row.observationWindow,
          stopCondition: row.stopCondition,
          isAI: true,
        };
      });
      setAiProfile(payload);
      setAnalysis(projectedAnalysis);
      setResults(aiReplies);
      pushHistory(msg, ["ai_direct"], aiReplies, projectedAnalysis, {
        aiSources: sources,
        context: broContext,
        broNickname: nicknameOverride,
        broAddress: addressOverride,
      });
      appendBroSession(msg, projectedAnalysis, aiReplies[0]?.text || "", aiReplies, nicknameOverride, addressOverride);
      const nickname = nicknameOverride.trim();
      if (nickname) {
        setBrothers(prev => prev.map(b => b.nickname === nickname ? { ...b, aiProfile: payload } : b));
      }
    } catch (error) {
      if (aiPanelRef.current) aiPanelRef.current.open = true;
      // Do not retain a relationship state from a previous server response
      // when this generation fails.
      setAnalysis(null);
      setAiError(error.message || "AI 分析失败");
    } finally {
      setIsAiGenerating(false);
      setIsGenerating(false);
    }
  };

  const handleAiGenerate = () => runAiGeneration();

  const handleCopy = async (text, id) => {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const handleCopyAll = async () => {
    if (results.length === 0) return;
    const buf = results.map((r, i) =>
      `【${i+1}】${r.label}｜${r.scenario}\n${r.text}`
    ).join("\n\n");
    await handleCopy(buf, "all");
  };

  const handlePickExample = (ex) => {
    // 🧠 改成：只填入输入框，不自动生成（用户可以编辑后再生成）
    setMessage(ex.msg);
    if (textareaRef.current) textareaRef.current.value = ex.msg;
    setResults([]);
    setAnalysis(null);
    setRequestBudget(null);
    setActiveTab(TAB_RESULT);
  };

  // 🧠 点击结果卡片的模板文本 → 填入输入框作为"继续编辑"
  const handleUseTemplate = (text) => {
    setMessage(text);
    if (textareaRef.current) textareaRef.current.value = text;
    setActiveTab(TAB_RESULT);
    // 滚动到输入框
    if (textareaRef.current) {
      textareaRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      textareaRef.current.focus();
    }
  };

  const handleSaveBrother = () => {
    const msg = getMsg();
    if (!msg || results.length === 0) return;
    const nickname = broNickname.trim() || analysis?.suggestAddress || "哥";
    const existing = brothers.find(b => b.id === activeBroId) || brothers.find(b => b.nickname === nickname);
    const id = existing?.id || "bro_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const record = {
      id, ts: existing?.ts || Date.now(),
      nickname,
      brotherMessage: msg,
      address: broAddress,
      analysis,
      aiProfile: aiProfile || existing?.aiProfile || null,
      aiSources: { ...aiSources },
      memoryMeta: {
        source: aiProfile?.profile?.evidence?.map(item => item.source).filter(Boolean).slice(0, 8) || ["主播手动输入"],
        confidence: Number.isFinite(aiProfile?.profile?.confidence) ? aiProfile.profile.confidence : 0,
        savedAt: Date.now(),
      },
      replies: results.map(r => ({
        personality: r.personality, label: r.label, emoji: r.emoji,
        scenario: r.scenario, scenarioKey: r.scenarioKey,
        intensity: r.intensity, text: r.text, isCrossLineSafe: r.isCrossLineSafe,
      })),
    };
    setBrothers(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return [{ ...record, sessions: [] }, ...prev].slice(0, 200);
      return prev.map((b, i) => i === idx ? { ...b, ...record, sessions: b.sessions || [] } : b);
    });
    setActiveBroId(id);
    setBroDetailId(id);
    setActiveTab(TAB_BROS);
  };

  const handleExport = () => {
    const msg = getMsg();
    const text = exportBrotherRecord({
      brotherMessage: msg,
      nickname: broNickname,
      analysis,
      replies: results,
    });
    handleCopy(text, "export");
  };

  const handleClear = () => {
    setMessage("");
    setResults([]);
    setAnalysis(null);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.focus();
    }
  };

  const clearHistory = () => { setHistory([]); if (memoryEnabled) persistMemory("history", []); };
  const removeHistory = (id) => {
    setHistory(prev => { const next = prev.filter(item => item.id !== id); if (memoryEnabled) persistMemory("history", next); return next; });
  };
  const clearFav = () => { setFav([]); if (memoryEnabled) persistMemory("favorites", []); };
  const removeFav = (fid) => {
    setFav(prev => { const n = prev.filter(f => f.id !== fid); if (memoryEnabled) persistMemory("favorites", n); return n; });
  };
  const handleBroDelete = (bid) => {
    setBrothers(prev => { const n = prev.filter(b => b.id !== bid); if (memoryEnabled) persistMemory("brothers", n); return n; });
    if (broDetailId === bid) setBroDetailId(null);
    if (activeBroId === bid) {
      setActiveBroId(null);
      setAiProfile(null);
    }
  };
  const handleHistoryRegenerate = (record) => {
    setMessage(record.msg || "");
    if (textareaRef.current) textareaRef.current.value = record.msg || "";
    setBroNickname(record.broNickname || broNickname);
    setBroAddress(record.broAddress || broAddress);
    if (record.aiSources) setAiSources(record.aiSources);
    setResults([]);
    setAnalysis(record.analysis || null);
    setActiveTab(TAB_RESULT);
    runAiGeneration({
      messageOverride: record.msg || "",
      contextOverride: record.context || [],
      nicknameOverride: record.broNickname || broNickname,
      addressOverride: record.broAddress || broAddress,
      sourcesOverride: record.aiSources || aiSources,
    });
  };

  const handleBroRestore = (rec) => {
    setMessage(rec.brotherMessage || "");
    if (textareaRef.current) textareaRef.current.value = rec.brotherMessage || "";
    setBroNickname(rec.nickname || "");
    setBroAddress(rec.address || "");
    if (rec.aiSources) setAiSources(rec.aiSources);
    setResults([]);
    setAnalysis(rec.analysis || null);
    setBroDetailId(rec.id);
    setActiveTab(TAB_RESULT);
    runAiGeneration({
      messageOverride: rec.brotherMessage || "",
      contextOverride: Array.isArray(rec.sessions) ? rec.sessions.slice(0, 10).map((session) => ({ msg: session.msg, reply: session.reply, ts: session.ts })) : [],
      nicknameOverride: rec.nickname || "",
      addressOverride: rec.address || "",
      sourcesOverride: rec.aiSources || aiSources,
    });
  };
  const clearBrothers = () => {
    if (!confirm("确定清空所有大哥档案吗？")) return;
    setBrothers([]); if (memoryEnabled) persistMemory("brothers", []);
    setActiveBroId(null);
    setBroDetailId(null);
    setAiProfile(null);
  };

  const enableMemory = () => {
    try {
      writeMemoryState(localStorage, { version: 2, history, favorites: fav, brothers, preferences: { selectedTags, intensity, broNickname, broAddress, activeBroId } });
      localStorage.setItem("hh_memory_enabled", "true");
      setMemoryEnabled(true);
      setMemoryNotice("本地记忆已启用");
    } catch {
      setMemoryNotice("本机存储失败，本地记忆未启用");
    }
  };
  const disableMemory = () => {
    if (!confirm("暂停并清空本机记忆？当前页面内容不会自动发送，但历史、收藏和档案将从本机删除。")) return;
    let failed = false;
    ["hh_memory_enabled", "hh_memory_v2", "hh_history", "hh_fav", "hh_brothers", "hh_prefs"].forEach((key) => {
      try { localStorage.removeItem(key); } catch { failed = true; }
    });
    setMemoryEnabled(false);
    setHistory([]); setFav([]); setBrothers([]); setActiveBroId(null); setAiProfile(null);
    setMemoryNotice(failed ? "部分本机记忆未能清除" : "");
  };
  const exportMemory = () => {
    if (!memoryEnabled) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      history,
      favorites: fav,
      brothers,
      preferences: readMemoryState(localStorage).preferences,
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `huashu-local-memory-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMemoryNotice("已导出本地记忆文件");
    } catch (error) {
      setMemoryNotice("导出失败，数据仍保留在本机");
    }
  };
  const importMemory = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!memoryEnabled) {
      setMemoryNotice("请先启用本地记忆，再导入备份");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMemoryNotice("备份文件超过 2 MB，未导入");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.history) || !Array.isArray(parsed.favorites) || !Array.isArray(parsed.brothers)) {
        throw new Error("INVALID_BACKUP");
      }
      const importedHistory = parsed.history.filter(item => item && typeof item.msg === "string").slice(0, 20);
      const importedFav = parsed.favorites.filter(item => item && typeof item.text === "string").slice(0, 50);
      const importedBrothers = normalizeBrothers(parsed.brothers.filter(item => item && typeof item === "object")).slice(0, 200);
      const importedPrefs = parsed.preferences && typeof parsed.preferences === "object" ? {
        selectedTags: Array.isArray(parsed.preferences.selectedTags) ? parsed.preferences.selectedTags.slice(0, 8) : [],
        intensity: typeof parsed.preferences.intensity === "string" ? parsed.preferences.intensity : "auto",
        broNickname: typeof parsed.preferences.broNickname === "string" ? parsed.preferences.broNickname.slice(0, 16) : "",
        broAddress: typeof parsed.preferences.broAddress === "string" ? parsed.preferences.broAddress.slice(0, 12) : "",
        activeBroId: typeof parsed.preferences.activeBroId === "string" ? parsed.preferences.activeBroId : null,
      } : {};
      try {
        writeMemoryState(localStorage, {
          version: 2,
          history: importedHistory,
          favorites: importedFav,
          brothers: importedBrothers,
          preferences: importedPrefs,
        });
      } catch {
        throw new Error("WRITE_FAILED");
      }
      setHistory(importedHistory); setFav(importedFav); setBrothers(importedBrothers);
      if (importedPrefs.selectedTags) setSelectedTags(importedPrefs.selectedTags);
      if (importedPrefs.intensity) setIntensity(importedPrefs.intensity);
      if (importedPrefs.broNickname !== undefined) setBroNickname(importedPrefs.broNickname);
      if (importedPrefs.broAddress !== undefined) setBroAddress(importedPrefs.broAddress);
      if (importedPrefs.activeBroId) setActiveBroId(importedPrefs.activeBroId);
      setMemoryNotice(`已导入 ${importedHistory.length} 条历史、${importedBrothers.length} 个档案`);
    } catch (error) {
      setMemoryNotice(error?.message === "WRITE_FAILED" ? "本机存储失败，备份未导入" : "备份格式无法识别，未导入任何数据");
    }
  };

  const charCount = message.length;

  return (
    <div className={`container ${docked ? "docked" : ""}`}>
      <Head>
        <title>大哥维护话术神器 - 私聊高情商回复生成器</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <header className="header">
        <div className="logo">
          <div className="logo-icon">💠</div>
          <span className="logo-text">大哥维护神器</span>
        </div>
      </header>

      <div className="sys-status">
        <span className="sys-dot" />
        <span className="sys-text">ONLINE</span>
        <span className="sys-sep hide-sm">|</span>
        <span className="sys-info hide-sm">🧠 {brothers.length} 大哥</span>
        <span className="sys-sep hide-sm">|</span>
        <span className="sys-info hide-xs">模板 {stats.templates.toLocaleString()}</span>
        <span className="sys-sep hide-xs">|</span>
        <span className="sys-info hide-xs">模板质量 {stats.qualityCoverage}%</span>
        <span className="sys-sep hide-sm">|</span>
        <span className={`sys-info zhipu-health ${zhipuHealth?.status === "configured" ? "ready" : "needs-config"}`} title={zhipuHealth?.baseUrl || "等待服务端状态"}>
          智谱 {zhipuHealth?.status === "configured" ? "已读取配置" : zhipuHealth?.status === "unreachable" ? "不可达" : "待配置"}
        </span>
        <span className="sys-sep">|</span>
        <span className="sys-time">{now || "--:--"}</span>
      </div>

      <section className="api-settings api-settings-readonly" aria-label="智谱 AI 服务状态">
        <div className="api-settings-status-row">
          <div>
            <strong>⚙️ 智谱 AI 服务</strong>
            <span>{zhipuHealth?.status === "configured" ? "服务端已读取配置，AI 功能可继续使用" : zhipuHealth?.status === "unreachable" ? "暂时无法读取服务状态" : "尚未配置服务端 AI Key"}</span>
          </div>
          <button type="button" className="secondary-btn" onClick={refreshZhipuHealth} disabled={apiHealthRefreshing}>
            {apiHealthRefreshing ? "检查中…" : "重新检查"}
          </button>
        </div>
        <div className="api-settings-grid">
          <div><span>服务商</span><strong>智谱 AI</strong></div>
          <div><span>模型</span><strong>{zhipuHealth?.model || "glm-5.3"}</strong></div>
          <div><span>接口地址</span><strong>{zhipuHealth?.baseUrl || "https://open.bigmodel.cn/api/paas/v4"}</strong></div>
        </div>
        <p className="api-settings-note">API 配置由超级管理员统一维护。主播和运营无需填写 Key；如需修改，请进入后台的“服务配置”。</p>
        {apiHealthError && <p className="api-settings-error">{apiHealthError}</p>}
      </section>

      <div className="hero">
        <h1>私聊维护话术生成器</h1>
        <p className="hero-sub">AI记忆 · 每个大哥独立聊天框 · GLM-5.3 多元原创回复</p>
      </div>

      {/* 🧠 大哥选择器（独立会话入口） */}
      <div className="bro-switcher">
        <div className="bro-switcher-label">🎯 当前大哥</div>
        <div className="bro-switcher-list">
          {activeBroId && (() => {
            const activeBro = brothers.find(b => b.id === activeBroId);
            if (!activeBro) return null;
            return (
              <button className="bro-chip active" onClick={() => setShowSession(!showSession)}>
                <span className="bro-chip-avatar">{(activeBro.nickname || "哥").slice(0, 1)}</span>
                <span className="bro-chip-name">{activeBro.nickname || "未命名"}</span>
                <span className="bro-chip-count">{(activeBro.sessions || []).length} 轮</span>
                <span className="bro-chip-expand">{showSession ? "▼" : "▶"}</span>
              </button>
            );
          })()}
          {brothers.filter(b => b.id !== activeBroId).slice(0, 6).map(b => (
            <button key={b.id} className="bro-chip" onClick={() => selectBrother(b.id)}>
              <span className="bro-chip-avatar">{(b.nickname || "哥").slice(0, 1)}</span>
              <span className="bro-chip-name">{b.nickname || "未命名"}</span>
              <span className="bro-chip-count">{(b.sessions || []).length}</span>
            </button>
          ))}
          <button className="bro-chip new" onClick={createNewBrother}>
            <span className="bro-chip-avatar">＋</span>
            <span className="bro-chip-name">新大哥</span>
          </button>
        </div>
      </div>

      {/* 🧠 当前大哥的会话历史面板 */}
      {showSession && activeBroId && (() => {
        const bro = brothers.find(b => b.id === activeBroId);
        if (!bro || !bro.sessions || bro.sessions.length === 0) {
          return (
            <div className="session-panel">
              <div className="session-empty">📭 还没有和这个大哥的对话记录，去生成一条吧~</div>
            </div>
          );
        }
        return (
          <div className="session-panel">
            <div className="session-header">
              <span>💬 {bro.nickname} 的会话历史 · {bro.sessions.length} 条</span>
              <button className="link-btn" onClick={() => setShowSession(false)}>收起</button>
            </div>
            <div className="session-list">
              {bro.sessions.slice(0, 20).map(s => (
                <div key={s.id} className="session-item">
                  <div className="session-msg">
                    <span className="session-from">大哥:</span> {s.msg}
                  </div>
                  <div className="session-reply">
                    <span className="session-to">回复:</span> {s.reply?.slice(0, 80)}{s.reply?.length > 80 ? "…" : ""}
                  </div>
                  <div className="session-meta">
                    <span>{s.scenario}</span>
                    <span>·</span>
                    <span>{new Date(s.ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 输入框 */}
      <div className="input-card">
        <textarea
          ref={textareaRef}
          defaultValue=""
          maxLength={800}
          placeholder={"把大哥发来的消息粘到这里...\n\n例如：\n在吗 想你了\n刚给你刷了520 想你了\n能借我3万块吗\n今天被老板骂了 好累\n点歌 唱一首给我听"}
          onInput={(e) => { setMessage(e.target.value); setRequestBudget(null); }}
          onCompositionEnd={(e) => { setMessage(e.target.value); setRequestBudget(null); }}
          onBlur={(e) => { setMessage(e.target.value); setRequestBudget(null); }}
        />
        <div className="input-meta">
          <button className="clear-btn" onClick={handleClear} disabled={!message}>✕ 清空</button>
          <div className={"char-counter " + (charCount >= 700 ? "warn" : "")}>{charCount} / 800</div>
        </div>
      </div>

      {/* 快捷示例 */}
      <div className="section-label secondary">💡 点一下直接生成</div>
      <div className="quick-chips">
        {ALL_EXAMPLES.map(ex => (
          <button key={ex.msg} className="quick-chip" onClick={() => handlePickExample(ex)} title={ex.msg}>
            <span className="quick-chip-hint">{ex.hint}</span>
            <span className="quick-chip-text">{ex.msg}</span>
          </button>
        ))}
      </div>

      {/* 风格偏好（可选） */}
      <div className="section-label">
        🎭 AI 回复风格偏好（可选，不选则由 GLM-5.3 自动生成多元风格）
        {selectedTags.length > 0 && <span className="badge-soft">已选 {selectedTags.length}</span>}
      </div>
      <div className="tags">
        {AI_REPLY_PREFERENCES.map(({ key, label, emoji }) => (
          <button
            key={key}
            className={`tag ${selectedTags.includes(key) ? "active" : ""}`}
            onClick={() => toggleTag(key)}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* 高级选项（折叠） */}
      <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? "▼ 高级设置" : "▶ 高级设置（称呼 / 浓度）"}
      </button>
      {showAdvanced && (
        <div className="advanced-panel">
          <div className="memory-consent-box">
            <div className="memory-consent-head">
              <strong>本地记忆</strong>
              <span className={memoryEnabled ? "memory-status enabled" : "memory-status"}>{memoryEnabled ? "已启用" : "未启用"}</span>
            </div>
            <p>只保存在本机浏览器，用于历史、收藏和大哥档案；不会自动上传到智谱。可随时暂停并清空。</p>
            {memoryEnabled ? (
              <div className="memory-actions">
                <button className="bulk-btn" onClick={exportMemory}>导出本地记忆</button>
                <button className="bulk-btn" onClick={() => memoryFileRef.current?.click()}>导入本地记忆</button>
                <button className="link-btn danger" onClick={disableMemory}>暂停并清空</button>
                <input ref={memoryFileRef} type="file" accept="application/json,.json" onChange={importMemory} hidden />
              </div>
            ) : (
              <button className="bulk-btn" onClick={enableMemory}>启用本地记忆</button>
            )}
            {memoryEnabled && <div className="memory-count">{history.length} 条历史 · {fav.length} 条收藏 · {brothers.length} 个档案</div>}
            {memoryNotice && <div className="memory-notice">{memoryNotice}</div>}
          </div>
          <label className="bro-meta-item">
            <span>怎么称呼他</span>
            <input
              type="text"
              maxLength={12}
              placeholder="哥 / 宝~ / 老板 / X总 / 兄弟 / 老铁 ..."
              value={broAddress}
              onChange={(e) => setBroAddress(e.target.value)}
            />
          </label>
          <label className="bro-meta-item">
            <span>备注名</span>
            <input type="text" maxLength={16} placeholder="大哥昵称" value={broNickname} onChange={(e) => setBroNickname(e.target.value)} />
          </label>
          <div className="intensity-row">
            <span>话术浓度</span>
            <div className="segmented compact">
              <button className={`seg-item ${intensity === "auto" ? "active" : ""}`} onClick={() => setIntensity("auto")}>自动</button>
              {INTENSITY_LEVELS.map(l => (
                <button key={l.key} className={`seg-item ${intensity === l.key ? "active" : ""}`} onClick={() => setIntensity(l.key)}>
                  {l.emoji} {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <details ref={aiPanelRef} className="ai-source-panel">
        <summary>🤖 智谱 GLM-5.3 原创回复·画像素材</summary>
        <div className="ai-source-body">
          <p className="privacy-note">
            仅粘贴你有权使用的公开或已授权文本。原创回复遵循“真诚、有分寸、具体关心、尊重边界”，不使用欲擒故纵、唯一感、情感依赖或诱导送礼。
          </p>
          <label className="bro-meta-item">
            <span>抖音账号备注（可选）</span>
            <input value={aiSources.account} maxLength={80} placeholder="昵称 / 抖音号，不要填手机号" onChange={(e) => setAiSources(p => ({ ...p, account: e.target.value }))} />
          </label>
          <div className="ai-source-grid">
            <label>
              <span>近期作品文案</span>
              <textarea value={aiSources.works} maxLength={6000} placeholder="每条一行，可带发布时间" onChange={(e) => setAiSources(p => ({ ...p, works: e.target.value }))} />
            </label>
            <label>
              <span>近期评论</span>
              <textarea value={aiSources.comments} maxLength={6000} placeholder="粘贴他本人发布的评论" onChange={(e) => setAiSources(p => ({ ...p, comments: e.target.value }))} />
            </label>
            <label>
              <span>公开发言 / 聊天片段</span>
              <textarea value={aiSources.statements} maxLength={6000} placeholder="粘贴发言，请先删除手机号、地址等信息" onChange={(e) => setAiSources(p => ({ ...p, statements: e.target.value }))} />
            </label>
          </div>
          <label className="consent-row">
            <input type="checkbox" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />
            <span>我确认有权使用输入和可选素材，并同意将关系状态与授权素材发送给智谱 GLM-5.3 进行画像分析和原创回复生成。</span>
          </label>
          {aiError && <div className="ai-error">{aiError}</div>}
          {requestBudget && (
            <div className={`request-budget ${requestBudget.sizeBand === "large" ? "large" : ""}`}>
              <strong>本次请求估算：</strong>{requestBudget.replyCount} 条原创回复 · {requestBudget.sourceChars} 字素材 · 约 {requestBudget.approxInputTokens} Tokens
              <span>仅按本地 JSON 长度估算，不代表智谱最终计费</span>
            </div>
          )}
          <button className="ai-generate-btn" onClick={handleAiGenerate} disabled={isGenerating || isAiGenerating}>
            {isAiGenerating ? "🧠 GLM-5.3 正在原创生成…" : "🤖 用 GLM-5.3 生成多元回复"}
          </button>
        </div>
      </details>

      {/* 生成按钮 */}
      <button
        className={"generate-btn " + (docked ? "only-desktop" : "")}
        onClick={() => handleGenerate()}
        disabled={isGenerating}
      >
        {isGenerating ? "🧠 GLM-5.3 正在原创生成..." : "✨ GLM-5.3 原创多元回复"}
      </button>

      {/* Tabs */}
      <div className="tabs">
        <button className={"tab " + (activeTab === TAB_RESULT ? "active" : "")} onClick={() => setActiveTab(TAB_RESULT)}>
          🎯 结果 <span className="tab-count">{results.length}</span>
        </button>
        <button className={"tab " + (activeTab === TAB_HISTORY ? "active" : "")} onClick={() => setActiveTab(TAB_HISTORY)}>
          🕘 历史 <span className="tab-count">{history.length}</span>
        </button>
        <button className={"tab " + (activeTab === TAB_FAV ? "active" : "")} onClick={() => setActiveTab(TAB_FAV)}>
          ⭐ 收藏 <span className="tab-count">{fav.length}</span>
        </button>
        <button className={"tab " + (activeTab === TAB_BROS ? "active" : "")} onClick={() => setActiveTab(TAB_BROS)}>
          📂 大哥档案 <span className="tab-count">{brothers.length}</span>
        </button>
      </div>

      {/* 结果区 */}
      {activeTab === TAB_RESULT && (
        <div className="results">
          {isGenerating && (
            <div className="skeleton-row">
              {[0,1,2,3].map(i => (
                <div key={i} className="result-card skeleton">
                  <div className="sk sk-head" /><div className="sk sk-line w-80" />
                  <div className="sk sk-line w-100" /><div className="sk sk-line w-60" />
                </div>
              ))}
            </div>
          )}

          {!isGenerating && analysis && (
            <div className={"analysis-card " + (analysis.crossLine ? "danger" : analysis.toneLevel >= 2 ? "hot" : analysis.toneLevel <= -1 ? "cold" : "")}>
              <div className="analysis-title">
                <span className="analysis-icon">🧠</span>
                <span>原话深度识别</span>
                {analysis.crossLine && <span className="analysis-alert">⚠️ 越界预警</span>}
              </div>

              {/* 意图总结 */}
              {analysis.intent && (
                <div className="analysis-intent">
                  <span className="intent-label">意图</span>
                  <span className="intent-text">{analysis.intent}</span>
                </div>
              )}

              {/* 核心维度 */}
              <div className="analysis-grid">
                <div><span className="k">场景</span><span className="v">{analysis.scenarioLabel}</span></div>
                <div><span className="k">画像</span><span className="v">{analysis.brotherType}</span></div>
                <div><span className="k">浓度</span><span className="v">{INTENSITY_LEVELS.find(l=>l.key===analysis.suggestIntensity)?.label || analysis.suggestIntensity}</span></div>
                {analysis.crossLine && <div><span className="k">越界</span><span className="v danger-text">{analysis.crossLineType}</span></div>}
                {analysis.dialect && analysis.dialect.dialect !== "mandarin" && (
                  <div><span className="k">方言</span><span className="v">{analysis.dialect.emoji} {analysis.dialect.label}</span></div>
                )}
              </div>

              {/* 🆕 高级维度 */}
              <div className="analysis-metrics">
                <div className="metric-item">
                  <span className="metric-label">情绪强度</span>
                  <div className="metric-bar">
                    <div className="metric-fill" style={{width: `${analysis.emotionIntensity}%`, background: analysis.emotionIntensity >= 70 ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "linear-gradient(90deg,#a855f7,#ec4899)"}} />
                    <span className="metric-value">{analysis.emotionIntensity}</span>
                  </div>
                </div>
                <div className="metric-item">
                  <span className="metric-label">风险评分</span>
                  <div className="metric-bar">
                    <div className="metric-fill" style={{width: `${analysis.riskScore}%`, background: analysis.riskScore >= 70 ? "linear-gradient(90deg,#ef4444,#dc2626)" : analysis.riskScore >= 40 ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "linear-gradient(90deg,#10b981,#059669)"}} />
                    <span className="metric-value">{analysis.riskScore}</span>
                  </div>
                </div>
              </div>

              {/* 阶段 / 难度 / 上下文 */}
              <div className="analysis-tags-row">
                <div className={`tag-pill stage-${analysis.interactStage}`}>
                  <span className="tag-icon">🎯</span>
                  <span className="tag-name">互动阶段</span>
                  <span className="tag-value">{analysis.interactStage}</span>
                </div>
                <div className={`tag-pill diff-${analysis.replyDifficulty === '高危' ? 'danger' : analysis.replyDifficulty === '困难' ? 'hard' : analysis.replyDifficulty === '简单' ? 'easy' : 'mid'}`}>
                  <span className="tag-icon">⚡</span>
                  <span className="tag-name">回复难度</span>
                  <span className="tag-value">{analysis.replyDifficulty}</span>
                </div>
                {/* 🧠 上下文记忆徽章 */}
                {analysis._contextualTags?.hasHistory && (
                  <div className="tag-pill memory-tag">
                    <span className="tag-icon">🧠</span>
                    <span className="tag-name">记忆</span>
                    <span className="tag-value">{analysis._contextualTags.contextCount} 轮</span>
                  </div>
                )}
                {analysis._relationshipState?.primaryGoal && (
                  <div className="tag-pill memory-tag">
                    <span className="tag-icon">🧭</span>
                    <span className="tag-name">本轮目标</span>
                    <span className="tag-value">{analysis._relationshipState.primaryGoal}</span>
                  </div>
                )}
                {analysis._relationshipState?.familiarity && (
                  <div className="tag-pill memory-tag">
                    <span className="tag-icon">🤝</span>
                    <span className="tag-name">熟悉度</span>
                    <span className="tag-value">{analysis._relationshipState.familiarity}</span>
                  </div>
                )}
                {analysis._relationshipState?.algorithmCore?.name && (
                  <div className="tag-pill memory-tag" title={analysis._relationshipState.algorithmCore.revision}>
                    <span className="tag-icon">🧩</span>
                    <span className="tag-name">核心算法</span>
                    <span className="tag-value">goutoujunshi</span>
                  </div>
                )}
              </div>

              {analysis.crossLine && (
                <div className="analysis-alert-box">
                  🚨 当前消息存在边界风险，GLM-5.3 将优先生成清晰、克制的回复
                </div>
              )}
              {analysis.replyHints && analysis.replyHints.length > 0 && (
                <ul className="analysis-hints">
                  {analysis.replyHints.slice(0, 4).map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              )}
              <div className="analysis-actions">
                <button className="bulk-btn" onClick={handleSaveBrother} disabled={results.length === 0}>💾 存档案</button>
                <button className="bulk-btn primary" onClick={handleExport} disabled={results.length === 0}>📤 复制全部</button>
              </div>
            </div>
          )}

          {!isAiGenerating && aiProfile?.profile && (
            <div className="ai-profile-card">
              <div className="analysis-title"><span>🤖</span><span>AI 沟通画像</span><span className="confidence-badge">信心 {aiProfile.profile.confidence}%</span></div>
              <p>{aiProfile.profile.summary}</p>
              <div className="profile-chip-row">
                {(aiProfile.profile.interests || []).map(item => <span key={item} className="memory-chip">#{item}</span>)}
              </div>
              <div className="profile-detail"><strong>沟通风格：</strong>{aiProfile.profile.communicationStyle}</div>
              <div className="profile-detail"><strong>建议话题：</strong>{(aiProfile.profile.preferredTopics || []).join("、") || "—"}</div>
              <div className="profile-detail"><strong>避免话题：</strong>{(aiProfile.profile.avoidTopics || []).join("、") || "—"}</div>
              {aiProfile.algorithmCore?.name && (
                <div className="profile-detail"><strong>核心算法：</strong>goutoujunshi · {String(aiProfile.algorithmCore.revision || "").slice(0, 7)}</div>
              )}
              {aiProfile.knowledgeTopics?.length > 0 && (
                <div className="profile-detail"><strong>本轮边界：</strong>{aiProfile.knowledgeTopics.map(topic => ({ gift: "礼物与金钱", distress: "负面情绪", invitation: "邀约", conflict: "冲突", privacy: "隐私与越界" }[topic] || topic)).join("、")}</div>
              )}
              <div className="profile-strategy">
                {(aiProfile.strategy?.approach || []).map((item, i) => <div key={i}>• {item}</div>)}
              </div>
              {aiProfile.riskNotice && <div className="privacy-note">{aiProfile.riskNotice}</div>}
            </div>
          )}

          {!isGenerating && results.length === 0 && !message.trim() && (
            <div className="empty-state"><div>💡 粘贴大哥消息，点生成按钮</div></div>
          )}
          {!isGenerating && results.length === 0 && message.trim() && (
            <div className="empty-state"><div>👆 点生成按钮</div></div>
          )}

          {!isGenerating && results.length > 0 && (
            <div className="bulk-actions">
              <button className="bulk-btn primary" onClick={handleCopyAll}>📋 一键复制全部（{results.length}条）</button>
            </div>
          )}

          {/* 回复卡片 */}
          <div className="bro-grid">
            {results.map((r, i) => (
              <div key={r.personality || i} className={"result-card bro-card " + (r.isCrossLineSafe === false ? "warn-card" : r.isCrossLineSafe && analysis?.crossLine ? "safe" : "")}>
                <div className="result-header">
                  <div className="result-personality">
                    {r.isCrossLineSafe === false && <span className="safe-flag warn">⚠️ 慎用</span>}
                    {r.isCrossLineSafe && analysis?.crossLine && <span className="safe-flag ok">✅ 推荐</span>}
                    <span className="personality-dot" />
                    {r.emoji} {r.label}
                  </div>
                  <div className="result-actions">
                    <button className="fav-btn" onClick={() => toggleFav(r)} title="收藏">
                      {favContains(r) ? "⭐" : "☆"}
                    </button>
                    <button
                      className={`copy-btn ${copiedId === "r"+i ? "copied" : ""}`}
                      onClick={() => handleCopy(r.text, "r"+i)}
                    >{copiedId === "r"+i ? "✓" : "📋"}</button>
                  </div>
                </div>
                <div className="scenario-row-card">
                  <span className="scenario-badge">{r.scenario}</span>
                  <span className={"intensity-badge i-" + r.intensity}>
                    {INTENSITY_LEVELS.find(l => l.key === r.intensity)?.label || r.intensity}
                  </span>
                  {r.stance && (
                    <span className={`stance-badge stance-${r.stance}`} title="主播内心想法：对大哥请求的立场">
                      {r.stanceLabel}
                    </span>
                  )}
                </div>
                <div className="result-text" onPointerDown={() => handleUseTemplate(r.text)} title="点击将此模板填入输入框继续编辑">{r.text}</div>
                {r.rationale && <div className="ai-rationale">生成依据：{r.rationale}</div>}
                {(r.sendWhen || r.branches || r.stopCondition) && (
                  <details className="reply-followup">
                    <summary>后续怎么接</summary>
                    <div className="reply-followup-body">
                      {r.sendWhen && <div><strong>适合发送：</strong>{r.sendWhen}</div>}
                      {r.branches?.positive && <div><strong>对方接住：</strong>{r.branches.positive}</div>}
                      {r.branches?.ambiguous && <div><strong>对方含糊：</strong>{r.branches.ambiguous}</div>}
                      {r.branches?.refusal && <div><strong>对方拒绝：</strong>{r.branches.refusal}</div>}
                      {r.observationWindow && <div><strong>观察窗口：</strong>{r.observationWindow}</div>}
                      {r.stopCondition && <div className="stop-condition"><strong>停止条件：</strong>{r.stopCondition}</div>}
                    </div>
                  </details>
                )}
                <div className="result-hint" onPointerDown={() => handleUseTemplate(r.text)}>👆 点击模板可填入输入框继续编辑</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 历史区 */}
      {activeTab === TAB_HISTORY && (
        <div className="panel">
          {history.length > 0 && (
            <div className="panel-actions">
              <span className="panel-hint">最近 {history.length} 条</span>
              <button className="link-btn danger" onClick={clearHistory}>清空</button>
            </div>
          )}
          {history.length === 0 && <div className="empty-state"><div>🕘 还没有记录</div></div>}
          {history.map(h => (
            <details key={h.id} className="hist-item" open={history.indexOf(h) === 0}>
              <summary>
                <div className="hist-msg">{h.msg}</div>
                <button className="link-btn danger hist-delete" onClick={(event) => { event.preventDefault(); removeHistory(h.id); }}>删除</button>
                <div className="hist-meta">
                  {new Date(h.ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  <span className="sep">·</span>{h.items.length} 条
                </div>
              </summary>
              <div className="hist-body">
                {h.items.map((it, ii) => (
                  <div className="result-card" key={ii}>
                    <div className="result-header">
                      <div className="result-personality">
                        <span className="personality-dot" />{it.emoji} {it.label}
                      </div>
                      <div className="result-actions">
                        <button className="fav-btn" onClick={() => toggleFav({ ...it, sourceMsg: h.msg })}>
                          {favContains(it) ? "⭐" : "☆"}
                        </button>
                        <button className={`copy-btn ${copiedId === "h"+ii ? "copied" : ""}`}
                          onClick={() => handleCopy(it.text, "h"+ii)}>
                          {copiedId === "h"+ii ? "✓" : "📋"}
                        </button>
                      </div>
                    </div>
                    <span className="scenario-badge">{it.scenario}</span>
                    <div className="result-text">{it.text}</div>
                  </div>
                ))}
                <button className="regen-btn" onClick={() => handleHistoryRegenerate(h)}>🔁 AI 重新生成</button>
              </div>
            </details>
          ))}
        </div>
      )}

      {/* 收藏区 */}
      {activeTab === TAB_FAV && (
        <div className="panel">
          {fav.length > 0 && (
            <div className="panel-actions">
              <span className="panel-hint">{fav.length} 条收藏</span>
              <button className="link-btn danger" onClick={clearFav}>清空</button>
            </div>
          )}
          {fav.length === 0 && <div className="empty-state"><div>⭐ 点卡片 ☆ 收藏</div></div>}
          {fav.map(f => (
            <div key={f.id} className="result-card fav-card">
              <div className="result-header">
                <div className="result-personality"><span className="personality-dot" />{f.emoji} {f.label}</div>
                <div className="result-actions">
                  <button className="link-btn danger" onClick={() => removeFav(f.id)}>移除</button>
                  <button className={`copy-btn ${copiedId === "f"+f.id ? "copied" : ""}`}
                    onClick={() => handleCopy(f.text, "f"+f.id)}>
                    {copiedId === "f"+f.id ? "✓" : "📋"}
                  </button>
                </div>
              </div>
              {f.sourceMsg && <div className="fav-source">← {f.sourceMsg}</div>}
              <span className="scenario-badge">{f.scenario}</span>
              <div className="result-text">{f.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* 大哥档案 */}
      {activeTab === TAB_BROS && (
        <div className="panel bros-panel">
          {brothers.length > 0 && (
            <div className="panel-actions">
              <span className="panel-hint">{brothers.length}/200 条档案</span>
              <button className="link-btn danger" onClick={clearBrothers}>清空</button>
            </div>
          )}
          {brothers.length === 0 && <div className="empty-state"><div>📂 生成回复后点「💾 存档案」</div></div>}
          <div className="bros-list">
            {brothers.map(b => (
              <div key={b.id} className={"bro-row " + (broDetailId === b.id ? "open" : "")}>
                <div className="bro-row-head" onClick={() => setBroDetailId(broDetailId === b.id ? null : b.id)}>
                  <div className="bro-avatar">{(b.nickname || "哥").slice(0,1)}</div>
                  <div className="bro-main">
                    <div className="bro-name-row">
                      <span className="bro-nickname">{b.nickname || "未命名"}</span>
                      <span className="bro-type">{b.analysis?.brotherType || "—"}</span>
                      {b.analysis?.crossLine && <span className="bro-alert">⚠️</span>}
                    </div>
                    <div className="bro-quote">「{b.brotherMessage?.slice(0, 50)}{b.brotherMessage?.length > 50 ? "…" : ""}」</div>
                  </div>
                  <div className="bro-caret">{broDetailId === b.id ? "▲" : "▼"}</div>
                </div>
                {broDetailId === b.id && (
                  <div className="bro-detail">
                    {/* 🧠 记忆统计 */}
                    {(b.interactionCount > 1 || b.scenarioStats) && (
                      <div className="bro-memory-section">
                        <div className="bro-memory-title">🧠 互动记忆</div>
                        <div className="bro-memory-row">
                          {b.interactionCount && <span className="memory-chip">累计 {b.interactionCount} 次互动</span>}
                          {(b.bestStyles || b.bestPersonalities)?.length > 0 && (
                            <span className="memory-chip">🎯 常用风格: {(b.bestStyles || b.bestPersonalities).join("·")}</span>
                          )}
                        </div>
                        {b.scenarioStats && Object.keys(b.scenarioStats).length > 0 && (
                          <div className="bro-memory-row">
                            <span className="memory-label">场景偏好:</span>
                            {Object.entries(b.scenarioStats).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k,v]) => (
                              <span key={k} className="memory-stat">{k}×{v}</span>
                            ))}
                          </div>
                        )}
                        {b.typeStats && Object.keys(b.typeStats).length > 0 && (
                          <div className="bro-memory-row">
                            <span className="memory-label">大哥画像:</span>
                            {Object.entries(b.typeStats).sort((a,b) => b[1]-a[1]).slice(0,3).map(([k,v]) => (
                              <span key={k} className="memory-stat">{k}×{v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {b.memoryMeta && (
                      <div className="memory-source-note">
                        <strong>记忆来源：</strong>{(b.memoryMeta.source || []).join("、") || "主播手动输入"}
                        <span> · 信心 {b.memoryMeta.confidence ?? 0}%</span>
                      </div>
                    )}
                    <div className="bro-detail-actions">
                      <button className="regen-btn" onClick={() => handleBroRestore(b)}>🔁 重调</button>
                      <button className="copy-btn" onClick={() => handleCopy(exportBrotherRecord(b), "bro_ex_"+b.id)}>📤 复制</button>
                      <button className="link-btn danger" onClick={() => handleBroDelete(b.id)}>🗑 删除</button>
                    </div>
                    <div className="bro-grid">
                      {(b.replies || []).map((r, i) => (
                        <div key={r.personality || i} className={"result-card bro-card " + (r.isCrossLineSafe === false ? "warn-card" : "")}>
                          <div className="result-header">
                            <div className="result-personality"><span className="personality-dot" />{r.emoji} {r.label}</div>
                            <div className="result-actions">
                              <button className="fav-btn" onClick={() => toggleFav({ ...r, sourceMsg: b.brotherMessage })}>
                                {favContains({label:r.label, text:r.text}) ? "⭐" : "☆"}
                              </button>
                              <button className={`copy-btn ${copiedId === "br"+b.id+i ? "copied" : ""}`}
                                onClick={() => handleCopy(r.text, "br"+b.id+i)}>
                                {copiedId === "br"+b.id+i ? "✓" : "📋"}
                              </button>
                            </div>
                          </div>
                          <span className="scenario-badge">{r.scenario}</span>
                          <div className="result-text">{r.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 移动端吸底按钮 */}
      {docked && (
        <div className="docked-bar">
          <button className="generate-btn docked" onClick={() => handleGenerate()} disabled={isGenerating}>
            {isGenerating ? "AI 原创生成中..." : "✨ AI 原创多元回复"}
          </button>
        </div>
      )}

      <footer className="footer">
        <div className="footer-line">大哥维护神器 · NEURAL REPLY ENGINE v2.3 · 每个大哥独立聊天框 · AI 记忆隔离</div>
        <div className="footer-stats">
          {stats.templates.toLocaleString()} 历史素材 · {stats.highQualityTemplates.toLocaleString()} 高质 · {stats.scenarios} 场景 · GLM-5.3 多元回复 · {stats.combinationRules} 规则 · 8 方言
        </div>
      </footer>
    </div>
  );
}
