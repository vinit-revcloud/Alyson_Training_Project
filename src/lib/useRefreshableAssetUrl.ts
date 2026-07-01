import { useCallback, useEffect, useRef, useState } from "react";

/** Refresh a signed asset URL before expiry or after load errors (long study sessions). */
export function useRefreshableAssetUrl(
  initialUrl: string | null,
  resign: () => Promise<string | null>,
  refreshBeforeMs = 50 * 60 * 1000,
): { url: string | null; onMediaError: () => void } {
  const [url, setUrl] = useState(initialUrl);
  const resignRef = useRef(resign);
  resignRef.current = resign;

  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    if (!url) return;
    const timer = setTimeout(() => {
      void resignRef.current().then((next) => {
        if (next) setUrl(next);
      });
    }, refreshBeforeMs);
    return () => clearTimeout(timer);
  }, [url, refreshBeforeMs]);

  const onMediaError = useCallback(() => {
    void resignRef.current().then((next) => {
      if (next) setUrl(next);
    });
  }, []);

  return { url, onMediaError };
}
