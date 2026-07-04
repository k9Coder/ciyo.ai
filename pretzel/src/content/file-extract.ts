/**
 * File content extraction for upload scanning.
 *
 * Uses file extension to determine the extraction path:
 *   - Text-like extensions → blob.text()
 *   - .pdf               → pdfjs-dist (requires `pnpm add pdfjs-dist`)
 *   - .docx              → JSZip + word/document.xml (requires `pnpm add jszip`)
 *   - Everything else    → null (caller falls back to filename + MIME only)
 *
 * Files over FILE_SIZE_LIMIT_BYTES are not content-scanned.
 */

export const FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "rst", "csv", "tsv", "log",
  "env", "sh", "bash", "zsh", "fish", "bat", "cmd", "ps1",
  "sql", "yaml", "yml", "toml", "ini", "cfg", "conf", "config",
  "properties", "json", "jsonl", "ndjson", "xml", "html", "htm",
  "css", "scss", "sass", "less",
  "js", "mjs", "cjs", "jsx", "ts", "tsx",
  "py", "pyx", "pxd", "ipynb",
  "go", "java", "kt", "kts", "rb", "rs", "cpp", "cc", "cxx",
  "c", "h", "hpp", "hxx", "cs", "php", "swift", "r", "rmd",
  "pl", "pm", "lua", "scala", "hs", "ex", "exs", "erl",
  "graphql", "gql", "proto", "tf", "hcl", "tfvars",
  "gradle", "pom", "makefile", "dockerfile", "vagrantfile",
  "gitignore", "gitattributes", "editorconfig", "eslintrc",
  "prettierrc", "babelrc", "npmrc", "nvmrc", "yarnrc",
]);

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot + 1) : "";
}

async function extractTextFile(file: File): Promise<string> {
  return file.text();
}

async function extractPdf(file: File): Promise<string | null> {
  try {
    // pdfjs-dist must be installed: pnpm add pdfjs-dist
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional dependency
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = ""; // no worker — synchronous fallback

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: { str: string }) => item.str).join(" "));
    }
    return pages.join("\n");
  } catch {
    return null;
  }
}

async function extractDocx(file: File): Promise<string | null> {
  try {
    // jszip must be installed: pnpm add jszip
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional dependency
    const JSZip = (await import("jszip")).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xmlFile = zip.file("word/document.xml");
    if (!xmlFile) return null;
    const xml = await xmlFile.async("string");
    // Strip XML tags, collapse whitespace
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}

export interface FileExtractResult {
  /** Extracted text, or empty string if extraction produced nothing (e.g. scanned image PDF). */
  text: string;
  filename: string;
  mimeType: string;
  /** True when we attempted but produced no usable text — caller can still check filename/MIME. */
  contentUnavailable: boolean;
}

/**
 * Extract scannable text from a File object.
 * Returns null only when the file type is entirely unsupported (images, video, unknown binary).
 * Returns a result with empty text + contentUnavailable=true for supported types that yield no text.
 */
export async function extractFile(file: File): Promise<FileExtractResult | null> {
  const filename = file.name;
  const mimeType = file.type;
  const ext = getExtension(filename);

  const base = { filename, mimeType };

  if (file.size > FILE_SIZE_LIMIT_BYTES) {
    // Too large — surface filename/MIME to detection but no content scan
    return { ...base, text: "", contentUnavailable: true };
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    const text = await extractTextFile(file);
    return { ...base, text, contentUnavailable: false };
  }

  if (ext === "pdf") {
    const text = await extractPdf(file);
    // null = extraction failed (scanned image PDF or pdfjs not installed)
    return { ...base, text: text ?? "", contentUnavailable: text === null };
  }

  if (ext === "docx") {
    const text = await extractDocx(file);
    return { ...base, text: text ?? "", contentUnavailable: text === null };
  }

  // Images, video, audio, unknown binary — not supported
  return null;
}
