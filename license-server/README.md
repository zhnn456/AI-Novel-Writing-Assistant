# 授权服务器（在线验证）— 卖家专用

这是你自己控制、只在你这边跑的**授权服务器**。它负责发码、验码、绑定机器、吊销、管订阅。
桌面软件把「激活码 + 本机指纹」发过来，由这台服务器裁决并回授权状态。

> **重要：这个目录是卖家内部工具，不要提交到公开 GitHub 仓库。**
> 里面 `data/licenses.json` 存着已发激活码和客户绑定信息，`LICENSE_ADMIN_TOKEN` 是你的管理口令——
> 两者都必须保密。

## 一、本地测试怎么跑

在 `license-server` 目录下打开终端：

```bash
# 先设置管理口令（换成你自己定的一串字）
export LICENSE_ADMIN_TOKEN="换成你自己定的管理口令"
export LICENSE_PORT="3400"
node server.js
```

看到 `[license-server] 已启动：http://localhost:3400` 即成功。

## 二、桌面软件怎么连这台服务器

桌面软件通过后端读取环境变量，按优先级取第一个存在的：

1. `AI_NOVEL_LICENSE_SERVER_URL`
2. `LICENSE_SERVER_URL`
3. 默认 `http://localhost:3400`（本地开发）

所以本地开发默认连 3400 即可。**正式打包 / 服务器部署后**，把
`AI_NOVEL_LICENSE_SERVER_URL` 设为你的服务器公网地址（如 `https://license.你的域名.com`）
即可，桌面软件就会连到你的服务器校验。

## 三、发码 / 吊销 / 查看（卖家工具）

用仓库里的 `tools/license-server-cli.mjs`：

```bash
# 发一个标准版激活码（永久买断，¥99）
node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 issue \
  --edition standard --purpose activate --duration 0 --price 99

# 发一个高级版升级码（订阅一年，¥199）
node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 issue \
  --edition premium --purpose upgrade --duration 365 --price 199

# 吊销某个码（泄漏了/客户退款时用）
node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 revoke --code NV-XXXX-XXXX-...

# 查看已发的全部码
node tools/license-server-cli.mjs --server http://localhost:3400 --token 管理口令 list
```

不带参数直接运行会进入菜单交互模式。

参数说明：
- `--edition`：`standard`（标准版）| `premium`（高级版）
- `--purpose`：`activate`（激活码）| `upgrade`（升级码）
- `--duration`：有效天数，`0` = 永久买断；`>0` = 订阅 N 天
- `--price`：售价（元），仅作记录

## 四、部署到公网（正式营业时）

1. 找一台能长期运行的服务器（云服务器 / VPS 均可，装 Node 18+）。
2. 把整个 `license-server/` 目录（**不含 data**）拷上去。
3. 设置环境变量并后台运行：
   ```bash
   export LICENSE_ADMIN_TOKEN="你的管理口令"
   export LICENSE_PORT="3400"
   nohup node server.js &
   ```
   （或用 systemd/pm2 让它开机自启。）
4. 配域名 + HTTPS（推荐用 Nginx 反代到 3400，或云厂商的域名绑定），得到类似
   `https://license.你的域名.com`。
5. 打包桌面软件时把 `AI_NOVEL_LICENSE_SERVER_URL` 指向这个地址。
6. **备份**：定期备份 `data/licenses.json`，别弄丢，否则客户的激活记录就没了。

## 五、为什么这是"在线验证"

- 真正的裁决和私密信息都在这台服务器上，**永不发给用户**，所以开源代码里没有可盗的密钥。
- 你能**吊销**泄露的码、能做**订阅**（到期自动失效）。
- 桌面软件断网时用「最近一次服务器通过的授权结果」兜底，联网后自动与服务器核对一次。

## 接口一览

公共（桌面软件用）：`GET /api/license/status`、`POST /api/license/activate`、
`POST /api/license/upgrade`、`POST /api/license/verify`。
卖家（需 `x-admin-token` 请求头）：`POST /api/license/admin/issue`、
`POST /api/license/admin/revoke`、`GET /api/license/admin/list`。
