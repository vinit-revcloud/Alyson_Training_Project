# AWS S3 asset storage setup

Class PDFs, videos, transcripts, and interview papers use **one S3 bucket** with prefix-based keys:

```
s3://YOUR_BUCKET/
  class-documents/{classId}/{sectionId}/{timestamp}-{file}.pdf
  class-videos/...
  class-transcripts/...
  interview-papers/{sessionId}/...
  policies/{slug}/...
```

Extracted text for AI (assessments, section questions) is cached in Postgres `section_assets.extracted_text` — **do not** duplicate PDFs for test generation.

## 1. Create bucket

```bash
aws s3api create-bucket \
  --bucket alyson-training-media \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2
```

Block public access (learners use presigned URLs):

```bash
aws s3api put-public-access-block \
  --bucket alyson-training-media \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## 2. Cost controls

**Intelligent-Tiering** (recommended for mixed hot/cold content):

```bash
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket alyson-training-media \
  --id EntireBucket \
  --intelligent-tiering-configuration '{
    "Id": "EntireBucket",
    "Status": "Enabled",
    "Tierings": [
      { "Days": 90, "AccessTier": "ARCHIVE_ACCESS" },
      { "Days": 180, "AccessTier": "DEEP_ARCHIVE_ACCESS" }
    ]
  }'
```

**Versioning: keep OFF** unless compliance requires it (doubles storage cost).

**Optional lifecycle** for archived training content (phase 2 — when `classes.status = archived`):

```bash
# Example: transition old class-documents after 180 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket alyson-training-media \
  --lifecycle-configuration file://scripts/s3-lifecycle-example.json
```

See `scripts/s3-lifecycle-example.json` for a starter template.

## 3. IAM policy (app user)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::alyson-training-media/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::alyson-training-media"
    }
  ]
}
```

Reuse the same `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as SES, or create a dedicated IAM user.

## 4. Environment variables

```env
S3_ASSETS_BUCKET=alyson-training-media
S3_ASSETS_REGION=us-west-2
# Optional key prefix for staging vs prod:
# S3_ASSETS_PREFIX=prod
ASSET_STORAGE_BACKEND=s3
```

In production, `S3_ASSETS_BUCKET` is required (`assertProductionConfig`).

Local dev defaults to `storage/` on disk unless you set `ASSET_STORAGE_BACKEND=s3`.

## 5. Migrate existing files

If you have assets on local disk or Vercel Blob:

```bash
# From local storage/
ASSET_STORAGE_BACKEND=local node scripts/migrate-assets-to-s3.mjs --from=local-disk

# Dry run first
node scripts/migrate-assets-to-s3.mjs --from=local-disk --dry-run
```

Then set `ASSET_STORAGE_BACKEND=s3` on Vercel and redeploy.

## 6. Delivery model

| Backend | Learner PDF/video URLs |
|---------|------------------------|
| S3 | S3 presigned GET (direct from AWS, no Vercel egress) |
| Local / Blob | HMAC-signed `/api/assets/...` app proxy |
