#!/usr/bin/env node

const path = require("node:path");
const { readLocalConfig } = require("../lib/local-config.cjs");
const { formatValidationResult, validateWindowsDeployConfig } = require("../lib/windows-deploy-config.cjs");

const validationEnv = { ...process.env };
if (!validationEnv.ZAI_API_KEY && !validationEnv.CONFIG_FILE_CONFIGURED) {
  const configPath = validationEnv.AI_REPLY_CONFIG_PATH || path.join(process.cwd(), ".env.local");
  try {
    validationEnv.CONFIG_FILE_CONFIGURED = readLocalConfig(configPath).configured ? "true" : "false";
  } catch {
    validationEnv.CONFIG_FILE_CONFIGURED = "false";
  }
}
const result = validateWindowsDeployConfig(validationEnv);
process.stdout.write(`${formatValidationResult(result)}\n`);
if (!result.ok) process.exitCode = 1;
