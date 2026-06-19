function readProcessEnv(...keys: string[]): string | undefined {
  if (typeof process === "undefined") return undefined;
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function readClientEnv(key: string): string | undefined {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function getNeonAuthUrl(): string {
  const isServer = typeof window === "undefined";
  const url = isServer
    ? readProcessEnv("NEON_AUTH_URL", "VITE_NEON_AUTH_URL") ?? readClientEnv("VITE_NEON_AUTH_URL")
    : readClientEnv("VITE_NEON_AUTH_URL") ?? readProcessEnv("VITE_NEON_AUTH_URL", "NEON_AUTH_URL");
  if (!url) throw new Error("Missing VITE_NEON_AUTH_URL (or NEON_AUTH_URL)");
  return url;
}

export function getNeonDataApiUrl(): string {
  const isServer = typeof window === "undefined";
  const url = isServer
    ? readProcessEnv("NEON_DATA_API_URL", "VITE_NEON_DATA_API_URL") ??
      readClientEnv("VITE_NEON_DATA_API_URL")
    : readClientEnv("VITE_NEON_DATA_API_URL") ??
      readProcessEnv("VITE_NEON_DATA_API_URL", "NEON_DATA_API_URL");
  if (!url) throw new Error("Missing VITE_NEON_DATA_API_URL (or NEON_DATA_API_URL)");
  return url;
}

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}
