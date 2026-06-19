# 菩提卦馆 2026-06-19 Codex 工作进度固定

> 这份记录用于下次继续工作。用户说“继续今天 Codex 进度”或“继续 6 月 19 日 Codex 进度”时，从这里接着处理。

## 当前状态

截至本记录创建时，Codex 已完成并合并两个 PR 到 `main`：

### PR #2：Fix recharge user ID and package QR matching

状态：已合并。

主要内容：

- 前台购买弹窗显示当前客户 ID。
- 增加“复制客户ID”和“生成新客户ID”操作。
- 继续使用浏览器 `localStorage` 中固定的 `puti_user_id`，避免每次购买随机换 ID 导致充值加错账户。
- 新客户 ID 只在用户主动确认点击时生成。
- 公共接口创建订单时返回按商品/套餐匹配的收款码。
- 后台订单列表增加按状态、商品、用户 ID、关键词筛选。
- 后台收款码管理扩展支持绑定：`product_id`、`amount`。
- 数据库迁移增加 qrcodes 表字段：`product_id`、`amount`。

需要注意：

- 晚上部署前，必须确认迁移脚本是否需要在线上 MySQL 执行。
- 如果线上 qrcodes 表没有 `product_id` 和 `amount` 字段，部署后相关接口可能报错。

### PR #3：Fix public site product structure

状态：已合并。

主要内容：

- 参考 `https://putiyuan.pages.dev/` 调整前台首页结构。
- 增加/调整九项服务入口：为家人祈福、今日黄历、周公解梦、关帝灵签、八字精批、六爻占卜、手相/面相、宝宝起名、静心禅坐。
- 调整首页 Hero、产品卡片、典籍说明、信任说明、服务入口文案。
- 修改 `index.html` 和 `puti-gua.html`。
- Codex 测试：前端脚本 `node --check` 通过，`git diff --check` 通过，临时静态服务 curl 可打开。

重要风险：

- PR #3 的说明中提到把站点名称改成了一个错误品牌名。这与用户已确定的项目名「菩提卦馆」冲突。
- 下一步必须先检查 `index.html`、`puti-gua.html`、`admin.html` 是否出现错误品牌名，并统一改回“菩提卦馆”。
- 不要直接上线前台，先本地/服务器预览确认品牌名和页面没有被改坏。

## 尚未完成 / 晚上继续事项

1. 检查 GitHub 最新 `main`：
   - 确认 PR #2、PR #3 均已合并。
   - 查看最新 commit 列表。

2. 检查品牌名：
   - 全仓库搜索错误品牌名。
   - 所有对外展示处应统一为“菩提卦馆”。
   - 参考站点只作结构参考，不应改成其他品牌名。

3. 检查数据库迁移：
   - 找到 Codex 新增的 migration。
   - 如果 qrcodes 需要新增 `product_id`、`amount` 字段，线上 MySQL 必须执行迁移。
   - 执行前先备份或至少确认字段不存在。

4. 服务器部署步骤：

```bash
cd /var/www/puti-gua-backend
git pull origin main
npm install
pm2 restart puti-gua-backend --update-env
pm2 save
pm2 status
```

5. 如有 migration，需要执行类似：

```bash
cd /var/www/puti-gua-backend
mysql -u root -p puti_gua < database/migrations/对应文件.sql
```

实际数据库名、迁移文件名需要先确认，不要盲目执行。

6. 部署后测试：

- 打开 `https://putiguaguan.fun`，Ctrl+F5。
- 检查前台品牌是否为「菩提卦馆」。
- 进入购买弹窗，确认显示当前客户 ID。
- 测试“复制客户ID”。
- 谨慎测试“生成新客户ID”，确认有提醒。
- 选择 19.90 / 29.90 / 69.90 套餐，确认显示对应二维码：
  - `qrcode_19_90.jpg`
  - `qrcode_29_90.jpg`
  - `qrcode_69_90.jpg`
- 创建测试订单，后台订单审核能看到：用户 ID、套餐、金额、状态、付款截图。
- 后台确认付款后，正确用户自动增加次数。
- 前台问卦后正确扣次数。

7. 后台测试：

- 打开 `https://api.putiguaguan.fun/admin`。
- Ctrl+F5。
- 测试订单筛选：状态、商品、用户 ID、关键词。
- 测试收款码绑定商品/金额。
- 确认 ADMIN_TOKEN 鉴权仍正常。

## 当前线上服务器尚未部署 Codex 合并后的代码

用户已说明：截止目前已点合并，晚上再来处理，Codex 也一样。

因此：

- GitHub main 可能已有 Codex 代码。
- 服务器 `/var/www/puti-gua-backend` 很可能还没 `git pull`。
- 线上网站未必已更新。
- 晚上继续时先检查仓库，再部署，不要重复让 Codex 改同一批内容。

## 常用检查命令

```bash
cd /var/www/puti-gua-backend
git log --oneline -8
git status
rg -n "错误品牌名" index.html puti-gua.html admin.html src docs || true
grep -R "product_id\|amount" -n database/migrations src/controllers admin.html || true
```

## 结论

Codex 代码层面已完成两项任务并合并，但尚未进行线上部署和完整人工验收。下一步优先是：

1. 统一品牌名为「菩提卦馆」。
2. 确认/执行数据库迁移。
3. 部署到服务器。
4. 完整测试充值、订单、二维码、用户 ID、后台确认加次数流程。
