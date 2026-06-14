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

另含简单后台接口，需请求头 `x-admin-token`：

- `GET /api/admin/orders`
- `POST /api/admin/orders/:orderId/confirm`
- `POST /api/admin/orders/:orderId/cancel`
- `POST /api/admin/users/points`

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

确认后会把订单对应的次数加到用户账户。

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
