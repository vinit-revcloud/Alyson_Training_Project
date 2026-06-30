import process from "node:process";

function sanitizeEnvKey(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^["']|["']$/g, "").trim() || undefined;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Default AWS region — SES identity and S3 bucket are in us-west-2 (Oregon). */
export const DEFAULT_AWS_REGION = "us-west-2";

/** SES send region — prefer SES_REGION, then AWS_REGION. */
export function getSesRegion(): string {
  return (
    process.env.SES_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    DEFAULT_AWS_REGION
  );
}

/** S3 bucket region — prefer S3_ASSETS_REGION, then AWS_REGION. */
export function getS3AssetsRegion(): string {
  return (
    process.env.S3_ASSETS_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    DEFAULT_AWS_REGION
  );
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
    appBaseUrl: resolveAppBaseUrl(),
    bootstrapAdminEmails: getBootstrapAdminEmails(),
  };
}

/** Public origin for emails, magic links, and cron callbacks. */
export function resolveAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:5173";
}

export function getAppBaseUrl(): string {
  return getServerConfig().appBaseUrl;
}
export function assertProductionConfig(): void {
  if (!isProduction()) return;

  const issues: string[] = [];
  const explicitBase = process.env.APP_BASE_URL?.trim();

  if (!explicitBase && !process.env.VERCEL_URL) {
    issues.push("APP_BASE_URL is required in production (set to your custom domain on Vercel)");
  } else if (explicitBase && /localhost|127\.0\.0\.1/i.test(explicitBase)) {
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
  if (!process.env.S3_ASSETS_BUCKET?.trim()) {
    const blobOnly =
      process.env.BLOB_READ_WRITE_TOKEN?.trim() &&
      getConfiguredAssetStorageBackend() === "vercel-blob";
    if (!blobOnly) {
      issues.push("S3_ASSETS_BUCKET is required in production for class PDFs and media");
    }
  }
  if (process.env.VERCEL && getConfiguredAssetStorageBackend() === "local-disk") {
    issues.push(
      "On Vercel, local disk storage is ephemeral — set S3_ASSETS_BUCKET or BLOB_READ_WRITE_TOKEN",
    );
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
    region: getSesRegion(),
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    /** Display name only — From address is always training.group@cintara.ai */
    fromName: process.env.SES_FROM_NAME ?? "Cintara Training",
    configurationSet: process.env.SES_CONFIGURATION_SET,
  };
}

export function getS3AssetsConfig() {
  const ses = getSesConfig();
  const prefix = process.env.S3_ASSETS_PREFIX?.trim().replace(/^\//, "").replace(/\/$/, "");
  return {
    bucket: process.env.S3_ASSETS_BUCKET?.trim() || undefined,
    keyPrefix: prefix || undefined,
    region: getS3AssetsRegion(),
    accessKeyId: ses.accessKeyId,
    secretAccessKey: ses.secretAccessKey,
  };
}

export type AssetStorageBackendKind = "s3" | "vercel-blob" | "local-disk";

/** Resolved asset storage backend (see asset-storage.server.ts). */
export function getConfiguredAssetStorageBackend(): AssetStorageBackendKind {
  const explicit = process.env.ASSET_STORAGE_BACKEND?.trim().toLowerCase();
  if (explicit === "s3") return "s3";
  if (explicit === "local" || explicit === "local-disk") return "local-disk";
  if (explicit === "blob" || explicit === "vercel-blob") return "vercel-blob";
  if (process.env.S3_ASSETS_BUCKET?.trim() && isProduction()) return "s3";
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return "vercel-blob";
  return "local-disk";
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
