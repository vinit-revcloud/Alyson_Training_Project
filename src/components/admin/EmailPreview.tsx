import { useMemo } from "react";
import { renderTemplate, SAMPLE_VARS, findUnknownPlaceholders, type PlaceholderKey } from "@/lib/email/render";

export function EmailPreview({
  subject,
  bodyMd,
  vars,
}: {
  subject: string;
  bodyMd: string;
  vars?: Partial<Record<PlaceholderKey, string>>;
}) {
  const merged = { ...SAMPLE_VARS, ...(vars ?? {}) };
  const rendered = useMemo(
    () => renderTemplate({ subject, bodyMd, vars: merged }),
    [subject, bodyMd, merged],
  );
  const unknown = useMemo(
    () => [...findUnknownPlaceholders(subject), ...findUnknownPlaceholders(bodyMd)],
    [subject, bodyMd],
  );

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Subject:</span>{" "}
        <span className="font-medium text-foreground">{rendered.subject}</span>
      </div>
      {unknown.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          Unknown placeholders: {unknown.map((u) => `{${u}}`).join(", ")}
        </div>
      )}
      <iframe
        title="email preview"
        srcDoc={rendered.html}
        className="h-[480px] w-full rounded-lg border border-border bg-white"
        sandbox=""
      />
    </div>
  );
}
