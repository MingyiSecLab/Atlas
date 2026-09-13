# Mingyi Kali 渗透测试沙箱 (Container Sandbox)

本目录为 Mingyi 智能体桌面工作台专属的 **Kali 纯执行沙箱环境**。

---

## 架构定位

* **桌面端为唯一大脑**：所有模型推理、会话规划、状态空间（Facts/Intents 图）与用户交互均在 Mingyi 桌面端完成；
* **沙箱为纯执行环境**：移除了容器内套娃的 Claude Code / Codex 等 Agent CLI，容器以常驻进程挂起，通过 Docker API / `docker exec` 受控接收桌面端下发的各项安全指令。

---

## 快速使用

### 1. 构建沙箱镜像

在仓库根目录执行以下命令构建镜像：

```bash
docker build -t mingyi-sandbox:latest ./container
```

> **提示**：由于镜像内包含了完整的 Kali 工具链、离线知识库（HackTricks、PayloadsAllTheThings）与 PoC 库，首次构建拉取 Git 仓库与安全工具可能需要数分钟。

### 2. 启动沙箱容器

启动一个后台常驻容器供桌面端随时调用：

```bash
docker run -d \
  --name mingyi-sandbox \
  --net=host \
  -v $(pwd)/datas/sandbox_workspace:/home/kali/workspace \
  mingyi-sandbox:latest
```

* `--net=host`：使沙箱能直接访问宿主机网络及宿主机可达的内网/靶场；
* `-v ...`：将工作区挂载到宿主机，便于实时查看生成的日志、扫描报告与截获的凭据。

### 3. 测试验证

进入容器验证工具链是否就绪：

```bash
# 测试 nmap 与 nuclei
docker exec -it mingyi-sandbox nuclei -version
docker exec -it mingyi-sandbox nmap --version

# 测试离线知识库检索 (ripgrep)
docker exec -it mingyi-sandbox rg -i "sqli" /home/kali/knowledges/PayloadsAllTheThings/
```

---

## 预置资产一览

详见 [AGENTS.md](./AGENTS.md)：
* **知识库**：`/home/kali/knowledges/`（PayloadsAllTheThings, HackTricks 等）
* **PoC 库**：`/home/kali/pocs/`（CVE-PoC, exphub, Awesome-POC, vulhub）
* **工具库**：`/home/kali/tools/`（ysoserial, jwt_tool 等）
* **命令行工具**：`nuclei`, `katana`, `dalfox`, `sqlmap`, `chisel`, `impacket`, `dirsearch` 等
