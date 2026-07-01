import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";

import { getSignedAssetUrlFn } from "@/lib/asset.functions";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import { useRefreshableAssetUrl } from "@/lib/useRefreshableAssetUrl";

type SignedAssetImageProps = {
  bucket: AssetBucket;
  storagePath: string;
  alt: string;
  className?: string;
};

export function SignedAssetImage({ bucket, storagePath, alt, className }: SignedAssetImageProps) {
  const signFn = useServerFn(getSignedAssetUrlFn);
  const [initialUrl, setInitialUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void signFn({ data: { bucket, storagePath } })
      .then(({ url }) => {
        if (!cancelled) setInitialUrl(url);
      })
      .catch(() => {
        if (!cancelled) setInitialUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, storagePath, signFn]);

  const resign = useCallback(async () => {
    try {
      const { url } = await signFn({ data: { bucket, storagePath } });
      return url;
    } catch {
      return null;
    }
  }, [signFn, bucket, storagePath]);

  const { url, onMediaError } = useRefreshableAssetUrl(initialUrl, resign);

  if (!url) {
    return <div className={className} aria-label={alt} />;
  }

  return <img src={url} alt={alt} className={className} onError={onMediaError} />;
}
