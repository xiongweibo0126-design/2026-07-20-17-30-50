# TokenBase — Deploy & Go-Live Guide

## 1. Run locally (demo)
```bash
cd server
node server.js
# open http://localhost:3000  -> landing
# open http://localhost:3000/dashboard  -> sign up, get key, buy credits
```
In **sandbox** mode (default) there is no upstream key, so the proxy returns a
synthetic response purely to demonstrate **billing/deduction**. Top-ups are
simulated via `/api/sandbox-pay` — the full money loop works end-to-end without
a merchant account.

## 2. Set YOUR prices
Edit `server/config.js`:
- `pricing` — USD per 1,000,000 tokens, per model (`in` / `out`).
- `packages` — the top-up buttons (price paid = credit added).
- `freeCreditOnSignup` — free credit for new users.

## 3. Connect real domestic model sources
TokenBase only resells **domestic Chinese LLM APIs** (DeepSeek, Qwen/DashScope,
GLM/Zhipu, Kimi/Moonshot, ERNIE/Baidu, MiniMax, StepFun, Doubao/Volcengine). Each
model routes to its provider via `config.providers`. Enable a provider by setting
its API key env var (no code change):
```bash
DEEPSEEK_API_KEY=sk-...      # https://platform.deepseek.com
DASHSCOPE_API_KEY=sk-...     # https://dashscope.console.aliyun.com
ZHIPU_API_KEY=...            # https://open.bigmodel.cn
MOONSHOT_API_KEY=sk-...      # https://platform.moonshot.cn
QIANFAN_API_KEY=...          # https://cloud.baidu.com/product/wenxinworkshop
MINIMAX_API_KEY=...          # https://www.minimaxi.com
STEPFUN_API_KEY=...          # https://platform.stepfun.com
ARK_API_KEY=...              # https://console.volcengine.com/ark
```
A provider with no key automatically falls back to DEMO mode (synthetic
response, real billing deduction) — so you can launch with one provider live
and add the rest later.

## 4. Switch on real payments (Paddle or LemonSqueezy)
Both are **merchant of record** — they handle international VAT/tax for you.

### Paddle
1. Create a Paddle account → create Products/Prices for each package.
2. Set env:
   ```
   PAYMENT_PROVIDER=paddle
   PADDLE_API_KEY=...
   PADDLE_WEBHOOK_SECRET=...      # notification destination secret
   PADDLE_ENV=sandbox             # -> production when live
   PADDLE_PRICE_STARTER=pri_...   # price id per package
   PADDLE_PRICE_PRO=pri_...
   PADDLE_PRICE_SCALE=pri_...
   PADDLE_PRICE_BUSINESS=pri_...
   ```
3. Add webhook destination: `https://your-domain.com/api/webhook/paddle`.

### LemonSqueezy
1. Create store → Products/Variants for each package.
2. Set env:
   ```
   PAYMENT_PROVIDER=lemonsqueezy
   LEMONSQUEEZY_API_KEY=...
   LEMONSQUEEZY_WEBHOOK_SECRET=...
   LS_STORE_ID=...
   LS_VAR_STARTER=...             # variant id per package
   LS_VAR_PRO=...
   LS_VAR_SCALE=...
   LS_VAR_BUSINESS=...
   ```
3. Add webhook: `https://your-domain.com/api/webhook/lemonsqueezy`.

Set a return URL in the provider dashboard pointing to `/dashboard`.

## 5. Deploy (pick one)
The server is a single Node process with no dependencies.
- **Render / Railway / Fly.io / Render**: connect the repo, start command `node server/server.js`, expose `$PORT`.
- **Vercel**: wrap with a small `vercel.json` serverless handler (or use a Node runtime).
- **VPS (any)**: `node server/server.js` behind Nginx/Caddy + HTTPS, or use the
  CloudStudio deploy for a quick static+server sandbox.

Required env on the host: `PORT`, the provider keys above, and payment vars.
Persist `server/data.json` (volume / disk) so balances survive restarts.

## 6. Domain + HTTPS
Point your domain (e.g. `tokenbase.ai`) at the host, enable HTTPS (auto on
Render/Vercel/Caddy). Update the dashboard snippet host automatically uses `location.host`.

## ⚠️ Compliance note
This product resells **domestic Chinese LLM APIs only** — a much lower-risk
posture than reselling OpenAI/Anthropic. Still:
- Source tokens through each vendor's **official API platform / partner program**
  (Aliyun DashScope, Zhipu OpenPlatform, Moonshot, Baidu Qianfan, Volcengine
  ARK, etc.) — do not violate their distribution terms.
- Keep **multi-provider fail-over** so a single vendor outage never breaks
  your customers.
- Add Terms / Privacy / DPA and a clear "not affiliated with the vendors"
  disclaimer (already in the footer).
- Consult legal before scaling paid volume in your target markets.
