const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

function loadHandler(relativePath, authSession, setupState) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8")
    .replace(/^import \{([^}]+)\} from .*auth-session\.cjs.*$/m, "const {$1} = authSession;")
    .replace(/^import \{([^}]+)\} from .*setup-state\.cjs.*$/m, "const {$1} = setupState;")
    .replace(/^export default (?:async )?function handler/m, "async function handler");
  const context = { console, JSON, String, Number, Date, authSession, setupState };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.handler = handler;`, context);
  return context.handler;
}

function response() {
  let status = 200;
  let payload;
  const headers = {};
  return {
    get statusCode() { return status; },
    get payload() { return payload; },
    headers,
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
    setHeader(name, value) { headers[name] = value; },
  };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-setup-api-"));
  const db = require("./lib/auth-store.cjs").createAuthStore({ filename: path.join(root, "auth.sqlite") });
  const setup = require("./lib/setup-state.cjs").createSetupState({ filePath: path.join(root, "setup-state.json") });
  const authSession = { getAuthStore: () => db, setPrivateNoStore: () => {} };
  const setupState = { createSetupState: () => setup };
  const statusHandler = loadHandler("pages/api/setup/status.js", authSession, setupState);
  const claimHandler = loadHandler("pages/api/setup/claim.js", authSession, setupState);
  try {
    const issued = setup.issue();
    let res = response();
    await statusHandler({ method: "GET", socket: { remoteAddress: "127.0.0.1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.setupRequired, true);
    assert.equal(JSON.stringify(res.payload).includes(issued.code), false);

    res = response();
    await claimHandler({ method: "POST", body: { code: issued.code, phone: "13800138000", name: "管理员", password: "admin-password" }, socket: { remoteAddress: "192.168.1.10" } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, "SETUP_LOCAL_ONLY");

    res = response();
    await claimHandler({ method: "POST", body: { code: issued.code, phone: "13800138000", name: "管理员", password: "admin-password" }, socket: { remoteAddress: "127.0.0.1" } }, res);
    assert.equal(res.statusCode, 201, JSON.stringify(res.payload));
    assert.equal(res.payload.user.role, "super_admin");
    assert.equal(JSON.stringify(res.payload).includes("admin-password"), false);
    assert.equal(JSON.stringify(res.payload).includes(issued.code), false);

    res = response();
    await statusHandler({ method: "GET", socket: { remoteAddress: "127.0.0.1" } }, res);
    assert.equal(res.payload.setupRequired, false);
    assert.equal(res.payload.code, "BOOTSTRAP_ADMIN_EXISTS");

    res = response();
    await claimHandler({ method: "POST", body: { code: issued.code, phone: "13800138001", name: "第二管理员", password: "admin-password" }, socket: { remoteAddress: "127.0.0.1" } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.payload.code, "BOOTSTRAP_ADMIN_EXISTS");
    console.log("test-setup-api: ok");
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exit(1); });
