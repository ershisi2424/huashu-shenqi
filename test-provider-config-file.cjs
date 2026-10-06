const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const {
  writeProviderConfig,
  readProviderConfig,
  projectProviderEnv,
  maskProviderConfig,
} = require("./lib/provider-config-file.cjs");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "huashu-provider-"));
const file = path.join(tempDir, "provider.json");
try {
  writeProviderConfig(file, {
    ZAI_API_KEY: "synthetic-provider-key",
    ZHIPU_MODEL: "glm-5.3",
    ZHIPU_BASE_URL: "https://example.test/v4",
  });
  const stored = readProviderConfig(file);
  assert.equal(projectProviderEnv(stored).ZHIPU_MODEL, "glm-5.3");
  assert.equal(maskProviderConfig(stored).ZAI_API_KEY, "***");
  assert.equal(JSON.stringify(maskProviderConfig(stored)).includes("synthetic-provider-key"), false);
  assert.equal(fs.statSync(file).isFile(), true);

  const fresh = childProcess.spawnSync(process.execPath, ["-e", `
    const { readProviderConfig, projectProviderEnv } = require(${JSON.stringify(path.join(__dirname, "lib/provider-config-file.cjs"))});
    const value = projectProviderEnv(readProviderConfig(${JSON.stringify(file)}));
    if (value.ZHIPU_MODEL !== "glm-5.3") process.exit(2);
    if (value.ZAI_API_KEY !== "synthetic-provider-key") process.exit(3);
  `], { encoding: "utf8" });
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.throws(() => writeProviderConfig(file, { AUTH_REQUIRED: "false" }), /PROVIDER_FIELD_NOT_ALLOWED/);
  assert.throws(() => writeProviderConfig(file, { ZAI_API_KEY: "synthetic", ZHIPU_BASE_URL: "http://public.example" }), /PROVIDER_BASE_URL_NOT_ALLOWED/);
  console.log("test-provider-config-file: ok");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
