import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSignedAssetUrlFn } from "@/lib/asset.functions";
import type { AssetBucket } from "@/lib/asset-storage.shared";
import type { SectionContent } from "@/lib/onboarding/onboarding-nav.server";
import { LearnGuideToc } from "@/components/learn/LearnGuideToc";
import { cn } from "@/lib/utils";

function isEmbedVideo(url: string): boolean {
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(url);
}

function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

function SignedMedia({
  bucket,
  storagePath,
  kind,
  label,
}: {
  bucket: AssetBucket;
  storagePath: string;
  kind: "video" | "document";
  label: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    void getSignedAssetUrlFn({ data: { bucket, storagePath } })
      .then(({ url }) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, storagePath]);

  if (failed) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--learn-border)] bg-muted/40 p-4 text-sm text-muted-foreground">
        Document unavailable. Ask your trainer to re-upload this file.
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={
          kind === "video"
            ? "aspect-video animate-pulse rounded-[10px] bg-muted"
            : "h-24 animate-pulse rounded-[10px] bg-muted"
        }
      />
    );
  }

  if (kind === "video") {
    return (
      <video
        src={src}
        controls
        className="aspect-video w-full rounded-[10px] border border-[var(--learn-border)] bg-black"
      />
    );
  }

  const isPdf = label.toLowerCase().includes(".pdf") || src.toLowerCase().includes(".pdf");
  return (
    <div className="learn-card rounded-[10px] border border-[var(--learn-border)] p-4">
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--learn-accent)] hover:underline"
      >
        <FileText className="h-4 w-4" />
        {label || "Document"}
        <ExternalLink className="h-3 w-3" />
      </a>
      {isPdf ? (
        <iframe
          src={src}
          title={label}
          className="mt-3 h-96 w-full rounded-lg border border-[var(--learn-border)]"
        />
      ) : null}
    </div>
  );
}

function SignedVideo({ bucket, storagePath }: { bucket: AssetBucket; storagePath: string }) {
  return <SignedMedia bucket={bucket} storagePath={storagePath} kind="video" label="Video" />;
}

function SectionAssetBlock({
  asset,
}: {
  asset: SectionContent["assets"][number];
}) {
  const kind = asset.kind;
  const url = asset.url;

  if ((kind === "video" || kind === "video_link") && url) {
    const embed = isEmbedVideo(url) ? embedUrl(url) : null;
    if (embed) {
      return (
        <div className="overflow-hidden rounded-[10px] border border-[var(--learn-border)]">
          <iframe
            src={embed}
            title={asset.label}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    if (asset.storageBucket && asset.storagePath) {
      return (
        <SignedVideo
          bucket={asset.storageBucket as AssetBucket}
          storagePath={asset.storagePath}
        />
      );
    }
    return (
      <video src={url} controls className="aspect-video w-full rounded-[10px] border border-[var(--learn-border)]" />
    );
  }

  if (kind === "document") {
    if (asset.storageBucket && asset.storagePath) {
      return (
        <SignedMedia
          bucket={asset.storageBucket as AssetBucket}
          storagePath={asset.storagePath}
          kind="document"
          label={asset.label}
        />
      );
    }
    if (!url) return null;
    const isPdf = url.toLowerCase().includes(".pdf") || asset.label.toLowerCase().includes("pdf");
    return (
      <div className="learn-card rounded-[10px] border border-[var(--learn-border)] p-4">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--learn-accent)] hover:underline"
        >
          <FileText className="h-4 w-4" />
          {asset.label || "Document"}
          <ExternalLink className="h-3 w-3" />
        </a>
        {isPdf ? (
          <iframe src={url} title={asset.label} className="mt-3 h-96 w-full rounded-lg border border-[var(--learn-border)]" />
        ) : null}
      </div>
    );
  }

  if (kind === "transcript") {
    return <TranscriptPanel label={asset.label} text={asset.extractedText} url={url} />;
  }

  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-sm text-[var(--learn-accent)] hover:underline">
        {asset.label || url}
      </a>
    );
  }
  return null;
}

function TranscriptPanel({
  label,
  text,
  url,
}: {
  label: string;
  text: string | null;
  url: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="learn-card rounded-[10px] border border-[var(--learn-border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-4 text-left text-sm font-medium"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label || "Transcript"}
      </button>
      {open ? (
        <div className="border-t border-[var(--learn-border)] px-4 pb-4 text-sm text-muted-foreground">
          {text ? (
            <p className="whitespace-pre-wrap pt-3">{text}</p>
          ) : url ? (
            <a href={url} target="_blank" rel="noreferrer" className="pt-3 text-[var(--learn-accent)] hover:underline">
              Open transcript
            </a>
          ) : (
            <p className="pt-3">No transcript available.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SectionReader({ section }: { section: SectionContent }) {
  const videos = section.assets.filter((a) => a.kind === "video" || a.kind === "video_link");
  const documents = section.assets.filter((a) => a.kind === "document");
  const transcripts = section.assets.filter((a) => a.kind === "transcript");

  return (
    <div className="flex min-w-0 flex-1 bg-[var(--learn-bg)]">
      <article className="min-w-0 flex-1 px-6 py-8 lg:px-10">
        <p className="text-xs text-muted-foreground">{section.courseTitle}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{section.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{section.className}</p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-[var(--learn-border)]">
            Onboarding guide
          </Badge>
        </div>

        {videos.length > 0 ? (
          <div className="mt-6 space-y-4">
            {videos.map((a) => (
              <SectionAssetBlock key={a.id} asset={a} />
            ))}
          </div>
        ) : null}

        <div className="prose prose-sm mt-8 max-w-none dark:prose-invert">
          {section.description ? (
            <div className="whitespace-pre-wrap leading-relaxed">{section.description}</div>
          ) : null}
          {section.objectives ? (
            <div className="mt-6">
              <h2 id="objectives" className="text-lg font-semibold text-[var(--learn-accent)]">
                Objectives
              </h2>
              <div className="mt-2 whitespace-pre-wrap leading-relaxed">{section.objectives}</div>
            </div>
          ) : null}
        </div>

        {documents.length > 0 ? (
          <div className="mt-6 space-y-3">
            <h2 className="text-lg font-semibold text-[var(--learn-accent)]">Resources</h2>
            {documents.map((a) => (
              <SectionAssetBlock key={a.id} asset={a} />
            ))}
          </div>
        ) : null}

        {transcripts.length > 0 ? (
          <div className="mt-6 space-y-3">
            {transcripts.map((a) => (
              <SectionAssetBlock key={a.id} asset={a} />
            ))}
          </div>
        ) : null}
      </article>
      <LearnGuideToc headings={section.headings} />
    </div>
  );
}
