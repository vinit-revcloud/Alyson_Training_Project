import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { requireAdminUserId } from "@/lib/auth-token.server";
import { signAssetUrl } from "@/lib/asset-signing.server";
import { assertAssetReadAccess } from "@/lib/asset-ownership.server";
import {
  assetStorageBackend,
  assetStorageUsesS3,
  blobStorageConfigured,
  s3StorageConfigured,
} from "@/lib/asset-storage.server";
import { getS3AssetsConfig } from "@/lib/config.server";
import { s3BucketReachable } from "@/lib/asset-s3.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";

const AssetUrlInput = z.object({
  bucket: z.enum(["class-videos", "class-documents", "class-transcripts", "interview-papers"]),
  storagePath: z.string().min(1).max(500),
  expiresIn: z.number().int().min(60).max(86_400).optional(),
});

export const getSignedAssetUrlFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => AssetUrlInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAssetReadAccess(context.userId, data.bucket as AssetBucket, data.storagePath);
    const url = await signAssetUrl(
      data.bucket as AssetBucket,
      data.storagePath,
      data.expiresIn ?? 3600,
    );
    return { url };
  });

export const getAssetStorageInfoFn = createServerFn({ method: "GET" })
  .middleware([requireDbAuth])
  .handler(async () => {
    await requireAdminUserId();
    const s3 = getS3AssetsConfig();
    const backend = assetStorageBackend();
    let s3Reachable = false;
    if (s3.bucket) {
      s3Reachable = await s3BucketReachable();
    }
    return {
      backend,
      usesS3: assetStorageUsesS3(),
      s3Bucket: s3.bucket ?? null,
      s3Region: s3.region,
      s3KeyPrefix: s3.keyPrefix ?? null,
      s3Configured: s3StorageConfigured(),
      s3Reachable,
      blobConfigured: blobStorageConfigured(),
      delivery: assetStorageUsesS3() ? "s3-presigned" : "app-proxy",
    };
  });
