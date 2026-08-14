#!/usr/bin/env bash
#
# deploy-test.sh — bhgt-h5-client 测试环境部署（在服务器运行）
#
# 部署目录：/opt/apps/bhgt/test/h5
# Nginx 静态目录：/opt/apps/bhgt/test/h5/dist
#
# 用法：
#   ./deploy-test.sh              # 默认不安装依赖
#   ./deploy-test.sh install      # 首次部署或依赖变更时安装依赖

set -euo pipefail

BRANCH="test"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> [bhgt-h5-client:test] 部署目录: $SCRIPT_DIR"
cd "$SCRIPT_DIR"

INSTALL_DEPS=0
case "${1:-}" in
  install|--install-deps|-i) INSTALL_DEPS=1 ;;
esac

echo "==> 拉取并切换到 $BRANCH 分支"
git fetch origin
git checkout -f -B "$BRANCH" "origin/$BRANCH"

if [ ! -f .env.test ]; then
  echo "!! 错误：.env.test 缺失，无法确定测试 API 地址。" >&2
  exit 1
fi

if [ "$INSTALL_DEPS" = "1" ]; then
  echo "==> 清理并安装依赖"
  rm -rf node_modules package-lock.json
  npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
else
  echo "==> 跳过依赖安装（首次部署或依赖变更时请传 install）"
fi

echo "==> 构建测试静态站点（读取 .env.test）"
npm run build:test

echo "==> 部署完成，dist/ 已由 Nginx 静态托管"
