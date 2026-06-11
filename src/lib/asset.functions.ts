import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDbAuth } from "@/integrations/neon/auth-middleware";
import { signAssetUrl } from "@/lib/asset-signing.server";
import type { AssetBucket } from "@/lib/asset-storage.shared";

const AssetUrlInput = z.object({
  bucket: z.enum(["class-videos", "class-documents", "class-transcripts", "interview-papers"]),
  storagePath: z.string().min(1).max(500),
  expiresIn: z.number().int().min(60).max(86_400).optional(),
});

export const getSignedAssetUrlFn = createServerFn({ method: "POST" })
  .middleware([requireDbAuth])
  .inputValidator((data: unknown) => AssetUrlInput.parse(data))
  .handler(async ({ data }) => {
    const url = signAssetUrl(
      data.bucket as AssetBucket,
      data.storagePath,
      data.expiresIn ?? 3600,
    );
    return { url };
  });
