# Kali 渗透测试沙箱环境与兵器库清单

本容器是 Mingyi 智能体专属的安全评估与渗透测试隔离沙箱。大脑运行在宿主桌面端，本环境提供开箱即用的专业命令行工具链、离线知识库与漏洞利用 PoC 库。

> 本文件随镜像安装于 `/home/kali/AGENTS.md`（由 `container/Dockerfile` 的 `COPY` 指令落位），可通过 `kali_file_read /home/kali/AGENTS.md` 读取。
> 切勿改放到 `/home/kali/workspace/` 下：该路径会被宿主工作区 bind mount（`-v ~/.atlas/sandbox_workspace:/home/kali/workspace`）整体遮蔽，镜像内的文件在运行时会完全不可见。

---

## 1. 核心工作区
* 默认工作区路径：`/home/kali/workspace/`
* 可用于保存命令执行日志、较大的扫描结果、临时生成的字典与 Exploit 脚本。

---

## 2. 预置知识库与 PoC 库索引
当需要查询漏洞利用姿势、Bypass 技巧或寻找现成 PoC 时，推荐优先使用 `rg` (ripgrep) 直接在本地目录极速检索：

* **离线安全知识库**：`/home/kali/knowledges/`
  * `PayloadsAllTheThings`: 常见 Web 与系统攻击 Payload 速查表
  * `InternalAllTheThings`: 内网渗透、横向移动与域渗透手册
  * `hacktricks` & `hacktricks-cloud`: 极其详尽的渗透技术与云安全百科
  * *检索示例*：`rg -i "sql injection bypass" /home/kali/knowledges/`

* **现成漏洞利用 PoC 库**：`/home/kali/pocs/`
  * `CVE-PoC`: 经典与高危 CVE 利用代码集合
  * `exphub`: 知名框架与应用漏洞利用合集
  * `Awesome-POC`: 优质 PoC 汇总
  * `vulhub`: 常见漏洞靶场复现参考与配套利用
  * `2023Hvv_`: 护网实战漏洞利用与技战法合集

* **辅助工具**：`/home/kali/tools/`
  * `ysoserial.jar`: Java 反序列化 Payload 生成器
  * `jwt_tool`: JWT 令牌安全性审计与伪造
  * `jdwp-shellifier`: JDWP 调试端口 RCE 脚本

* **Nuclei 漏洞扫描模板**：`/home/kali/.local/nuclei-templates/`（已在 `/home/kali/.config/nuclei/config.yaml` 设为默认模板目录并关闭更新检查，**勿联网更新模板**）

---

## 3. 常见预置命令行工具
* **Web 与资产发现**：`nuclei`, `katana`, `dalfox`, `dirsearch`, `nikto`, `naabu`, `gitleaks`, `sqlmap`, `gobuster`
* **网络与协议审计**：`nmap`, `ncat`, `chisel`, `proxychains4`, `hydra`, `sshpass`, `rlwrap`
* **内网与域安全**：`bloodyad`, `coercer`, `enum4linux-ng`, `pwncat`, `netexec`, `/usr/bin/impacket-*`, `kerbrute`
* **二进制路径说明（已在运行容器内实测）**：
  * `chisel` **不在 PATH**：`chisel-common-binaries` 只提供带版本号的二进制，位于 `/usr/share/chisel-common-binaries/chisel_<version>_linux_amd64`（amd64 镜像为 `chisel_1.12.0-rc3_linux_amd64`，调用前先 `ls` 确认版本）
  * `kerbrute` 位于 `/usr/local/bin/kerbrute`（仅 amd64 构建包含；`npm run container:build` 使用 `--platform linux/amd64`）
  * `impacket` 系列工具位于 `/usr/bin/impacket-*`（共 61 个）
  * `cloudfox` 位于 `/usr/local/bin/cloudfox`；`tccli` / `awscli` 由 pip 安装
* **高性能检索**：`rg` (ripgrep), `fd` —— 检索知识库应先用 `rg` 定位文件与行号，不要直接整文件读取巨型 Markdown
* **动态抓取**：`playwright-cli` (Chromium 已就绪，位于 `/home/kali/.cache/ms-playwright/`)，用于 SPA 渲染、DOM XSS 验证等需要 JS 执行的场景

---

## 4. 后台任务与服务交互规范
* 若需要启动持续运行的服务（如起 Python HTTP 服务器接收数据外带、`nc -lvnp` 接听反弹 Shell 等），建议通过后台进程或 `tmux` 会话运行。
