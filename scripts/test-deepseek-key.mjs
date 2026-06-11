/**
 * Verify AI providers (DeepSeek + OpenRouter fallback). Usage: npm run ai:verify-key
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  const get = (name) => {
    const match = text.match(new RegExp(`^${name}=(.+)$`, "m"));
    if (!match) return undefined;
    return match[1].trim().replace(/^["']|["']$/g, "");
  };
  return {
    deepseek: get("DEEPSEEK_API_KEY"),
    openrouter: get("OPENROUTER_API_KEY"),
    model: get("OPENROUTER_MODEL") ?? "deepseek/deepseek-chat",
    appUrl: get("APP_BASE_URL") ?? "http://localhost:5173",
  };
}

const FALLBACK_STATUSES = new Set([401, 402, 403, 404, 429, 500, 502, 503]);

async function testDeepSeekChat(key) {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body, fallbackEligible: FALLBACK_STATUSES.has(res.status) };
}

async function testOpenRouterChat(key, model, appUrl) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": appUrl,
      "X-Title": "Alyson Training",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

const env = loadEnv();

if (!env.deepseek && !env.openrouter) {
  console.error("Set DEEPSEEK_API_KEY and/or OPENROUTER_API_KEY in .env");
  process.exit(1);
}

let primaryOk = false;

if (env.deepseek) {
  const ds = await testDeepSeekChat(env.deepseek);
  if (ds.ok) {
    console.log("✓ DeepSeek chat is ready (primary)");
    primaryOk = true;
  } else {
    console.log(`✗ DeepSeek chat failed (HTTP ${ds.status})`);
    if (ds.status === 402) console.log("  → insufficient DeepSeek balance");
    if (ds.status === 401) console.log("  → invalid DeepSeek key");
  }
} else {
  console.log("— DEEPSEEK_API_KEY not set");
}

if (!primaryOk) {
  if (!env.openrouter) {
    console.error("\n✗ No working AI provider. Add OPENROUTER_API_KEY for fallback.");
    process.exit(1);
  }

  const or = await testOpenRouterChat(env.openrouter, env.model, env.appUrl);
  if (or.ok) {
    console.log(`✓ OpenRouter chat is ready (fallback, model: ${env.model})`);
    process.exit(0);
  }

  console.error(`\n✗ OpenRouter chat failed (HTTP ${or.status})`);
  console.error(or.body.slice(0, 300));
  console.error("\nCheck OPENROUTER_API_KEY at https://openrouter.ai/keys");
  process.exit(1);
}

process.exit(0);
