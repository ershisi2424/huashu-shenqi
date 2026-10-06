import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import styles from "./auth.module.css";

export default function LoginWorkspace() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [operators, setOperators] = useState([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    if (nextMode !== "anchorRegister") setOperatorId("");
  };

  useEffect(() => {
    if (mode !== "anchorRegister") return undefined;
    let cancelled = false;
    setOperatorsLoading(true);
    setError("");
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/operators/`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "运营列表加载失败");
        if (!cancelled) {
          setOperators(Array.isArray(payload.items) ? payload.items : []);
          setOperatorId((current) => current || payload.items?.[0]?.id || "");
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught?.message || "运营列表加载失败");
      })
      .finally(() => {
        if (!cancelled) setOperatorsLoading(false);
      });
    return () => { cancelled = true; };
  }, [mode]);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const isGuest = mode === "guest";
      const endpoint = isGuest ? "/api/auth/guest-login/" : mode === "login" ? "/api/auth/login/" : "/api/auth/register/";
      const isAnchorRegistration = mode === "anchorRegister";
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isGuest ? { phone } : mode === "login" ? { phone, password } : {
          role: isAnchorRegistration ? "anchor" : "operator",
          operatorId: isAnchorRegistration ? operatorId : undefined,
          phone,
          name,
          password,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "请求失败");
      if (isGuest) {
        const returnTo = typeof router.query.returnTo === "string" && router.query.returnTo.startsWith("/") && !router.query.returnTo.startsWith("//")
          ? router.query.returnTo
          : "/chat";
        await router.push(returnTo);
      } else if (mode !== "login") {
        setNotice(isAnchorRegistration ? "主播申请已提交，请等待所选运营审批；审批通过后再登录" : "运营注册已提交，等待超级管理员审批；审批通过后再登录");
        setMode("login");
        setPassword("");
        setOperatorId("");
      } else {
        const returnTo = typeof router.query.returnTo === "string" && router.query.returnTo.startsWith("/") && !router.query.returnTo.startsWith("//")
          ? router.query.returnTo
          : "/chat";
        await router.push(returnTo);
      }
    } catch (caught) {
      setError(caught?.message || "请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-label="账号登录">
        <div className={styles.eyebrow}>主播维护工作台</div>
        <h1>{mode === "login" ? "登录工作台" : mode === "guest" ? "游客临时工作台" : mode === "anchorRegister" ? "主播注册" : "运营注册"}</h1>
        <p className={styles.subtitle}>{mode === "login" ? "登录后进入聊天、画像和维护记录" : mode === "guest" ? "仅输入手机号即可临时使用 AI 回复；退出后临时数据会在 24 小时无人使用后清理" : mode === "anchorRegister" ? "选择所属运营后提交申请，由对方审批开通" : "运营注册后由超级管理员审批，审批通过才能登录"}</p>
        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? styles.activeTab : ""} onClick={() => switchMode("login")}>登录</button>
          <button type="button" role="tab" aria-selected={mode === "guest"} className={mode === "guest" ? styles.activeTab : ""} onClick={() => switchMode("guest")}>游客试用</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? styles.activeTab : ""} onClick={() => switchMode("register")}>运营注册</button>
          <button type="button" role="tab" aria-selected={mode === "anchorRegister"} className={mode === "anchorRegister" ? styles.activeTab : ""} onClick={() => switchMode("anchorRegister")}>主播注册</button>
        </div>
        {notice && <div className={styles.notice}>{notice}</div>}
        {error && <div className={styles.error}>{error}</div>}
        <form onSubmit={submit} className={styles.form}>
          {mode !== "login" && mode !== "guest" && <label>{mode === "anchorRegister" ? "主播姓名" : "运营姓名"}<input value={name} onChange={(event) => setName(event.target.value)} placeholder={mode === "anchorRegister" ? "请输入主播姓名" : "请输入运营姓名"} maxLength={80} required /></label>}
          {mode === "anchorRegister" && <label>运营选择<select value={operatorId} onChange={(event) => setOperatorId(event.target.value)} disabled={operatorsLoading || operators.length === 0} required><option value="">{operatorsLoading ? "正在加载运营…" : operators.length === 0 ? "暂无可申请的运营" : "请选择所属运营"}</option>{operators.map((operator) => <option value={operator.id} key={operator.id}>{operator.name} · {operator.phone}</option>)}</select><small className={styles.fieldHint}>只展示已开通运营，手机号已脱敏；提交后由所选运营审核。</small></label>}
          <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="请输入手机号" inputMode="tel" autoComplete="tel" maxLength={24} required /></label>
          {mode !== "guest" && <label>自定义密码<input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 位"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            maxLength={128}
            required
          /></label>}
          <button className={styles.submit} type="submit" aria-busy={loading} disabled={loading || (mode === "anchorRegister" && (operatorsLoading || !operatorId))}>{loading ? "处理中…" : mode === "guest" ? "进入临时工作台" : mode === "login" ? "进入工作台" : mode === "anchorRegister" ? "提交主播申请" : "提交运营注册"}</button>
        </form>
        <div className={styles.roleNote}><strong>账号权限</strong><span>超级管理员：审批运营与全量审计</span><span>运营：管理主播并查看复盘，运营注册后等待审批</span><span>主播：选择运营申请，审批后处理自己的聊天与发送确认</span><span>游客：只操作自己的临时工作台，不读取正式账号或主播数据</span></div>
        <a className={styles.setupLink} href="/setup/">首次安装？在服务器本机初始化最高管理员</a>
      </section>
    </main>
  );
}
