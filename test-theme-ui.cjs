const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync("components/theme/ThemeToggle.js", "utf8");
assert.match(component, /const \[mounted, setMounted\] = useState\(false\)/, "主题组件必须等待客户端挂载后再读取系统主题");
assert.match(component, /const resolved = useMemo\(\(\) => mounted\s*\?/, "主题首屏必须使用服务端一致的初始值，避免 hydration 重建");
assert.match(component, /setMounted\(true\)/, "主题组件必须在 effect 中标记已挂载");

console.log("test-theme-ui: ok");
