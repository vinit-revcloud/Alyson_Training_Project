import process from "node:process";

function sanitizeEnvKey(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^["']|["']$/g, "").trim() || undefined;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Comma-separated @cintara.ai emails that receive admin+trainer without an invite (initial setup only). */
export function getBootstrapAdminEmails(): string[] {
  const raw = process.env.BOOTSTRAP_ADMIN_EMAILS?.trim();
  if (!raw) {
    return isProduction() ? [] : ["admin@cintara.ai"];
  }
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    appBaseUrl: process.env.APP_BASE_URL?.trim() || "http://localhost:5173",
    bootstrapAdminEmails: getBootstrapAdminEmails(),
  };
}

export function getAppBaseUrl(): string {
  return getServerConfig().appBaseUrl;
}

/** Fail fast when required production env is missing or unsafe. */
export function assertProductionConfig(): void {
  if (!isProduction()) return;

  const issues: string[] = [];
  const appBaseUrl = process.env.APP_BASE_URL?.trim();

  if (!appBaseUrl) {
    issues.push("APP_BASE_URL is required in production");
  } else if (/localhost|127\.0\.0\.1/i.test(appBaseUrl)) {
    issues.push("APP_BASE_URL must not point to localhost in production");
  }

  if (!process.env.CRON_SECRET?.trim()) issues.push("CRON_SECRET is required in production");
  if (!process.env.DATABASE_URL?.trim()) issues.push("DATABASE_URL is required in production");
  if (!process.env.VITE_NEON_AUTH_URL?.trim() && !process.env.NEON_AUTH_URL?.trim()) {
    issues.push("VITE_NEON_AUTH_URL (or NEON_AUTH_URL) is required in production");
  }
  if (!process.env.VITE_NEON_DATA_API_URL?.trim() && !process.env.NEON_DATA_API_URL?.trim()) {
    issues.push("VITE_NEON_DATA_API_URL (or NEON_DATA_API_URL) is required in production");
  }
  if (!process.env.AWS_ACCESS_KEY_ID?.trim() || !process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
    issues.push("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required in production");
  }
  if (!getDeepSeekApiKey() && !getOpenRouterApiKey()) {
    issues.push("DEEPSEEK_API_KEY or OPENROUTER_API_KEY is required in production");
  }
  if (process.env.EMAIL_AUTO_PROCESS === "1") {
    issues.push("EMAIL_AUTO_PROCESS must be disabled in production (unset or 0)");
  }

  if (issues.length) {
    throw new Error(`Production configuration invalid:\n- ${issues.join("\n- ")}`);
  }
}

export function getSesConfig() {
  return {
    region: process.env.AWS_REGION ?? "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    /** Display name only — From address is always training.group@cintara.ai */
    fromName: process.env.SES_FROM_NAME ?? "Cintara Training",
    configurationSet: process.env.SES_CONFIGURATION_SET,
  };
}

export function getDeepSeekApiKey(): string | undefined {
  return sanitizeEnvKey(process.env.DEEPSEEK_API_KEY);
}

export function getOpenRouterApiKey(): string | undefined {
  return sanitizeEnvKey(process.env.OPENROUTER_API_KEY);
}

/** OpenRouter model id — defaults to DeepSeek Chat via OpenRouter. */
export function getOpenRouterModel(): string {
  return sanitizeEnvKey(process.env.OPENROUTER_MODEL) ?? "deepseek/deepseek-chat";
}

export function getOpenRouterVisionModel(): string {
  return (
    sanitizeEnvKey(process.env.OPENROUTER_VISION_MODEL) ?? "google/gemini-2.0-flash-001"
  );
}
