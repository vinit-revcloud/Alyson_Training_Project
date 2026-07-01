import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { getSignedAssetUrlFn } from "@/lib/asset.functions";
import type { AssetBucket } from "@/lib/asset-storage.shared";

type SignedAssetImageProps = {
  bucket: AssetBucket;
  storagePath: string;
  alt: string;
  className?: string;
};

export function SignedAssetImage({ bucket, storagePath, alt, className }: SignedAssetImageProps) {
  const signFn = useServerFn(getSignedAssetUrlFn);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void signFn({ data: { bucket, storagePath } })
      .then(({ url }) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, storagePath, signFn]);

  if (!src) {
    return <div className={className} aria-label={alt} />;
  }

  return <img src={src} alt={alt} className={className} />;
}
