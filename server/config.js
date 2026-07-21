/**
 * TokenBase — editable configuration
 * ============================================================
 * This is the ONLY file you normally need to touch to set your
 * own prices. Everything is in USD.
 *
 * 1) MODELS   — the catalogue shown to customers (DOMESTIC
 *    Chinese LLMs only: DeepSeek, Qwen, GLM, Kimi, ERNIE,
 *    MiniMax, StepFun, Doubao...). Each model maps to a provider.
 *
 * 2) PRICING  — what you CHARGE per 1,000,000 tokens, per model.
 *    "in"  = prompt / input tokens
 *    "out" = completion / output tokens
 *    Requests for a model not listed fall back to `default`.
 *    >>> These are PLACEHOLDERS — set your own margins here. <<<
 *
 * 3) PROVIDERS — where TokenBase forwards the real model calls.
 *    Every provider below speaks the OpenAI-compatible protocol,
 *    so the proxy just routes by model. Fill each API key via env
 *    in production (never hard-code secrets here).
 *
 * 4) PACKAGES — the top-up buttons shown in the dashboard.
 *    price   = amount the customer pays (USD)
 *    credit  = balance added to their account (USD)
 * ============================================================
 */

module.exports = {
  // Server port (override with PORT env var)
  port: process.env.PORT || 3000,

  currency: 'USD',

  // Free credit granted to every new account (USD)
  freeCreditOnSignup: 5,

  // ---- MODEL CATALOGUE (domestic LLMs) ----
  // id            = model name your customers send in `model:`
  // label/by      = display name / vendor (shown in UI)
  // provider      = key into `providers` below
  // context       = max context window (tokens)
  // upstreamModel = optional: real model name sent upstream
  //                 (omit if it equals `id`)
  models: [
    { id: 'deepseek-chat',      label: 'DeepSeek V3',   by: 'DeepSeek',  provider: 'deepseek', context: 64000,  desc: 'Top open model, coding & reasoning' },
    { id: 'deepseek-reasoner',  label: 'DeepSeek R1',   by: 'DeepSeek',  provider: 'deepseek', context: 64000,  desc: 'Chain-of-thought reasoning', upstreamModel: 'deepseek-reasoner' },
    { id: 'qwen-max',           label: 'Qwen-Max',      by: 'Alibaba',   provider: 'qwen',     context: 32768,  desc: 'Flagship, strong multilingual' },
    { id: 'qwen-plus',          label: 'Qwen-Plus',     by: 'Alibaba',   provider: 'qwen',     context: 131072, desc: 'Balanced cost/quality' },
    { id: 'qwen-turbo',         label: 'Qwen-Turbo',    by: 'Alibaba',   provider: 'qwen',     context: 131072, desc: 'Ultra-low latency' },
    { id: 'glm-4-plus',         label: 'GLM-4-Plus',    by: 'Zhipu AI',  provider: 'zhipu',    context: 128000, desc: 'Long-context, agent ready' },
    { id: 'glm-4-air',          label: 'GLM-4-Air',     by: 'Zhipu AI',  provider: 'zhipu',    context: 128000, desc: 'Cheap everyday model' },
    { id: 'moonshot-v1-8k',     label: 'Kimi',          by: 'Moonshot',  provider: 'moonshot', context: 8192,   desc: 'Long-document understanding' },
    { id: 'ernie-4.0-8k',       label: 'ERNIE 4.0',     by: 'Baidu',     provider: 'baidu',    context: 8192,   desc: 'Strong Chinese semantic' },
    { id: 'abab6.5s-chat',      label: 'MiniMax',       by: 'MiniMax',   provider: 'minimax',  context: 24576,  desc: 'Multimodal capable' },
    { id: 'step-1v-mini',       label: 'StepFun',       by: 'StepFun',   provider: 'stepfun',  context: 32000,  desc: 'Fast general model' },
    { id: 'doubao-pro',         label: 'Doubao Pro',    by: 'ByteDance', provider: 'doubao',   context: 128000, desc: 'Volcengine ARK', upstreamModel: 'doubao-pro-32k' },
  ],

  // ---- YOU SET THESE PRICES (USD per 1,000,000 tokens) ----
  // PLACEHOLDERS — adjust to your wholesale cost + desired margin.
  pricing: {
    'deepseek-chat':     { in: 0.14,  out: 0.55 },
    'deepseek-reasoner': { in: 0.30,  out: 1.10 },
    'qwen-max':          { in: 0.80,  out: 2.40 },
    'qwen-plus':         { in: 0.20,  out: 0.60 },
    'qwen-turbo':        { in: 0.05,  out: 0.15 },
    'glm-4-plus':        { in: 0.40,  out: 1.20 },
    'glm-4-air':         { in: 0.10,  out: 0.30 },
    'moonshot-v1-8k':    { in: 0.18,  out: 0.70 },
    'ernie-4.0-8k':      { in: 0.45,  out: 0.90 },
    'abab6.5s-chat':     { in: 0.35,  out: 1.05 },
    'step-1v-mini':      { in: 0.12,  out: 0.36 },
    'doubao-pro':        { in: 0.30,  out: 0.90 },
    'default':           { in: 0.50,  out: 1.50 },
  },

  // ---- UPSTREAM PROVIDERS (OpenAI-compatible) ----
  // baseUrl = full prefix; the proxy strips `/v1` from the incoming
  // path and appends the rest (e.g. `/chat/completions`).
  // apiKey is read from env — leave empty for DEMO mode per provider.
  providers: {
    deepseek: { baseUrl: 'https://api.deepseek.com/v1',         apiKey: process.env.DEEPSEEK_API_KEY  || '' },
    qwen:     { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: process.env.DASHSCOPE_API_KEY || '' },
    zhipu:    { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: process.env.ZHIPU_API_KEY     || '' },
    moonshot: { baseUrl: 'https://api.moonshot.cn/v1',          apiKey: process.env.MOONSHOT_API_KEY  || '' },
    baidu:    { baseUrl: 'https://qianfan.baidubce.com/v2',     apiKey: process.env.QIANFAN_API_KEY   || '' },
    minimax:  { baseUrl: 'https://api.minimax.chat/v1',         apiKey: process.env.MINIMAX_API_KEY   || '' },
    stepfun:  { baseUrl: 'https://api.stepfun.com/v1',          apiKey: process.env.STEPFUN_API_KEY   || '' },
    doubao:   { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: process.env.ARK_API_KEY  || '' },
  },

  // ---- TOP-UP PACKAGES (price paid = credit added, in USD) ----
  // Keep this in sync with the products you created in Paddle.
  packages: [
    { id: 'starter',  name: '$5 Starter',    price: 5,   credit: 5 },
    { id: 'pro',      name: '$20 Pro',        price: 20,  credit: 20 },
    { id: 'scale',    name: '$100 Scale',     price: 100, credit: 100 },
  ],

  // ---- PAYMENT PROVIDER ----
  // 'sandbox'        -> simulated checkout, no merchant account needed (default for local demo)
  // 'paddle'         -> Paddle Billing (merchant of record)
  // 'lemonsqueezy'   -> LemonSqueezy (merchant of record)
  paymentProvider: process.env.PAYMENT_PROVIDER || 'sandbox',

  paddle: {
    apiKey: process.env.PADDLE_API_KEY || '',
    webhookSecret: process.env.PADDLE_WEBHOOK_SECRET || '',
    clientToken: process.env.PADDLE_CLIENT_TOKEN || '',  // for Paddle.js overlay checkout
    env: process.env.PADDLE_ENV || 'sandbox', // 'sandbox' | 'production'
    prices: {
      starter:  process.env.PADDLE_PRICE_STARTER  || '',
      pro:      process.env.PADDLE_PRICE_PRO      || '',
      scale:    process.env.PADDLE_PRICE_SCALE    || '',
    },
  },

  lemonsqueezy: {
    apiKey: process.env.LEMONSQUEEZY_API_KEY || '',
    webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '',
    storeId: process.env.LS_STORE_ID || '',
    variants: {
      starter:  process.env.LS_VAR_STARTER  || '',
      pro:      process.env.LS_VAR_PRO      || '',
      scale:    process.env.LS_VAR_SCALE    || '',
    },
  },
};
