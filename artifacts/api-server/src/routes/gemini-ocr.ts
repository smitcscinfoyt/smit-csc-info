import { Router, type IRouter } from "express";
import sharp from "sharp";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAX_BASE64_LEN = 8 * 1024 * 1024;
// Resize the long edge of the page to this size before OCR. ~2000 px
// is the sweet spot for OCR — high enough that small print stays
// crisp, low enough that the upload + Gemini latency stays snappy.
const TARGET_LONG_EDGE = 2000;

/**
 * Pre-process a page bitmap before OCR to dramatically improve text
 * recognition on stylised certificate/document scans:
 *   - upscale to ~2000 px so small print is sharp
 *   - convert to grayscale (kills ornamental gold/colour borders that
 *     OCR engines hallucinate as glyphs)
 *   - normalise contrast so faded ink and watermarks are crisp
 *   - mild sharpen to crisp the glyph edges
 *   - re-encode to JPEG q=90 for compact upload
 * Returns a JPEG buffer + the new pixel dimensions.
 */
async function preprocessForOcr(
  inputBuffer: Buffer,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(inputBuffer, { failOn: "none" }).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  const longEdge = Math.max(srcW, srcH);
  // Only upscale (or down-scale huge images). Never enlarge tiny images
  // beyond 2× — the gain doesn't justify the upload bytes.
  let pipeline = sharp(inputBuffer, { failOn: "none" }).rotate(); // honour EXIF
  if (longEdge > 0) {
    const scale = Math.min(2, TARGET_LONG_EDGE / longEdge);
    if (scale > 1.05) {
      pipeline = pipeline.resize(
        Math.round(srcW * scale),
        Math.round(srcH * scale),
        { kernel: "lanczos3", withoutEnlargement: false },
      );
    } else if (longEdge > TARGET_LONG_EDGE) {
      pipeline = pipeline.resize({
        width: srcW >= srcH ? TARGET_LONG_EDGE : undefined,
        height: srcH > srcW ? TARGET_LONG_EDGE : undefined,
        kernel: "lanczos3",
      });
    }
  }
  // Moire / screen-photo cleanup pipeline (order matters):
  //   1. grayscale          — drop colour noise (golden borders, etc).
  //   2. blur(0.7)          — soft Gaussian kills high-frequency moire
  //                            patterns from photos of LCD screens.
  //   3. median(3)          — removes leftover speckle / tiny dots
  //                            without softening character edges.
  //   4. normalize          — full-range contrast stretch (auto-levels)
  //                            so faded ink and dim screen photos pop.
  //   5. linear(1.4, -45)   — aggressive contrast/brightness curve that
  //                            pushes light grays (paper, faint moire,
  //                            scan-line halos) up toward 255 while
  //                            keeping glyph strokes dark. Per user
  //                            guidance — earlier (1.15, -10) was too
  //                            gentle to fully wipe screen-photo lining.
  //   6. sharpen            — re-crisp glyph edges that 1-3 softened.
  //   7. threshold(200,…)   — final binarisation: any pixel still above
  //                            ~200 becomes pure white, anything below
  //                            stays its original tone. Kills the last
  //                            traces of horizontal moire bands that
  //                            were causing Gemini to occasionally read
  //                            them as runs of underscores / hyphens.
  //                            Threshold is high (200, not 180) to
  //                            protect anti-aliased edges of stylised
  //                            italic display fonts from disintegrating.
  const out = await pipeline
    .grayscale()
    .blur(0.7)
    .median(3)
    .normalize()
    .linear(1.4, -45)
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 0.5 })
    .threshold(200, { grayscale: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    width: out.info.width,
    height: out.info.height,
  };
}

interface GeminiBlock {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  // Optional per-block style — Gemini detects these from glyph shape
  // and returns them so the editor can render the replacement text in
  // a style that matches the original. All four are best-effort: the
  // model may omit any of them, in which case the client falls back to
  // sensible defaults (Helvetica, normal weight, no italic, near-black).
  font_family?: "serif" | "sans" | "mono"; // family bucket
  is_bold?: boolean;
  is_italic?: boolean;
  color?: string; // hex, e.g. "#0f172a"
}

interface GeminiOcrResponse {
  blocks: GeminiBlock[];
}

/**
 * Recover every complete `{ ... }` object from a possibly-truncated JSON
 * buffer (the typical shape is `{"blocks":[ {…}, {…}, {…}, {…<cut>` ).
 * Walks the string with a brace counter that respects strings and
 * escapes, collects every fully-closed object found, and JSON-parses it
 * individually. Objects that fail to parse are skipped.
 */
function recoverBlocksFromTruncatedJson(src: string): any[] {
  const out: any[] = [];
  let i = 0;
  const len = src.length;
  while (i < len) {
    if (src.charCodeAt(i) !== 0x7b /* { */) {
      i++;
      continue;
    }
    const start = i;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let closedAt = -1;
    for (let j = i; j < len; j++) {
      const c = src.charCodeAt(j);
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (c === 0x5c /* \ */) {
          esc = true;
        } else if (c === 0x22 /* " */) {
          inStr = false;
        }
        continue;
      }
      if (c === 0x22 /* " */) {
        inStr = true;
      } else if (c === 0x7b /* { */) {
        depth++;
      } else if (c === 0x7d /* } */) {
        depth--;
        if (depth === 0) {
          closedAt = j;
          break;
        }
      }
    }
    if (closedAt < 0) {
      // This `{` is unbalanced (typically the outer wrapping
      // `{"blocks":[ ... ` whose `}` was cut off). Skip it and try
      // inner `{` objects — they may still be complete.
      i = start + 1;
      continue;
    }
    const slice = src.slice(start, closedAt + 1);
    try {
      const obj = JSON.parse(slice);
      // Only keep objects that look like OCR blocks (have a text field).
      if (obj && typeof obj.text === "string") out.push(obj);
    } catch {
      /* skip malformed slice */
    }
    i = closedAt + 1;
  }
  return out;
}

router.post(
  "/tools/gemini-ocr",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!baseUrl || !apiKey) {
      res
        .status(503)
        .json({ error: "Smart OCR engine is not configured." });
      return;
    }

    let { imageBase64, imageWidth, imageHeight, mimeType } = (req.body ??
      {}) as {
      imageBase64?: string;
      imageWidth?: number;
      imageHeight?: number;
      mimeType?: string;
    };
    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }
    if (
      typeof imageWidth !== "number" ||
      typeof imageHeight !== "number" ||
      imageWidth <= 0 ||
      imageHeight <= 0
    ) {
      res
        .status(400)
        .json({ error: "imageWidth and imageHeight are required" });
      return;
    }
    const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.*)$/);
    if (dataUrlMatch) {
      mimeType = mimeType || dataUrlMatch[1];
      imageBase64 = dataUrlMatch[2];
    }
    if (!mimeType) mimeType = "image/jpeg";
    if (imageBase64.length > MAX_BASE64_LEN) {
      res.status(413).json({ error: "Image too large." });
      return;
    }

    // ── Server-side image preprocessing (sharp) ───────────────────
    // Decode the client upload, then upscale + grayscale + normalise +
    // sharpen before sending to Gemini. This single step has the
    // largest single quality impact: it strips ornamental gold borders
    // and seals (so they aren't hallucinated as glyphs), boosts the
    // contrast of stylised italic display fonts (e.g. certificate
    // names), and brings sub-pixel small print up to a resolution
    // where the model can read it. The resized dimensions become the
    // new (imageWidth, imageHeight) used for coordinate mapping.
    let processedBuffer: Buffer;
    let processedWidth = imageWidth;
    let processedHeight = imageHeight;
    try {
      const inputBuf = Buffer.from(imageBase64, "base64");
      const pre = await preprocessForOcr(inputBuf);
      processedBuffer = pre.buffer;
      processedWidth = pre.width;
      processedHeight = pre.height;
      mimeType = "image/jpeg";
    } catch (err) {
      logger.warn(
        { err: { message: (err as Error)?.message } },
        "sharp preprocessing failed — falling back to raw upload",
      );
      processedBuffer = Buffer.from(imageBase64, "base64");
    }
    const processedBase64 = processedBuffer.toString("base64");

    const prompt = [
      "You are a precise OCR engine analysing a single document page.",
      "The page may contain English, Gujarati (ગુજરાતી), or Hindi (हिन्दी)",
      "text. Recognise glyphs in all three scripts equally well.",
      "Extract every visible text element — including names, headings,",
      "stylised display fonts, dates, signatures-as-text, and small print.",
      "",
      "CRITICAL RULES (follow exactly):",
      "1. Return ONE entry per visual LINE of text. Do NOT merge multiple",
      "   lines into a single block. A paragraph spanning 4 lines must",
      "   become 4 separate entries, one per line.",
      "2. The box_2d for each line must be tight to the actual glyph",
      "   bounds of THAT LINE — no extra padding above/below, no",
      "   inclusion of neighbouring lines or whitespace.",
      "3. Do NOT include ornamental graphics, logos, seals, gold borders,",
      "   QR codes, signature scribbles, table grid lines, watermarks,",
      "   horizontal/vertical separator lines, page edges, scan-lines,",
      "   or any visual element that is not a real letter, digit, or",
      "   punctuation mark. If something looks like noise — moiré",
      "   patterns from a screen photo, dots, speckles, lens blur — do",
      "   NOT invent text from it. In particular, NEVER interpret a",
      "   thin horizontal line, table border, scan-line, or noise band",
      "   as a row of underscores ('_'), hyphens ('-'), em-dashes ('—'),",
      "   periods ('....'), or pipes ('|'). Such 'punctuation runs' are",
      "   almost always misread image artefacts and must be omitted.",
      "4. CONFIDENCE GATE: if you cannot confidently read the glyphs in",
      "   a region, OMIT that entry entirely. It is far better to return",
      "   fewer correct lines than to hallucinate uncertain ones.",
      "5. Skip any 'line' that is shorter than 2 characters unless it is",
      "   a real numeral (e.g. '7', '12').",
      "6. Preserve the exact case and characters; do not translate or",
      "   transliterate. Gujarati stays Gujarati, Hindi stays Hindi,",
      "   English stays English.",
      "",
      "Each entry has:",
      "  - text: the exact transcription of that one line",
      "  - box_2d: [y_min, x_min, y_max, x_max] as integers in a 0-1000",
      "    normalised grid (origin top-left).",
      "  - font_family: one of \"serif\" (Times-like, with strokes/feet on",
      "    letters), \"sans\" (Arial/Helvetica-like, clean strokes), or",
      "    \"mono\" (typewriter-like, every glyph the same width). Pick",
      "    based on glyph shape. If unsure, return \"sans\".",
      "  - is_bold: true if the strokes look noticeably thicker than",
      "    body text on the same page; otherwise false.",
      "  - is_italic: true if the glyphs are slanted; otherwise false.",
      "  - color: dominant ink colour of the glyphs as a 7-char hex",
      "    string (e.g. \"#000000\" for black, \"#1f2937\" for near-black,",
      "    \"#b91c1c\" for red stamps). If unsure, return \"#0f172a\".",
      "",
      "Return STRICT JSON of the form:",
      `{"blocks":[{"text":"...","box_2d":[y_min,x_min,y_max,x_max],"font_family":"sans","is_bold":false,"is_italic":false,"color":"#0f172a"}, ...]}`,
      "No markdown fences. No commentary. If the image contains no",
      "confidently-readable text, return exactly {\"blocks\":[]}.",
    ].join("\n");

    // Replit AI Integrations proxy uses a flat /models/... path (no /v1beta/).
    const url = `${baseUrl.replace(/\/$/, "")}/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType, data: processedBase64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            // 32K is plenty for even densely-packed certificates and forms.
            // 8K was too small — packed certificates returned ~500 blocks
            // and were truncated mid-JSON, breaking the strict parser.
            maxOutputTokens: 32768,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        logger.warn(
          { status: upstream.status, body: text.slice(0, 400) },
          "gemini ocr upstream failed",
        );
        res
          .status(upstream.status === 429 ? 429 : 502)
          .json({ error: "Smart OCR engine returned an error." });
        return;
      }

      const json = (await upstream.json()) as any;
      const candidate = json?.candidates?.[0];
      const textOut: string =
        candidate?.content?.parts
          ?.map((p: any) => p?.text ?? "")
          .join("") ?? "";

      let parsed: { blocks?: any[] } = {};
      // Strip a possible ```json fence even though we asked for raw JSON.
      const cleaned = textOut
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "");
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        // Common cause: model hit maxOutputTokens and the JSON was cut
        // off mid-object. Recover every complete `{ ... }` block by
        // scanning the buffer with a brace counter that respects strings
        // and escapes. This rescues hundreds of blocks that would
        // otherwise be lost when even a single tail object is truncated.
        const recovered = recoverBlocksFromTruncatedJson(cleaned);
        logger.warn(
          {
            err: { message: (err as Error)?.message },
            snippet: cleaned.slice(0, 200),
            tail: cleaned.slice(-120),
            recovered: recovered.length,
          },
          "gemini ocr parse fail — recovering partial blocks",
        );
        parsed = { blocks: recovered };
      }

      const rawBlocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
      const blocks: GeminiBlock[] = [];
      // Convert Gemini coords (0-1000 grid over the *processed* image)
      // back to the *client's original* image-pixel space, since the
      // client mapped its display coords against the raw upload size.
      // sx/sy are 1.0 unless preprocessing resized the image.
      const sx = processedWidth > 0 ? imageWidth / processedWidth : 1;
      const sy = processedHeight > 0 ? imageHeight / processedHeight : 1;
      // Tolerant style-field extractors. Gemini occasionally returns
      // these as numbers ("0"/"1"), strings ("true"/"false"), or omits
      // them entirely. None of them should ever throw or default to a
      // disruptive value — undefined falls through to the client's
      // sensible defaults (Helvetica, normal weight, near-black).
      const parseFamily = (v: any): GeminiBlock["font_family"] | undefined => {
        if (typeof v !== "string") return undefined;
        const s = v.toLowerCase().trim();
        if (s === "serif" || s.startsWith("times")) return "serif";
        if (s === "mono" || s.startsWith("courier") || s.includes("monospace")) return "mono";
        if (s === "sans" || s.includes("sans") || s.startsWith("arial") || s.startsWith("helvetica")) return "sans";
        return undefined;
      };
      const parseBool = (v: any): boolean | undefined => {
        if (typeof v === "boolean") return v;
        if (typeof v === "number") return v !== 0;
        if (typeof v === "string") {
          const s = v.toLowerCase().trim();
          if (s === "true" || s === "1" || s === "yes") return true;
          if (s === "false" || s === "0" || s === "no") return false;
        }
        return undefined;
      };
      const parseHex = (v: any): string | undefined => {
        if (typeof v !== "string") return undefined;
        const s = v.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(s)) {
          const r = s[1], g = s[2], b = s[3];
          return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
        }
        return undefined;
      };

      for (const b of rawBlocks) {
        if (!b || typeof b.text !== "string") continue;
        const text = b.text.trim();
        if (!text) continue;
        const box = b.box_2d ?? b.bbox ?? b.boundingBox;
        if (!Array.isArray(box) || box.length < 4) continue;
        const [yMin, xMin, yMax, xMax] = box.map((n: any) => Number(n));
        if ([yMin, xMin, yMax, xMax].some((n) => !Number.isFinite(n))) continue;
        // Step 1: 0-1000 → processed-image pixels
        const px1 = Math.max(0, Math.min(processedWidth, (xMin / 1000) * processedWidth));
        const py1 = Math.max(0, Math.min(processedHeight, (yMin / 1000) * processedHeight));
        const px2 = Math.max(0, Math.min(processedWidth, (xMax / 1000) * processedWidth));
        const py2 = Math.max(0, Math.min(processedHeight, (yMax / 1000) * processedHeight));
        // Step 2: processed-image px → original-image px (client's space)
        const x = px1 * sx;
        const y = py1 * sy;
        const w = Math.max(1, (px2 - px1) * sx);
        const h = Math.max(1, (py2 - py1) * sy);
        const block: GeminiBlock = { text, x, y, w, h };
        const family = parseFamily(b.font_family);
        if (family) block.font_family = family;
        const bold = parseBool(b.is_bold);
        if (bold !== undefined) block.is_bold = bold;
        const italic = parseBool(b.is_italic);
        if (italic !== undefined) block.is_italic = italic;
        const color = parseHex(b.color);
        if (color) block.color = color;
        blocks.push(block);
      }

      const out: GeminiOcrResponse = { blocks };
      res.json(out);
    } catch (err) {
      logger.error({ err }, "gemini ocr call failed");
      res.status(502).json({ error: "Could not reach Smart OCR engine." });
    }
  },
);

export default router;
