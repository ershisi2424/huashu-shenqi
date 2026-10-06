import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import styles from "./setup.module.css";

export default function SetupWorkspace() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/setup/status/", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "首次初始化只允许在服务器本机进行");
        if (!cancelled) setStatus(payload);
      })
      .catch((caught) => { if (!cancelled) setError(caught?.message || "无法读取初始化状态"); });
    return () => { cancelled = true; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/setup/claim/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, phone, name, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "初始化失败");
      setNotice("初始化成功，正在返回登录页");
      setTimeout(() => router.push("/login/"), 600);
    } catch (caught) {
      setError(caught?.message || "初始化失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-label="首次初始化最高管理员">
        <div className={styles.eyebrow}>FIRST RUN SETUP</div>
        <h1>初始化最高管理员</h1>
        <p className={styles.subtitle}>仅在服务器本机输入安装器显示的一次性初始化码。初始化码不会出现在网址、日志或普通配置文件中。</p>
        {status?.setupRequired === false && <div className={styles.notice}>最高管理员已初始化，请直接返回登录。</div>}
        {notice && <div className={styles.notice}>{notice}</div>}
        {error && <div className={styles.error}>{error}</div>}
        <form onSubmit={submit} className={styles.form}>
          <label>一次性初始化码<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="从安装器手动输入" autoComplete="one-time-code" required /></label>
          <label>管理员姓名<input value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入名称" maxLength={80} required /></label>
          <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="请输入手机号" inputMode="tel" maxLength={24} required /></label>
          <label>登录密码<input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 位"
            type="password"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            required
          /></label>
          <label>确认密码<input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="再次输入密码"
            type="password"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            required
          /></label>
          <button className={styles.submit} type="submit" disabled={loading || status?.setupRequired === false}>{loading ? "初始化中…" : "完成初始化"}</button>
        </form>
        <div className={styles.footer}>没有初始化码？请回到安装器重新生成。已初始化时不会覆盖或创建第二个最高管理员。</div>
      </section>
    </main>
  );
}
