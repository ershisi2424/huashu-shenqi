const { createAuthStore } = require("../lib/auth-store.cjs");

const phone = process.env.BOOTSTRAP_ADMIN_PHONE;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME || "最高权限";
if (!phone || !password) {
  console.error("请通过环境变量 BOOTSTRAP_ADMIN_PHONE 和 BOOTSTRAP_ADMIN_PASSWORD 提供首次超级管理员信息");
  process.exit(1);
}

const store = createAuthStore({ filename: process.env.AUTH_DB_PATH });
try {
  const admin = store.ensureBootstrapAdmin({ phone, password, name });
  console.log(`最高权限账号已就绪：${admin.name}（${admin.phone}）`);
} catch (error) {
  if (error?.message === "BOOTSTRAP_ADMIN_EXISTS") {
    console.error("已有活动最高管理员；如需恢复或轮换，请使用受保护的管理员重置流程");
  } else if (error?.message === "BOOTSTRAP_PHONE_CONFLICT") {
    console.error("该手机号已属于其他账号，未执行管理员提升");
  } else {
    console.error("最高管理员初始化失败");
  }
  process.exitCode = 1;
} finally {
  store.close();
}
