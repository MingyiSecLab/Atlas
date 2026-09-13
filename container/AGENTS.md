# Kali 渗透测试沙箱环境与兵器库清单

本容器是 Mingyi 智能体专属的安全评估与渗透测试隔离沙箱。大脑运行在宿主桌面端，本环境提供开箱即用的专业命令行工具链、离线知识库与漏洞利用 PoC 库。

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

* **辅助工具**：`/home/kali/tools/`
  * `ysoserial.jar`: Java 反序列化 Payload 生成器
  * `jwt_tool`: JWT 令牌安全性审计与伪造
  * `jdwp-shellifier`: JDWP 调试端口 RCE 脚本

* **Nuclei 漏洞扫描模板**：`/home/kali/.local/nuclei-templates/`

---

## 3. 常见预置命令行工具
* **Web 与资产发现**：`nuclei`, `katana`, `dalfox`, `dirsearch`, `nikto`, `naabu`, `gitleaks`, `sqlmap`, `gobuster`
* **网络与协议审计**：`nmap`, `ncat`, `chisel`, `proxychains4`, `hydra`, `sshpass`, `rlwrap`
* **内网与域安全**：`bloodyad`, `coercer`, `enum4linux-ng`, `pwncat`, `netexec`, `/usr/bin/impacket-*`, `kerbrute`
* **二进制路径说明**：
  * `chisel` 位于 `/usr/share/chisel-common-binaries/` 或系统 PATH
  * `kerbrute` 位于 `/usr/local/bin/kerbrute`
  * `impacket` 系列工具位于 `/usr/bin/impacket-*`
* **高性能检索**：`rg` (ripgrep), `fd`
* **动态抓取**：`playwright-cli` (Chromium 已就绪)

---

## 4. 后台任务与服务交互规范
* 若需要启动持续运行的服务（如起 Python HTTP 服务器接收数据外带、`nc -lvnp` 接听反弹 Shell 等），建议通过后台进程或 `tmux` 会话运行。
