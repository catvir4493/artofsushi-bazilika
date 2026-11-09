# 上线与维护说明（Marcell）

网站：Cloudflare Pages · 域名：artofsushibp.hu（Rackhost 注册）· 后台：Pages CMS · 订桌：Google 表格（见 `apps-script/README.md`）· 邮箱：artofsushi.szentistvan@gmail.com

## 1. Cloudflare：接管域名 DNS

1. 用店里的邮箱注册 Cloudflare（免费版），**Add a domain** → `artofsushibp.hu` → 选 Free。
2. Cloudflare 会给两个 nameserver（例如 `xxx.ns.cloudflare.com`）。
3. 登录 Rackhost → 域名 → artofsushibp.hu → **Névszerverek（DNS szerverek）** 改成这两个。生效一般几小时，最多 24–48 小时。
4. 在 Cloudflare 把 Marcell 加为成员：**Manage account → Members**。

## 2. Cloudflare Pages：部署网站

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**，授权 GitHub，选 `catvir4493/artofsushi-bazilika`。
2. 构建设置：
   - Production branch：`main`
   - Framework preset：None
   - Build command：`node scripts/build.mjs`
   - Build output directory：`dist`
3. 部署完成后得到 `xxx.pages.dev` 地址，先在这个地址上检查一遍。
4. **Custom domains** → 添加 `artofsushibp.hu` 和 `www.artofsushibp.hu`。
5. www 跳转：Cloudflare → artofsushibp.hu → **Rules → Redirect Rules**，模板「Redirect from WWW to root」。

以后每次往 `main` 推送（包括老板在后台点保存），Cloudflare 自动重新构建，约 1 分钟上线。构建失败时旧版本继续在线，错误在 Pages 的 Deployments 里能看到。

## 3. Turnstile（订桌防垃圾）

1. Cloudflare → **Turnstile → Add widget**，域名填 `artofsushibp.hu`，模式 Managed。
2. Site key 填进 `js/main.js` 的 `CONFIG.TURNSTILE_SITEKEY`；Secret key 填进 Apps Script 的脚本属性 `TURNSTILE_SECRET`。两个要同时生效。

## 4. 邮箱

订桌通知和客人邮件都用店里现有的 Gmail：`artofsushi.szentistvan@gmail.com`（不另开 Google Workspace，不需要在 Cloudflare 加 MX 记录）。

- 免费 Gmail 通过 Apps Script 每天约能发 100 封邮件，约等于每天 30 个订桌。以后订桌多了再升级 Google Workspace。
- 以后如果想要 `foglalas@artofsushibp.hu` 这样的地址，可以用 Cloudflare 免费的 **Email Routing** 转发到这个 Gmail。

然后按 `apps-script/README.md` 建订桌表格。

## 5. Pages CMS：给老板的后台

1. 打开 https://app.pagescms.org ，用 Marcell 的 GitHub 登录，安装 Pages CMS 的 GitHub App 到本仓库。
2. 选仓库和 `main` 分支，左侧会出现：营业信息、价格、公告、菜单与主厨推荐、画廊照片、介绍文字。
3. **Collaborators** → 用老板的邮箱邀请。老板收到邮件后用邮箱登录，不需要 GitHub 账号。
4. 每次保存都是一次 GitHub 提交；改坏了在 GitHub 上找到那次提交 Revert 即可。
5. 老板（Collaborator）只能改内容和上传图片，改不了 `.pages.yml`，也不能邀请别人；Pages CMS 的 GitHub App 必须一直装在本仓库上，老板的保存才能提交。
6. 保护：图片找不到、时间格式不对、日期格式不对时构建会失败，旧版网站继续在线（Cloudflare Pages → Deployments 里能看到原因）。图片超过 1.5 MB 只会在构建日志里警告。

后台能改的内容在 `content/*.json`，字段定义在 `.pages.yml`，页面上的对应位置用 `data-cms` 标记（见 `scripts/build.mjs` 顶部说明）。

## 6. 上线前检查

- `impresszum.html`、`adatkezeles.html` 里所有 `[ … ]` 填上公司信息。
- `js/main.js` 的 `FORM_ENDPOINT` 填上 Apps Script 地址，测试一次订桌。
- 社交媒体链接（后台「营业信息」）换成新店账号。
- 手机和电脑各打开一遍，测试中英切换。
- Google Search Console 添加 artofsushibp.hu，提交 `https://artofsushibp.hu/sitemap.xml`。
- Google 商家资料（Google Business Profile）里填网站地址。

## 本地预览

- 直接双击 `index.html` 可以看（显示的是 HTML 里的默认文字）。
- 想看后台内容生效后的样子：`node scripts/build.mjs`，然后打开 `dist/index.html`。
