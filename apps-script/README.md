# 订桌后台：Google 表格 + Apps Script

网站的订桌表单把数据发到这里的 Apps Script，脚本写进 Google 表格，并发两封邮件：一封通知店里（回复地址是客人邮箱），一封自动回执给客人。表格里的「Foglalás」菜单可以给选中的那一行发确认或拒绝邮件。

## 一次性设置（约 15 分钟）

所有步骤都用**店里的 Google 账号** `artofsushi.szentistvan@gmail.com` 做。客人收到的邮件会从这个地址发出。

> 免费 Gmail 账号用 Apps Script 发邮件每天上限约 100 封。每个订桌发 2 封（通知 + 回执），确认时再发 1 封，所以每天大约能处理 30 个订桌。超过的话订桌仍会写进表格，只是邮件发不出去，需要换成 Google Workspace。

1. 在 Google Drive 新建一个表格，命名为 `Foglalások – Bazilika`。
2. 菜单 **扩展程序 → Apps Script**，打开脚本编辑器。
3. 删掉默认的 `Code.gs` 内容，把本文件夹里的 `Code.gs` 全部粘贴进去。
4. 左侧齿轮 **项目设置**：
   - 勾选「在编辑器中显示 appsscript.json」，把本文件夹的 `appsscript.json` 内容粘贴进去（时区 Europe/Budapest）。
   - 在「脚本属性」里添加：
     - `NOTIFY_EMAIL` = 接收订桌通知的邮箱，`artofsushi.szentistvan@gmail.com`
     - `TURNSTILE_SECRET` = Cloudflare Turnstile 的 Secret key（可以等 Cloudflare 开好再加）
5. 回到表格，刷新页面，顶部出现「Foglalás」菜单。点 **Foglalás → Első beállítás**，按提示授权。会自动：
   - 建好表头、状态下拉、颜色
   - 新建「Ma」（今天）和「Holnap」（明天）两个视图页
   - 设置每天 4:00 自动删除用餐日期超过 90 天的记录（GDPR）
6. 脚本编辑器右上角 **部署 → 新建部署 → 类型：Web 应用**
   - 执行身份：**我**
   - 有权访问的用户：**任何人**
   - 部署后复制「Web 应用 URL」（以 `/exec` 结尾）。
7. 把这个 URL 填进网站 `js/main.js` 顶部的 `CONFIG.FORM_ENDPOINT`，提交并推送。
8. 在网站上用自己的邮箱提交一次测试订桌，检查：表格多一行、店里收到通知、自己收到回执；再用菜单发一次确认邮件。

> 以后修改 `Code.gs` 后，要在 **部署 → 管理部署 → 编辑 → 版本：新版本** 重新部署，URL 不变。

## 更新脚本（Code.gs 有改动时）

1. 表格里 **扩展程序 → Apps Script**，把编辑器里的 `Code.gs` 全部删掉，粘贴仓库里最新的 `apps-script/Code.gs`，点保存。
2. 右上 **部署 → 管理部署** → 选中现有部署 → 铅笔（编辑）→ 版本选 **新版本** → 部署。网址不变，网站不用改。
3. 回到表格刷新页面，菜单 **Foglalás 订桌 → Beállítás / frissítés · 设置/更新** 跑一次：表头和状态会变成匈中双语，旧状态自动转换，K/L/M 三列隐藏，“今天/明天”视图重建。

## 日常使用

- 新订桌：状态「Új」，橙色。
- 选中那一行任意格子 → **Foglalás → ✓ Visszaigazolás küldése**：给客人发确认邮件，状态变「Visszaigazolva」。
- **✕ Elutasítás küldése**：发「没有空桌」的邮件，状态变「Elutasítva」。
- 用餐后可以手动把状态改成「Megjelent」（已到店）或「Nem jelent meg」（未到店）。
- 店里通知邮件里直接点「回复」就是回给客人。
- 客人在英文页面下单，所有邮件自动用英文。

## 字段

| 列 | 说明 |
|---|---|
| Beérkezett | 提交时间 |
| Dátum / Időpont / Létszám | 用餐日期、时间、人数 |
| Név / Telefon / Email | 客人信息 |
| Egyéb kérés | 客人备注 |
| Nyelv | HU / EN，决定邮件语言 |
| Állapot | Új · Visszaigazolva · Elutasítva · Megjelent · Nem jelent meg |
| Kezelte | 谁发的确认 |
| Belső megjegyzés | 店内备注，客人看不到 |
| Azonosító | 订单编号 |

## 防垃圾

- 表单里有一个隐藏字段，机器人填了就直接丢弃。
- 设置了 `TURNSTILE_SECRET` 后，每个提交都必须通过 Cloudflare Turnstile 验证；同时要在 `js/main.js` 填 `CONFIG.TURNSTILE_SITEKEY`。两个要一起填，只填一个会导致订桌失败。
