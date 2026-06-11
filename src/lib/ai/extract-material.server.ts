const TEXTY_EXT = /\.(txt|md|markdown|srt|vtt|csv|json|html?)$/i;

export function isTextExtractableFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    TEXTY_EXT.test(lower) ||
    lower.endsWith(".docx") ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".pptx")
  );
}

export async function extractTextFromBuffer(
  fileName: string,
  buffer: ArrayBuffer,
): Promise<string> {
  const name = fileName.toLowerCase();
  const bytes = new Uint8Array(buffer);

  if (TEXTY_EXT.test(name)) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, 120_000);
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return (result.value ?? "").slice(0, 120_000);
  }

  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (pdfjs as any).getDocument({ data: bytes, useSystemFonts: true }).promise;
    let out = "";
    const maxPages = Math.min(doc.numPages, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((it: any) => (typeof it.str === "string" ? it.str : ""))
        .filter(Boolean);
      out += `${strings.join(" ")}\n\n`;
      if (out.length > 120_000) break;
    }
    return out.slice(0, 120_000);
  }

  return "";
}
