import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Local OCR language model; scanned patient data never leaves the browser. */
export async function GET() {
  try {
    const data = await readFile(
      join(
        process.cwd(),
        "node_modules",
        "@tesseract.js-data",
        "eng",
        "4.0.0",
        "eng.traineddata.gz"
      )
    );
    return new Response(data, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "application/gzip",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("OCR language data is unavailable.", { status: 503 });
  }
}
