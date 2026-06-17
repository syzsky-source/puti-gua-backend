# 菩提卦馆后端服务

这是给 `puti-gua.html` 配套的 Node.js + Express + MySQL 后端。

## 已实现接口

前端会读取 `localStorage.puti_api_base` 或当前域名作为 `API_BASE`，然后调用：

- `GET /api/public/settings`
- `GET /api/public/products`
- `GET /api/public/qrcode/active`
- `GET /api/public/users/:userId`
- `POST /api/public/ai/chat`
- `POST /api/public/orders`
- `POST /api/public/orders/:orderId/proof`

后台接口需请求头 `x-admin-token`：

### 订单管理

- `GET /api/admin/orders`
- `POST /api/admin/orders/:orderId/confirm`
- `POST /api/admin/orders/:orderId/cancel`

### 用户管理

- `GET /api/admin/users`
  - 查询参数：`page`、`page_size`、`keyword`
  - 返回用户列表、剩余次数、绑定手机号/微信号、订单数、已付款订单数、累计付款金额、最近订单时间
- `GET /api/admin/users/:userId`
  - 返回用户详情、订单统计、最近 20 条订单
- `GET /api/admin/users/:userId/orders`
  - 查询参数：`page`、`page_size`、`status`
  - 返回该用户订单记录
- `POST /api/admin/users/:userId/points`
  - 请求体：`{ "points": 10, "reason": "人工赠送" }`
  - `points` 可以为正数或负数；减少次数时最低不会低于 0
- `POST /api/admin/users/points`
  - 兼容旧后台页面，请求体：`{ "user_id": "用户ID", "points": 10 }`

## 本地启动

```bash
npm install
cp .env.example .env
```

修改 `.env`：

```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=你的MySQL密码
DB_NAME=puti_gua
DEEPSEEK_API_KEY=你的DeepSeekKey
PUBLIC_BASE_URL=http://localhost:3000
ADMIN_TOKEN=自己设置一个管理员token
```

导入数据库：

```bash
mysql -u root -p < database/schema.sql
```

已上线旧库新增后台用户管理字段/表时，可按需执行：

```bash
mysql -u root -p < database/migrations/20260617_admin_user_management.sql
```

注意：如果旧库里某个字段或索引已经存在，对应 `ALTER TABLE` 可能提示重复，跳过该条继续执行后续语句即可。

启动：

```bash
npm run dev
```

测试健康检查：

```bash
curl http://localhost:3000/health
```

## 前端连接后端

开发测试时，在浏览器控制台执行：

```js
localStorage.setItem('puti_api_base', 'http://localhost:3000')
location.reload()
```

线上部署后，例如后端域名是 `https://api.putigua.com`：

```js
localStorage.setItem('puti_api_base', 'https://api.putigua.com')
location.reload()
```

如果你把前端和后端放在同一个域名下，也可以不设置，前端会默认使用 `location.origin`。

## 支付截图上传

前端上传字段名是 `image`，后端会保存到：

```text
uploads/payment_proofs/
```

并返回可访问地址：

```text
/uploads/payment_proofs/xxx.jpg
```

正式部署时需要把 `.env` 里的 `PUBLIC_BASE_URL` 改成后端公网地址。

## 人工确认订单

用户上传付款截图后，订单状态会变成 `proof_uploaded`。

管理员确认到账：

```bash
curl -X POST "http://localhost:3000/api/admin/orders/订单ID/confirm" \
  -H "x-admin-token: 你的ADMIN_TOKEN"
```

确认后会把订单对应的次数加到用户账户，并同步累计付款金额。

## 后台用户管理测试

用户列表：

```bash
curl "http://localhost:3000/api/admin/users?page=1&page_size=20" \
  -H "x-admin-token: 你的ADMIN_TOKEN"
```

用户详情：

```bash
curl "http://localhost:3000/api/admin/users/用户ID" \
  -H "x-admin-token: 你的ADMIN_TOKEN"
```

用户订单记录：

```bash
curl "http://localhost:3000/api/admin/users/用户ID/orders" \
  -H "x-admin-token: 你的ADMIN_TOKEN"
```

手动加减次数：

```bash
curl -X POST "http://localhost:3000/api/admin/users/用户ID/points" \
  -H "x-admin-token: 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"points":5,"reason":"后台手动补次数"}'
```

减少次数：

```bash
curl -X POST "http://localhost:3000/api/admin/users/用户ID/points" \
  -H "x-admin-token: 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"points":-3,"reason":"后台手动扣次数"}'
```

## 云服务器部署简版

```bash
sudo apt update
sudo apt install -y nodejs npm mysql-server nginx

# 上传本项目到服务器后
npm install
cp .env.example .env
nano .env
mysql -u root -p < database/schema.sql
npm start
```

建议生产环境使用 pm2：

```bash
sudo npm i -g pm2
pm2 start src/app.js --name puti-gua-backend
pm2 save
pm2 startup
```

Nginx 反代示例：

```nginx
server {
  listen 80;
  server_name api.yourdomain.com;

  client_max_body_size 10m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 注意

`POST /api/public/ai/chat` 是流式输出接口。成功时返回 DeepSeek SSE 流，前端会逐字显示；错误时返回统一 JSON：

```json
{ "code": 402, "msg": "剩余次数不足，请先充值", "data": null }
```
