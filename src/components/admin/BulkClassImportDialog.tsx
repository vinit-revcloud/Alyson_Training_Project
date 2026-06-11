import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkImportClasses } from "@/lib/class-bulk-import-api";
import {
  downloadBulkImportTemplate,
  parseBulkImportExcel,
} from "@/lib/class-bulk-import-excel";
import type { BulkClassInput } from "@/lib/class-bulk-import.shared";
import { listCourses } from "@/lib/classes-api";

export function BulkClassImportDialog({
  open,
  onOpenChange,
  courseId: initialCourseId,
  courseTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId?: string;
  courseTitle?: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [courseId, setCourseId] = useState(initialCourseId ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<BulkClassInput[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
    enabled: open && !initialCourseId,
  });

  const effectiveCourseId = initialCourseId ?? courseId;

  const reset = () => {
    setFileName(null);
    setParsed([]);
    setParseErrors([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    if (next && initialCourseId) setCourseId(initialCourseId);
    onOpenChange(next);
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const result = parseBulkImportExcel(buffer);
    setParsed(result.classes);
    setParseErrors(result.issues.map((i) => `${i.sheet} row ${i.row}: ${i.message}`));
  };

  const importMutation = useMutation({
    mutationFn: () => bulkImportClasses({ courseId: effectiveCourseId, classes: parsed }),
    onSuccess: (result) => {
      toast.success(`Created ${result.created.length} class${result.created.length === 1 ? "" : "es"}`);
      qc.invalidateQueries({ queryKey: ["courses"] });
      qc.invalidateQueries({ queryKey: ["course-tree", result.courseId] });
      handleOpenChange(false);
      navigate({ to: "/courses/$courseId", params: { courseId: result.courseId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  const canImport =
    Boolean(effectiveCourseId) && parsed.length > 0 && parseErrors.length === 0 && !importMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import classes</DialogTitle>
          <DialogDescription>
            Upload a structured Excel workbook to create multiple classes in order
            {courseTitle ? ` for ${courseTitle}` : ""}. Download the template to see the expected
            format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!initialCourseId ? (
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                Target course
              </label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger className="h-9 rounded-lg">
                  <SelectValue placeholder="Select a course…" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => downloadBulkImportTemplate()}
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
              Choose Excel file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
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
                Preview — {parsed.length} class{parsed.length === 1 ? "" : "es"} (in order)
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-border">
                {parsed
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((cls) => {
                    const docCount = cls.sections.reduce(
                      (n, s) => n + (s.documentLinks?.length ?? 0),
                      0,
                    );
                    const transcriptCount = cls.sections.filter((s) => s.transcriptionLink).length;
                    return (
                      <div key={cls.order} className="px-3 py-2 text-[12px]">
                        <div className="font-medium">
                          {cls.order}. {cls.name}
                          <span className="ml-2 font-normal text-muted-foreground">
                            · {cls.sections.length} section{cls.sections.length === 1 ? "" : "es"}{" "}
                            · {cls.status}
                            {docCount ? ` · ${docCount} doc${docCount === 1 ? "" : "s"}` : ""}
                            {transcriptCount
                              ? ` · ${transcriptCount} transcript${transcriptCount === 1 ? "" : "s"}`
                              : ""}
                          </span>
                        </div>
                        {cls.sections.length ? (
                          <div className="mt-0.5 truncate text-muted-foreground">
                            {cls.sections.map((s) => s.title).join(" → ")}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            Use the <strong>Classes</strong> and <strong>Sections</strong> sheets (also accepts{" "}
            <strong>Sessions</strong>). Optional section columns: <strong>video_link</strong>,{" "}
            <strong>document_link</strong> (comma-separated URLs), and{" "}
            <strong>transcription</strong> (transcript URL). Classes are appended in spreadsheet
            order. Links appear as documents/transcripts on each class page and open in the browser.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
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
                Import {parsed.length ? `${parsed.length} classes` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
