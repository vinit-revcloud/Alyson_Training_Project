export function getNeonAuthUrl(): string {
  const url =
    import.meta.env.VITE_NEON_AUTH_URL ||
    process.env.VITE_NEON_AUTH_URL ||
    process.env.NEON_AUTH_URL;
  if (!url) throw new Error("Missing VITE_NEON_AUTH_URL (or NEON_AUTH_URL)");
  return url;
}

export function getNeonDataApiUrl(): string {
  const url =
    import.meta.env.VITE_NEON_DATA_API_URL ||
    process.env.VITE_NEON_DATA_API_URL ||
    process.env.NEON_DATA_API_URL;
  if (!url) throw new Error("Missing VITE_NEON_DATA_API_URL (or NEON_DATA_API_URL)");
  return url;
}

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}
