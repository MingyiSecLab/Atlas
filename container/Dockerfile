FROM kalilinux/kali-rolling:latest

# 目标架构，由 buildx / 构建器自动注入（amd64 / arm64），用于双架构镜像
ARG TARGETARCH

# 1. 系统基础依赖与无头环境
RUN apt-get update && \
    apt-get -y install --no-install-recommends kali-linux-headless sudo curl wget git ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 2. 创建非 root 用户 kali 并赋予无密码 sudo 权限
RUN useradd -m -s /bin/bash kali && \
    echo "kali ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
USER kali

# 3. 安装常用系统分析工具、内网与协议审计工具（含编译构建工具，防止 pip 编译失败）
# 注意：apt lists 的清理必须放在最后 —— playwright install-deps 需要 apt-get install 可用
RUN sudo apt-get update && \
    sudo apt-get install -y --no-install-recommends \
    build-essential cmake pkg-config python3-dev \
    bsdextrautils npm jq iputils-ping sshpass ncat rlwrap \
    bloodyad coercer enum4linux-ng pwncat chisel-common-binaries \
    dirsearch yq krb5-user gitleaks naabu nikto netexec adb \
    python3-pip python3-setuptools python3-wheel \
    python3-pwntools python3-pymongo \
    proxychains4 sqlmap hydra gobuster socat dnsutils && \
    sudo npm install -g @playwright/cli@latest && \
    # @playwright/cli 自带的 install 命令只初始化 skills，浏览器需用其捆绑的 playwright 安装（版本严格一致）
    sudo node "$(npm root -g)/@playwright/cli/node_modules/playwright/cli.js" install-deps chromium && \
    node "$(npm root -g)/@playwright/cli/node_modules/playwright/cli.js" install chromium && \
    mkdir -p /home/kali/workspace && cd /home/kali/workspace && playwright-cli install --skills && \
    sudo apt-get clean && \
    sudo rm -rf /var/lib/apt/lists/*

# 4. 下载并安装最新独立二进制安全工具 (katana, nuclei, dalfox, cloudfox, kerbrute)
# 按目标架构选择官方二进制；kerbrute 官方无 linux/arm64 资产，仅在 amd64 安装
RUN cd /tmp && \
    case "$TARGETARCH" in \
      arm64) ARCH=arm64 ;; \
      *)     ARCH=amd64 ;; \
    esac && \
    wget -q "https://github.com/projectdiscovery/katana/releases/download/v1.5.0/katana_1.5.0_linux_${ARCH}.zip" -O katana.zip && \
    wget -q "https://github.com/projectdiscovery/nuclei/releases/download/v3.7.1/nuclei_3.7.1_linux_${ARCH}.zip" -O nuclei.zip && \
    wget -q "https://github.com/hahwul/dalfox/releases/download/v2.12.0/dalfox-linux-${ARCH}.tar.gz" -O dalfox.tar.gz && \
    wget -q "https://github.com/BishopFox/cloudfox/releases/download/v2.0.1/cloudfox-linux-${ARCH}.zip" -O cloudfox.zip && \
    git clone --depth 1 "https://github.com/projectdiscovery/nuclei-templates.git" /home/kali/.local/nuclei-templates && \
    unzip -q katana.zip katana && sudo mv katana /usr/local/bin/ && \
    unzip -q nuclei.zip nuclei && sudo mv nuclei /usr/local/bin/ && \
    tar -xzf dalfox.tar.gz && sudo mv dalfox-linux-${ARCH} /usr/local/bin/dalfox && \
    unzip -q cloudfox.zip cloudfox/cloudfox && sudo mv cloudfox/cloudfox /usr/local/bin/ && \
    if [ "$ARCH" = "amd64" ]; then \
      wget -q "https://github.com/ropnop/kerbrute/releases/download/v1.0.3/kerbrute_linux_amd64" -O kerbrute && \
      sudo cp kerbrute /usr/local/bin/ && sudo chmod +x /usr/local/bin/kerbrute; \
    fi && \
    nuclei -ut && \
    sudo rm -rf /tmp/*

# 5. 预置离线知识库 (供模型随时通过 ripgrep 本地检索绕过姿势)
RUN mkdir -p /home/kali/knowledges && cd /home/kali/knowledges && \
    git clone --depth=1 https://github.com/swisskyrepo/PayloadsAllTheThings.git && \
    git clone --depth=1 https://github.com/swisskyrepo/InternalAllTheThings.git && \
    git clone --depth=1 https://github.com/HackTricks-wiki/hacktricks.git && \
    git clone --depth=1 https://github.com/HackTricks-wiki/hacktricks-cloud.git

# 6. 辅助渗透利用工具与脚本
RUN mkdir -p /home/kali/tools && cd /home/kali/tools && \
    wget -q "https://github.com/frohoff/ysoserial/releases/download/v0.0.6/ysoserial-all.jar" -O ysoserial.jar && \
    git clone --depth=1 https://github.com/ticarpi/jwt_tool.git && \
    cd jwt_tool && pip3 install --no-cache-dir -r requirements.txt --break-system-packages && \
    cd .. && \
    git clone --depth=1 https://github.com/IOActive/jdwp-shellifier.git

# 7. 预置通用 PoC 与漏洞利用仓库
RUN mkdir -p /home/kali/pocs && cd /home/kali/pocs && \
    git clone --depth=1 https://github.com/iSee857/CVE-PoC.git && \
    git clone --depth=1 https://github.com/zhzyker/exphub.git && \
    git clone --depth=1 https://github.com/passwa11/2023Hvv_.git && \
    git clone --depth=1 https://github.com/Threekiii/Awesome-POC.git && \
    git clone --depth=1 https://github.com/vulhub/vulhub.git

# 8. 高性能检索工具 (ripgrep & fd) 与云厂商 CLI
# 上游 deb 仅提供 amd64；arm64 改用 kali 官方源（版本略旧但足够）
RUN cd /tmp && \
    if [ "$TARGETARCH" = "amd64" ]; then \
      wget -q "https://github.com/BurntSushi/ripgrep/releases/download/15.1.0/ripgrep_15.1.0-1_amd64.deb" -O ripgrep.deb && \
      wget -q "https://github.com/sharkdp/fd/releases/download/v10.4.2/fd_10.4.2_amd64.deb" -O fd.deb && \
      sudo apt-get install -y ./ripgrep.deb ./fd.deb; \
    else \
      sudo apt-get update && \
      sudo apt-get install -y --no-install-recommends ripgrep fd-find && \
      sudo ln -sf /usr/bin/fdfind /usr/local/bin/fd; \
    fi && \
    sudo rm -rf /tmp/* && \
    pip3 install --no-cache-dir tccli awscli --break-system-packages

# 9. Nuclei 配置与环境变量
RUN mkdir -p /home/kali/.config/nuclei && \
    echo "disable-update-check: true" > /home/kali/.config/nuclei/config.yaml && \
    echo "update-template-dir: /home/kali/.local/nuclei-templates" >> /home/kali/.config/nuclei/config.yaml

# 10. 初始化工作空间与环境配置
RUN mkdir -p /home/kali/workspace && cd /home/kali/workspace && git init

ENV TZ=Asia/Shanghai
ENV PLAYWRIGHT_MCP_BROWSER=chromium
ENV PYTHONUNBUFFERED=1

# 注意：不要放在 /home/kali/workspace 下 —— 该路径会被宿主工作区 bind mount
# （-v ~/.atlas/sandbox_workspace:/home/kali/workspace）整体遮蔽，镜像里的文件在
# 运行时会完全不可见。放在 $HOME 根下才能被 kali_file_read 按绝对路径读到。
COPY ./AGENTS.md /home/kali/AGENTS.md

WORKDIR /home/kali/workspace

# 11. 纯执行容器：常驻运行，等待宿主桌面端 / Runtime 通过 docker exec 派发指令
CMD ["tail", "-f", "/dev/null"]
