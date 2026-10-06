const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(`${__dirname}/public/sw.js`, "utf8");

assert.match(source, /url\.pathname\s*===\s*apiRoot\.slice\(0,\s*-1\)\s*\|\|\s*url\.pathname\.startsWith\(apiRoot\)/,
  "Service Worker must bypass the scoped API origin before cache handling");
assert.match(source, /VERSION\s*=\s*["']v1\.0\.3-private-api["']/,
  "Service Worker cache version must be bumped after API cache isolation");
assert.match(source, /self\.registration\?\.scope/, "Service Worker must read registration scope");
assert.match(source, /new URL\(["']api\/["'],\s*SCOPE_URL\)/,
  "Service Worker API bypass must derive its prefix from the registration scope");
assert.match(source, /apiRoot[\s\S]{0,180}url\.pathname\.startsWith\(apiRoot\)/,
  "Service Worker must bypass scoped API paths");
assert.doesNotMatch(source, /cache-first[\s\S]{0,500}\/api\//i,
  "API requests must not use the cache-first branch");

console.log("test-service-worker: ok");
