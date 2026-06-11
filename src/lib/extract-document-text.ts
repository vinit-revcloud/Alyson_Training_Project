// Client-only document text extraction for PDF / DOCX / TXT.
// Used by the AI Class Assistant on the Create Class page.

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (name.endsWith(".txt") || name.endsWith(".md") || type.startsWith("text/")) {
    return await file.text();
  }

  if (name.endsWith(".docx") || type.includes("officedocument.wordprocessingml")) {
    // @ts-expect-error - mammoth.browser ships no types
    const mammoth = await import("mammoth/mammoth.browser.js");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value ?? "";
  }

  if (name.endsWith(".pdf") || type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    // Use a CDN worker to avoid bundling complexity.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const data = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data }).promise;
    let out = "";
    const maxPages = Math.min(doc.numPages, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((it: any) => (typeof it.str === "string" ? it.str : ""))
        .filter(Boolean);
      out += strings.join(" ") + "\n\n";
    }
    return out;
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}
