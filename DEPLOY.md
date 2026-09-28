# 部署指南

本系统为零依赖纯 Node.js 应用，支持三种部署方式：本地直连、Cloudflared 内网穿透（局域网/公网演示）、Render 云部署。

## 方式一：本地运行

```bash
node server.js
# 访问 http://localhost:8700
```

## 方式二：局域网 / 公网演示（Cloudflared 隧道）

适用于教师机与学生机不在同一局域网、需要互联网访问的场景。

1. 先本地启动服务：`node server.js`
2. 安装 cloudflared（Windows）：
   ```powershell
   winget install cloudflare.cloudflared
   ```
3. 建立隧道并生成公网地址：
   ```bash
   cloudflared tunnel --url http://localhost:8700
   ```
4. 终端会输出形如 `https://xxxx.trycloudflare.com` 的临时公网地址，将此地址发给学生即可访问。

> 注意：免费隧道地址每次重启会变化；长期使用可改用 Cloudflare Named Tunnel 或部署到 Render（见下）。

## 方式三：Render 云部署（推荐长期使用）

1. 将本目录推送到 GitHub 仓库。
2. 在 [Render](https://render.com) 创建 **Web Service**，选择该仓库。
3. 构建配置：
   - **Environment**: `Node`
   - **Build Command**:（留空，无构建步骤）
   - **Start Command**: `node server.js`
4. 设置环境变量：
   - `PORT`: `10000`（Render 会自动注入，可保持默认）
   - `DATA_DIR`: `/var/data`（持久卷挂载点，见下）
5. 创建 **Persistent Disk**（持久卷）并挂载到 `/var/data`：
   - 路径：`/var/data`
   - 大小：建议 1 GB
   - 这样 `data/db.json` 会被保存到持久卷，重建服务后数据不丢失。
6. 首次部署会自动创建默认管理员（见 README），**部署完成后请立即修改默认密码**，并可通过环境变量预置：
   - `ADMIN_ACCOUNT`: 管理员账号（默认 `admin`）
   - `ADMIN_PASSWORD`: 管理员初始密码（默认 `admin123456`）

> 数据与配置会写入日志，日志中出现的账号密码请勿在公共环境泄露。

## 安全注意事项（重要）

- **教师账号只能由管理员创建**（登录取关在服务端强制实现），请勿把学生注册能力暴露给不可信网络时不加防护——本系统学生与教师入口是隔离的，学生即使访问到公开地址也无法自助注册为教师。
- 公网部署时建议配合平台自带的基础防护，或部署在校园内网。
- 登录接口带限速：同一账号连续 5 次失败锁定 15 分钟；同一 IP 每分钟最多 30 次尝试。
- Token 通过 `Authorization: Bearer` 头传输，不进入 URL。

## 常见问题

- **忘记管理员密码**：删除或备份后重命名 `data/db.json` 再重启，系统会重新创建默认管理员（原数据将保留在备份文件中）。
- **端口被占用**：`PORT=8800 node server.js`。
- **重启后 session 还在吗**：在，会话持久化在 `data/db.json` 中，重启不丢失（与 V2 的旧文档描述不同，V3 已持久化）。