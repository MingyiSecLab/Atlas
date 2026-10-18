#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG must be set}"

# --jq 只格式化输出；输出 false 并不会让 gh 返回非零状态。
ERROR_FILE=$(mktemp)
trap 'rm -f "$ERROR_FILE"' EXIT
if IS_DRAFT=$(gh release view "$RELEASE_TAG" --json isDraft -q '.isDraft' 2>"$ERROR_FILE"); then
  case "$IS_DRAFT" in
    false)
      echo "::error::Release $RELEASE_TAG 已发布过，拒绝覆盖。请先 bump apps/desktop/package.json 的 version，再用新 tag 触发。"
      exit 1
      ;;
    true)
      echo "Release $RELEASE_TAG 是草稿，允许继续。"
      ;;
    *)
      echo "::error::Release $RELEASE_TAG 返回了无效的草稿状态，停止发布。"
      exit 1
      ;;
  esac
elif [ "$(cat "$ERROR_FILE")" = 'release not found' ]; then
  echo "Release $RELEASE_TAG 不存在，允许继续。"
else
  cat "$ERROR_FILE" >&2
  echo "::error::无法检查 Release $RELEASE_TAG 的发布状态，请检查 GitHub API、网络及 Token 权限后重试。"
  exit 1
fi
