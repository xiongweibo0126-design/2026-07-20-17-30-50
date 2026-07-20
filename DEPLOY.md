# TokenBase 上线傻瓜教程（技术小白也能看懂）

> 结论先说：这个网站**不需要你会写代码**就能上线。你只需要注册两个网站账号、用鼠标点几下、最后粘贴几串"钥匙"。全程不用敲命令。
> 而且**今天就能先上线**——不填任何钥匙也能跑（演示模式），等你想认真做再加钥匙。

---

## 你准备好的东西
- 一台能上网的电脑
- 一个常用邮箱
- 网站名字（先不用买域名，部署平台会先给你一个免费网址，比如 `xxx.up.railway.app`）

---

## 第 1 步：把网站代码存到 GitHub（图形界面，不用命令）

GitHub 相当于一个"网盘"，专门放代码。我们用它的图形软件，不敲命令。

1. 打开 [github.com](https://github.com)，用邮箱注册一个账号。
2. 下载安装 **GitHub Desktop**：[desktop.github.com](https://desktop.github.com) ，装好后登录同一个账号。
3. 打开 GitHub Desktop → 菜单 **File → Add Local Repository** → 选择 **这个网站所在的文件夹**（就是 WorkBuddy 里 `2026-07-20-17-30-50` 这个文件夹）。
4. 左上角填一个仓库名（比如 `tokenbase`），点 **Create & Add Repository**。
5. 窗口右上角点 **Publish repository**：
   - 去掉 "Keep this code private" 的勾（公开才能免费部署）
   - 点 **Publish**
6. 浏览器打开 github.com，能看到你的 `tokenbase` 仓库了 → 代码已经在网上了。✅

---

## 第 2 步：在 Railway 一键部署（免费，自动给你网址）

Railway 是一台"云电脑"，会一直帮你运行这个网站。它识别 Node 项目，点几下就上线。

1. 打开 [railway.app](https://railway.app) ，用 **GitHub 账号** 登录（就是第 1 步注册的那个）。
2. 点 **New Project → Deploy from GitHub repo**，选中刚才的 `tokenbase` 仓库。
3. 等 1–2 分钟，Railway 会自动构建并启动（它读的是我们准备好的 `railway.json` 和 `package.json`，不用你配）。
4. 项目页面顶部会显示一个网址，形如 `https://xxx.up.railway.app` → 点它，**你的网站已经上线了！** 🎉

此时网站已经能：
- 注册账号、自动领 $5 额度
- 调用模型（演示模式返回示例结果，用来走通流程）
- 点 "Buy credits" 走模拟支付，余额会加上去

> 想先 2 分钟看看首页长什么样？也可以打开 [app.netlify.com/drop](https://app.netlify.com/drop) 把这个文件夹拖进去（仅预览首页外观，后台/支付不会工作）。正式用还是走上面的 Railway。

---

## 第 3 步：让网站"真正能用"（填几把钥匙，没有就不填）

在 Railway 项目里：点 **Variables**（变量）标签 → **New Variable**，按下面逐个添加。**不填的项直接跳过**，网站不会坏。

### A. 让模型返回真实结果（至少填一个）
去对应国内厂商官网注册 → 开通 API → 复制 Key，回来粘贴：

| 变量名 | 去哪里拿 Key |
|---|---|
| `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com) |
| `DASHSCOPE_API_KEY` | 阿里云百炼 [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com) |
| `ZHIPU_API_KEY` | 智谱 [open.bigmodel.cn](https://open.bigmodel.cn) |
| `MOONSHOT_API_KEY` | Kimi [platform.moonshot.cn](https://platform.moonshot.cn) |
| `QIANFAN_API_KEY` | 百度智能云千帆 |
| `MINIMAX_API_KEY` | [minimax.chat](https://www.minimax.chat) |
| `STEPFUN_API_KEY` | [platform.stepfun.com](https://platform.stepfun.com) |
| `ARK_API_KEY` | 火山方舟（豆包） |

填完后，Railway 会自动重新部署。再调模型就是**真实结果**了。

### B. 真正收钱（二选一，推荐 Paddle）
- **Paddle（推荐，自动算各国增值税/税，最省心）**
  1. 去 [paddle.com](https://www.paddle.com) 注册**商户**账号。
  2. 在后台创建 Product 和 Price（金额对应你 `config.js` 里的套餐），拿到：
     - API Key、`PADDLE_WEBHOOK_SECRET`、四个 Price ID
  3. 在 Railway Variables 加：
     - `PAYMENT_PROVIDER=paddle`
     - `PADDLE_API_KEY=...`
     - `PADDLE_WEBHOOK_SECRET=...`
     - `PADDLE_ENV=sandbox`（先测试用 sandbox；正式收钱改成 `production`）
     - `PADDLE_PRICE_STARTER=...`、`PADDLE_PRICE_PRO=...`、`PADDLE_PRICE_SCALE=...`、`PADDLE_PRICE_BUSINESS=...`
  4. 在 Paddle 后台把 **Webhook 网址** 设为：`你的网址/api/webhook/paddle`
- **LemonSqueezy（类似）**
  - 加 `PAYMENT_PROVIDER=lemonsqueezy` 和 `LS_*` 系列变量（`LEMONSQUEEZY_API_KEY`、`LEMONSQUEEZY_WEBHOOK_SECRET`、`LS_STORE_ID`、`LS_VAR_STARTER/PRO/SCALE/BUSINESS`）
  - Webhook 网址设为：`你的网址/api/webhook/lemonsqueezy`

---

## 第 4 步（可选）：绑定自己的域名
1. 买个域名（如 [namecheap.com](https://www.namecheap.com) / 阿里云 / [cloudflare.com](https://www.cloudflare.com) ）。
2. 在 Railway → **Settings → Domains**，填入你的域名，按提示去域名商后台加一条 **CNAME** 记录。
3. 等几分钟，用你的域名访问即可。

---

## ⚠️ 上线前必须知道的事（重要）

1. **数据存哪里**：现在客户的余额存在服务器的一个文件里，网站重启可能清空。**正式做生意前**，要把存储换成数据库（Supabase / Neon，Railway 里点一下就能加，我可以帮你改）。
2. **合规**：我们只转售**国内大模型**（DeepSeek / Qwen / GLM / Kimi 等），它们都开放 API、有合作伙伴机制，比转售 OpenAI 风险小很多。但规模做大前，仍建议咨询下法务。
3. **定价你定**：每个模型卖多少钱，都在 `server/config.js` 的 `pricing` 里（美元 / 百万 token）。套餐金额在 `packages` 里。
4. **先自测再推广**：上线后自己注册一次、调一次模型、买一次，确认整条链路 OK，再对外发广告。

---

## 卡住了怎么办
每一步截图发给我，我手把手带你点；或者你开着自己的 GitHub / Railway 页面，我一步步说你点哪里。不用怕，全程不用写代码。
