import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { bulkImportInterviewSessions } from "@/lib/interview-bulk-import-api";
import {
  downloadBulkInterviewTemplate,
  parseBulkInterviewExcel,
} from "@/lib/interview-bulk-import-excel";
import type { BulkInterviewRowInput, BulkInterviewImportResult } from "@/lib/interview-bulk-import.shared";
import { listInterviewAssessmentsFn } from "@/lib/interview/interview.functions";
import { ASSESSMENT_MODE_LABELS } from "@/lib/interview/interview.shared";

function defaultScheduledLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function defaultExpiresLocal(): string {
  const d = new Date(Date.now() + 7 * 86400000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function BulkInterviewImportDialog({ onImported }: { onImported: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<BulkInterviewRowInput[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [assessmentId, setAssessmentId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledLocal);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresLocal);
  const [importResult, setImportResult] = useState<BulkInterviewImportResult | null>(null);

  const listAssessments = useServerFn(listInterviewAssessmentsFn);
  const { data: assessments = [] } = useQuery({
    queryKey: ["interview-assessments"],
    queryFn: () => listAssessments(),
    enabled: open,
  });

  const reset = () => {
    setFileName(null);
    setParsed([]);
    setParseErrors([]);
    setImportResult(null);
    setAssessmentId("");
    setScheduledAt(defaultScheduledLocal());
    setExpiresAt(defaultExpiresLocal());
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    setOpen(next);
  };

  const onFile = async (file: File) => {
    setImportResult(null);
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const result = parseBulkInterviewExcel(buffer);
    setParsed(result.rows);
    setParseErrors(result.issues.map((i) => `${i.sheet} row ${i.row}: ${i.message}`));
  };

  const needsDefaultAssessment = parsed.some((r) => !r.assessmentTitle);

  const importMutation = useMutation({
    mutationFn: () =>
      bulkImportInterviewSessions({
        rows: parsed,
        defaults: {
          assessmentId: assessmentId || undefined,
          scheduledAt: new Date(scheduledAt).toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
        },
      }),
    onSuccess: (result) => {
      setImportResult(result);
      const { created, failed } = result;
      if (created.length && !failed.length) {
        toast.success(`Scheduled ${created.length} interview${created.length === 1 ? "" : "s"}`);
      } else if (created.length && failed.length) {
        toast.warning(`Scheduled ${created.length}; ${failed.length} failed`);
      } else {
        toast.error(`Import failed — ${failed.length} row${failed.length === 1 ? "" : "s"} had errors`);
      }
      if (created.length) {
        qc.invalidateQueries({ queryKey: ["interview-sessions"] });
        onImported();
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  const canImport =
    parsed.length > 0 &&
    parseErrors.length === 0 &&
    !importMutation.isPending &&
    (!needsDefaultAssessment || Boolean(assessmentId));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          Bulk upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk schedule candidates</DialogTitle>
          <DialogDescription>
            Upload a spreadsheet with one row per candidate. Each row creates an interview session
            and queues an invite email (unless paper-only).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                Default interview test
                {needsDefaultAssessment ? " (required for rows without assessment_title)" : " (optional)"}
              </label>
              <Select value={assessmentId} onValueChange={setAssessmentId}>
                <SelectTrigger className="h-9 rounded-lg">
                  <SelectValue placeholder="Select a test…" />
                </SelectTrigger>
                <SelectContent>
                  {assessments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                Default scheduled at
              </label>
              <Input
                type="datetime-local"
                className="h-9 rounded-lg"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                Default expires at
              </label>
              <Input
                type="datetime-local"
                className="h-9 rounded-lg"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => downloadBulkInterviewTemplate(assessments)}
              disabled={!assessments.length}
            >
              <Download className="h-3.5 w-3.5" />
              Download template
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Choose file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </div>

          {fileName ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px]">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-medium">{fileName}</span>
              <span className="text-muted-foreground">
                · {parsed.length} candidate{parsed.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}

          {parseErrors.length ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              <div className="font-medium">Fix these issues before importing:</div>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {parseErrors.slice(0, 8).map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
                {parseErrors.length > 8 ? (
                  <li>…and {parseErrors.length - 8} more</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {parsed.length ? (
            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2 text-[12px] font-semibold">
                Preview — {parsed.length} candidate{parsed.length === 1 ? "" : "s"}
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-border">
                {parsed.slice(0, 10).map((row) => (
                  <div key={row.excelRow} className="px-3 py-2 text-[12px]">
                    <div className="font-medium">
                      Row {row.excelRow}: {row.candidateName}
                      <span className="ml-2 font-normal text-muted-foreground">
                        · {row.candidateEmail} · {row.role}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-muted-foreground">
                      {row.assessmentTitle || "(default test)"} ·{" "}
                      {ASSESSMENT_MODE_LABELS[row.assessmentMode]}
                      {row.scheduledAt ? ` · ${new Date(row.scheduledAt).toLocaleString()}` : ""}
                    </div>
                  </div>
                ))}
                {parsed.length > 10 ? (
                  <div className="px-3 py-2 text-[12px] text-muted-foreground">
                    …and {parsed.length - 10} more rows
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {importResult ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px]">
              <div className="font-semibold">
                Import complete — {importResult.created.length} created
                {importResult.failed.length
                  ? `, ${importResult.failed.length} failed`
                  : ""}
              </div>
              {importResult.failed.length ? (
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-destructive">
                  {importResult.failed.slice(0, 8).map((f) => (
                    <li key={`${f.row}-${f.message}`}>
                      Row {f.row}: {f.message}
                    </li>
                  ))}
                  {importResult.failed.length > 8 ? (
                    <li>…and {importResult.failed.length - 8} more</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            Use the <strong>Candidates</strong> sheet. Required columns:{" "}
            <strong>candidate_name</strong>, <strong>candidate_email</strong>,{" "}
            <strong>job_title</strong>. See <strong>Available tests</strong> in the template for valid
            assessment titles. Max 200 rows per import.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {importResult?.created.length ? "Close" : "Cancel"}
          </Button>
          <Button
            type="button"
            disabled={!canImport}
            onClick={() => importMutation.mutate()}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import {parsed.length ? `${parsed.length} candidates` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
