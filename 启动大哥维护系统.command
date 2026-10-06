#!/bin/zsh
# macOS 本地开发启动入口：清除旧 Provider 环境，确保服务读取当前项目配置。
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"
exec env -u ZAI_API_KEY -u ZHIPU_MODEL -u ZHIPU_BASE_URL npm run dev
