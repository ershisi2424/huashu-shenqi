const assert = require("node:assert/strict");

const previousNodeEnv = process.env.NODE_ENV;
const previousAuthRequired = process.env.AUTH_REQUIRED;
const { authRequired } = require("./lib/auth-session.cjs");

try {
  process.env.NODE_ENV = "production";
  delete process.env.AUTH_REQUIRED;
  assert.equal(authRequired(), true, "生产环境未显式配置时必须默认要求登录");

  process.env.AUTH_REQUIRED = "false";
  assert.equal(authRequired(), false, "显式 AUTH_REQUIRED=false 必须保留开发/受控预览兼容性");

  process.env.AUTH_REQUIRED = "true";
  assert.equal(authRequired(), true, "显式 AUTH_REQUIRED=true 必须要求登录");

  process.env.NODE_ENV = "development";
  delete process.env.AUTH_REQUIRED;
  assert.equal(authRequired(), false, "开发环境未显式配置时应保持本地预览兼容性");
  console.log("test-auth-default: ok");
} finally {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousAuthRequired === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = previousAuthRequired;
}
