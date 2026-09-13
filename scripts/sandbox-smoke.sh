#!/usr/bin/env bash
# Kali 沙箱冒烟测试：验证 Runtime DockerSandboxAdapter 依赖的全部容器能力。
# 依赖真实 Docker 与 mingyi-sandbox:latest 镜像（npm run container:build）。
# 用法：npm run container:smoke [-- IMAGE] [-- NAME]
set -euo pipefail

IMAGE="${MINGYI_SANDBOX_IMAGE:-mingyi-sandbox:latest}"
NAME="${MINGYI_SANDBOX_CONTAINER:-mingyi-sandbox-smoke}"
WORKSPACE="/home/kali/workspace"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --) shift; break ;;
    *) IMAGE="$1"; shift ;;
  esac
done

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

pass() { printf ' \033[32mOK\033[0m  %s\n' "$1"; }
fail() { printf ' \033[31mFAIL\033[0m %s\n' "$1"; exit 1; }

echo "== 1. 镜像存在性与平台 =="
docker image inspect "$IMAGE" --format 'image={{.RepoTags}} os={{.Os}}/{{.Architecture}}' \
  || fail "镜像 $IMAGE 不存在（先运行 npm run container:build）"
pass "镜像就绪"

echo "== 2. 容器拉起（与 adapter ensure 相同的参数形态）=="
docker run -d --name "$NAME" --network host --cap-add=NET_RAW --cap-add=NET_ADMIN "$IMAGE" >/dev/null
sleep 2
[[ "$(docker inspect -f '{{.State.Status}}' "$NAME")" == "running" ]] || fail "容器未进入 running"
pass "容器 running"

echo "== 3. 工具链盘点（真实执行而非存在性检查）=="
MISSING=()
for tool in nmap nuclei ffuf httpx sqlmap tmux nc jq python3 rg; do
  if ! docker exec "$NAME" bash -lc "command -v $tool" >/dev/null 2>&1; then
    MISSING+=("$tool")
  fi
done
[[ ${#MISSING[@]} -eq 0 ]] || fail "缺失工具: ${MISSING[*]}"
# 带文件能力(file capabilities)的二进制在 rootless 运行时若无 NET_RAW/NET_ADMIN 会 EPERM
docker exec "$NAME" nmap --version >/dev/null 2>&1 || fail "nmap 无法执行（检查 --cap-add=NET_RAW,NET_ADMIN）"
pass "关键工具可执行"

echo "== 4. exec 语义：退出码透传与 timeout 124 =="
docker exec "$NAME" bash -lc "cd '$WORKSPACE' || exit 125 && bash -c 'exit 7'" >/dev/null 2>&1 \
  && fail "退出码未透传" || rc=$?
[[ "${rc:-0}" == "7" ]] || fail "期望退出码 7，实际 ${rc:-0}"
docker exec "$NAME" bash -lc "cd '$WORKSPACE' || exit 125 && timeout --kill-after=6 2 bash -c 'sleep 10'" \
  && fail "timeout 未生效" || rc=$?
[[ "${rc:-0}" == "124" ]] || fail "期望退出码 124，实际 ${rc:-0}"
pass "退出码透传与 timeout 124 正确"

echo "== 5. 交互会话：send-keys + capture-pane -S - 增量读取 =="
docker exec "$NAME" tmux new-session -d -s work
docker exec "$NAME" tmux send-keys -t work -l -- 'echo SMOKE-$((21*2))'
docker exec "$NAME" tmux send-keys -t work Enter
sleep 1
docker exec "$NAME" tmux capture-pane -p -S - -t work | /usr/bin/grep -q 'SMOKE-42' \
  || fail "capture-pane 未捕获命令输出"
docker exec "$NAME" tmux kill-session -t work
pass "交互会话读写闭环"

echo "== 6. 一次性监听器（反弹 shell 接收形态）=="
docker exec "$NAME" tmux new-session -d -s listener 'nc -lvp 4444 > /tmp/caught.txt 2>&1'
sleep 1
docker exec "$NAME" bash -c "echo 'shell-connected' | nc -w 2 127.0.0.1 4444" >/dev/null
sleep 1
docker exec "$NAME" /usr/bin/grep -q 'shell-connected' /tmp/caught.txt \
  || fail "监听器未捕获数据"
pass "监听器捕获成功"

echo "== 7. 文件写入与读回（kali_file_* 前提）=="
printf 'scan-result-demo' | docker exec -i "$NAME" bash -lc "mkdir -p '$WORKSPACE' && cat > '$WORKSPACE/smoke.json'"
[[ "$(docker exec "$NAME" bash -lc "cat '$WORKSPACE/smoke.json'")" == "scan-result-demo" ]] \
  || fail "文件读回不一致"
pass "文件读写一致"

echo "== 8. 离线知识库可检索 =="
docker exec "$NAME" bash -lc "rg -il 'sqli' /home/kali/knowledges/PayloadsAllTheThings/ | head -1" | /usr/bin/grep -q . \
  || fail "知识库检索失败"
pass "知识库可检索"

echo ""
printf '\033[32m全部通过 ✅\033[0m  %s 的沙箱能力满足 Runtime DockerSandboxAdapter 依赖\n' "$IMAGE"
