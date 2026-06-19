# 菩提卦馆 2026-06-19 Codex 工作进度固定

> 用户说“继续今天 Codex 进度”或“继续 6 月 19 日 Codex 进度”时，从这里接着处理。

## 当前完成状态

### 已合并：PR #2 — 用户 ID、订单与套餐二维码匹配

- 前台购买弹窗显示当前客户 ID。
- 增加“复制客户ID”和“生成新客户ID”。
- 同一浏览器继续使用 `localStorage` 内固定的 `puti_user_id`；只有用户主动确认时才生成新的客户 ID。
- 创建订单后，接口会按 `product_id` 返回对应二维码。
- 后台订单支持状态、套餐、用户 ID、关键词筛选。
- 后台收款码支持绑定 `product_id` 与 `amount`。

### 已合并：PR #3 — 参考站点重构前台

- 前台已参考 `https://putiyuan.pages.dev/` 调整为九项服务入口：为家人祈福、今日黄历、周公解梦、关帝灵签、八字精批、六爻占卜、手相/面相、宝宝起名、静心禅坐。
- 首页 Hero、服务卡片、典籍与信任说明已更新。

### 已合并：品牌名称修正

- Codex 曾误把品牌改为“菩提苑”。
- 品牌修正 PR 已合并。
- 当前 GitHub `main` 中 `index.html` 与 `puti-gua.html` 的标题已恢复为：`菩提卦馆 · 为家人祈福求灵签`。
- 所有对外品牌必须保持为「菩提卦馆」。

## 数据库迁移

PR #2 引入 `qrcodes.product_id` 与 `qrcodes.amount`，线上数据库必须完成迁移后才可重启新代码。

已新增安全、可重复执行的迁移脚本：

```bash
node scripts/migrate-product-qrcode.js
```

该脚本会：

- 检查并按需新增 `product_id`、`amount` 字段。
- 检查并按需新增索引。
- 写入或更新 19.90 / 29.90 / 69.90 套餐。
- 写入或更新三张对应收款码，不会因重复运行而重复新增相同套餐绑定二维码。

二维码地址：

- `https://api.putiguaguan.fun/uploads/qrcodes/qrcode_19_90.jpg`
- `https://api.putiguaguan.fun/uploads/qrcodes/qrcode_29_90.jpg`
- `https://api.putiguaguan.fun/uploads/qrcodes/qrcode_69_90.jpg`

## 当前线上状态

- GitHub `main` 已包含 Codex 功能、品牌修正和安全迁移脚本。
- 阿里云服务器 `/var/www/puti-gua-backend` 尚未部署上述最新代码。
- 下一步是：拉取代码 → 运行安全迁移 → 重启 PM2 → 验收前台和后台。

## 下一步服务器操作

在服务器终端执行：

```bash
cd /var/www/puti-gua-backend
git pull origin main
npm install
node scripts/migrate-product-qrcode.js
pm2 restart puti-gua-backend --update-env
pm2 save
pm2 status
```

成功后测试：

1. 打开 `https://putiguaguan.fun` 后按 Ctrl+F5。
2. 确认页面名称显示「菩提卦馆」。
3. 打开购买弹窗，确认显示客户 ID、复制客户 ID、生成新客户 ID。
4. 分别选择 19.90 / 29.90 / 69.90 套餐，检查对应二维码是否显示。
5. 创建一笔测试订单，上传付款截图。
6. 打开 `https://api.putiguaguan.fun/admin`，确认订单筛选、订单详情、确认付款自动加次数正常。
7. 前台问卦，确认次数正确扣减。

## 如果迁移报错

不要重复执行其他 SQL 或重新运行完整 schema。保留终端完整错误截图后继续排查。
