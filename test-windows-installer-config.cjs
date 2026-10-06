const assert = require("node:assert/strict");

const {
  normalizeInstallerConfig,
  validateProviderConfigFields,
} = require("./lib/windows-installer-config.cjs");
const { validateReleaseManifest } = require("./lib/windows-release-manifest.cjs");

{
  const config = normalizeInstallerConfig({
    appDir: "C:\\Program Files\\Huashu\\releases\\1.0.0",
    dataDir: "C:\\ProgramData\\Huashu",
  });
  assert.equal(config.port, 3102);
  assert.equal(config.bindHost, "0.0.0.0");
  assert.equal(config.dbPath, "C:\\ProgramData\\Huashu\\data\\auth.sqlite");
  assert.equal(config.configDir, "C:\\ProgramData\\Huashu\\config");
}

assert.throws(
  () => normalizeInstallerConfig({ appDir: "C:\\Huashu", dataDir: "C:\\Huashu\\data" }),
  /DATA_DIR_INSIDE_APP/,
);
assert.throws(
  () => normalizeInstallerConfig({ appDir: "\\\\server\\share\\Huashu", dataDir: "C:\\ProgramData\\Huashu" }),
  /UNC_PATH_NOT_ALLOWED/,
);
assert.throws(
  () => normalizeInstallerConfig({ appDir: "C:\\Huashu", dataDir: "C:\\ProgramData\\Huashu", port: 70000 }),
  /PORT_INVALID/,
);

{
  const provider = validateProviderConfigFields({
    ZAI_API_KEY: "synthetic",
    ZHIPU_MODEL: "glm-5.3",
    ZHIPU_BASE_URL: "https://example.test",
  });
  assert.equal(provider.ZHIPU_MODEL, "glm-5.3");
}
assert.throws(
  () => validateProviderConfigFields({ NODE_OPTIONS: "--require evil" }),
  /PROVIDER_FIELD_NOT_ALLOWED/,
);
assert.throws(
  () => validateProviderConfigFields({ ZAI_API_KEY: "synthetic", ZHIPU_BASE_URL: "http://public.example" }),
  /PROVIDER_BASE_URL_NOT_ALLOWED/,
);

const validManifest = {
  version: "1.0.0",
  platform: "win32",
  arch: "x64",
  components: [
    {
      id: "node",
      url: "https://example.test/node.zip",
      sha256: "a".repeat(64),
      size: 1024,
      relativePath: "runtime/node.zip",
      license: "MIT",
    },
  ],
};
assert.equal(validateReleaseManifest(validManifest).version, "1.0.0");
assert.throws(
  () => validateReleaseManifest({ ...validManifest, components: [{ ...validManifest.components[0], url: "http://example.test/node.zip" }] }),
  /COMPONENT_URL_NOT_HTTPS/,
);
assert.throws(
  () => validateReleaseManifest({ ...validManifest, components: [{ ...validManifest.components[0], relativePath: "..\\node.zip" }] }),
  /COMPONENT_PATH_TRAVERSAL/,
);
assert.throws(
  () => validateReleaseManifest({ ...validManifest, components: [{ ...validManifest.components[0], sha256: "bad" }] }),
  /COMPONENT_SHA256_INVALID/,
);

console.log("test-windows-installer-config: ok");
