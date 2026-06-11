import { useEffect, useState } from "react";

import { getSignedAssetUrlFn } from "@/lib/asset.functions";
import type { AssetBucket } from "@/lib/asset-storage.shared";

type SignedAssetImageProps = {
  bucket: AssetBucket;
  storagePath: string;
  alt: string;
  className?: string;
};

export function SignedAssetImage({ bucket, storagePath, alt, className }: SignedAssetImageProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSignedAssetUrlFn({ data: { bucket, storagePath } })
      .then(({ url }) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, storagePath]);

  if (!src) {
    return <div className={className} aria-label={alt} />;
  }

  return <img src={src} alt={alt} className={className} />;
}
