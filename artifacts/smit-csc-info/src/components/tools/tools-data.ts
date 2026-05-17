import {
  IdCard,
  CreditCard,
  PenTool,
  UserSquare2,
  FileImage,
  FileArchive,
  FilePlus2,
  ImageDown,
  Sparkles,
  Gauge,
  Image as ImageIcon,
  Wand2,
  Printer,
  Scissors,
  RotateCw,
  FileImage as FileToImage,
  Stamp,
  FileSignature,
  FileEdit,
  ScanText,
  FileSpreadsheet,
  FileType2,
  FileX2,
  FileText,
  Lock,
  Unlock,
  type LucideIcon,
} from "lucide-react";

export type ToolBadge = "Popular" | "New" | "Gov Ready" | "Prime";
export type ToolCategory = "Document Resizers" | "PDF Utility" | "Image & Photo" | "Prime AI" | "Convert";

export interface ToolMeta {
  slug: string;
  title: string;
  short: string;
  description: string;
  category: ToolCategory;
  badge?: ToolBadge;
  icon: LucideIcon;
  accent: string;
  popular?: boolean;
  prime?: boolean;
}

export const TOOLS: ToolMeta[] = [
  {
    slug: "pan-photo-resizer",
    title: "PAN Card Photo Resizer",
    short: "Resize to 25×35 mm (NSDL/UTI standard).",
    description:
      "Auto crop and resize your photo to the exact 25×35 mm dimensions accepted by NSDL and UTIITSL portals. Output at 300 DPI.",
    category: "Document Resizers",
    badge: "Gov Ready",
    icon: IdCard,
    accent: "from-indigo-500 to-violet-600",
    popular: true,
  },
  {
    slug: "signature-resizer",
    title: "Signature Resizer",
    short: "Resize to 2 × 4.5 cm gov standard.",
    description:
      "Resize your scanned signature to the 2×4.5 cm size required by most government application portals. Maintains aspect with white padding.",
    category: "Document Resizers",
    badge: "Gov Ready",
    icon: PenTool,
    accent: "from-violet-500 to-purple-600",
    popular: true,
  },
  {
    slug: "passport-photo-maker",
    title: "Passport Photo Maker",
    short: "2×2 inch white-background photo.",
    description:
      "Create a 2×2 inch (51×51 mm) passport-style photo with a clean white background. Output at 300 DPI ready for printing.",
    category: "Document Resizers",
    badge: "Popular",
    icon: UserSquare2,
    accent: "from-fuchsia-500 to-pink-600",
    popular: true,
  },
  {
    slug: "aadhaar-merger",
    title: "Aadhaar Card Merger",
    short: "Merge front + back into one PDF / JPG.",
    description:
      "Upload the front and back of an Aadhaar card and merge both sides into a single A4 PDF or JPG, perfectly aligned for printing.",
    category: "PDF Utility",
    badge: "Popular",
    icon: FileImage,
    accent: "from-indigo-500 to-blue-600",
    popular: true,
  },
  {
    slug: "pdf-compressor",
    title: "PDF Compressor",
    short: "Bring PDFs under 100KB / 50KB.",
    description:
      "Reduce a PDF's file size to fit portal upload limits like 100KB, 50KB or any custom target. Pages are intelligently re-rendered.",
    category: "PDF Utility",
    badge: "Gov Ready",
    icon: FileArchive,
    accent: "from-violet-600 to-indigo-700",
    popular: true,
  },
  {
    slug: "merge-pdf",
    title: "Merge PDF",
    short: "Sejda-style advanced merge — Files/Pages view, zoom, rotate.",
    description:
      "Combine multiple PDFs and images into one document. Toggle between Files view and Pages view, zoom 50–200%, drag to reorder, rotate per file or per page, add blank pages, plus options for double-sided printing, same-size pages, cover, and footer.",
    category: "PDF Utility",
    icon: FilePlus2,
    accent: "from-purple-500 to-fuchsia-600",
    badge: "Popular",
    popular: true,
  },
  {
    slug: "jpg-to-pdf",
    title: "JPG to PDF",
    short: "Convert images into A4 PDF.",
    description:
      "Convert one or many JPG / PNG images into a single A4 PDF. Each image is centered and scaled to fit the page perfectly.",
    category: "PDF Utility",
    icon: ImageDown,
    accent: "from-indigo-600 to-violet-700",
  },
  {
    slug: "split-pdf",
    title: "Split PDF",
    short: "Split one PDF into many — download as ZIP.",
    description:
      "Open any PDF, click the scissors between pages to choose where to split, and download all the resulting PDFs together in a ZIP file. Quick presets: every page, every 2 pages, every 3 pages, or custom every N. Pages stay intact — nothing is deleted.",
    category: "PDF Utility",
    badge: "Popular",
    icon: Scissors,
    accent: "from-blue-500 to-indigo-600",
    popular: true,
  },
  {
    slug: "rotate-pdf",
    title: "Rotate PDF",
    short: "Fix sideways or upside-down pages.",
    description:
      "Rotate any PDF page 90°, 180° or 270°. Rotate one page at a time, or rotate every page at once with a single click. Perfect for fixing badly scanned documents.",
    category: "PDF Utility",
    badge: "New",
    icon: RotateCw,
    accent: "from-violet-500 to-indigo-600",
  },
  {
    slug: "pdf-to-jpg",
    title: "PDF to JPG",
    short: "Convert every page into a JPG image.",
    description:
      "Turn each PDF page into a high-quality JPG (up to 300 DPI). Download a single page or grab them all in one ZIP. Great for printing Aadhaar / PAN as photos.",
    category: "PDF Utility",
    badge: "New",
    icon: FileToImage,
    accent: "from-fuchsia-500 to-pink-600",
    popular: true,
  },
  {
    slug: "esign-pdf",
    title: "eSign PDF",
    short: "Draw your signature & stamp on any page.",
    description:
      "Draw your signature with mouse or touch, drag it to the exact spot on any page, resize to fit, and save the signed PDF. Add multiple signatures across multiple pages. 100% private.",
    category: "PDF Utility",
    badge: "Prime",
    icon: FileSignature,
    accent: "from-amber-400 via-yellow-500 to-purple-600",
    popular: true,
    prime: true,
  },
  {
    slug: "pdf-editor-v2",
    title: "Advanced PDF Editor",
    short: "All-in-one editor: photos, icons, text, shapes, white-out.",
    description:
      "Open any PDF and add photos, signatures, icons, text in any font/color, arrows to point at fields, rectangles & circles, and white-out boxes to erase existing text or images. Drag, resize, layer — and save a fully edited PDF. 100% private, runs in your browser.",
    category: "PDF Utility",
    badge: "Prime",
    icon: FileEdit,
    accent: "from-amber-400 via-yellow-500 to-purple-700",
    popular: true,
    prime: true,
  },
  {
    slug: "watermark-pdf",
    title: "Watermark PDF",
    short: "Add VERIFIED / DRAFT stamp on every page.",
    description:
      "Stamp custom text like 'VERIFIED BY SMIT CSC' across all pages of a PDF. Pick color, size, opacity, rotation. Apply to all pages, odd, even, or just first/last page.",
    category: "PDF Utility",
    badge: "Prime",
    icon: Stamp,
    accent: "from-amber-400 via-yellow-500 to-purple-600",
    prime: true,
  },
  {
    slug: "background-remover",
    title: "Background Remover",
    short: "Plain white or transparent BG.",
    description:
      "Remove the background of a photo and replace it with plain white or a transparent layer — perfect for ID and passport photos.",
    category: "Image & Photo",
    badge: "Popular",
    icon: Sparkles,
    accent: "from-fuchsia-500 to-violet-600",
    popular: true,
  },
  {
    slug: "dpi-converter",
    title: "DPI Converter",
    short: "Set image DPI to 200 / 300.",
    description:
      "Change an image's DPI metadata to 200 or 300 (or a custom value) as required by various government upload portals.",
    category: "Image & Photo",
    badge: "Gov Ready",
    icon: Gauge,
    accent: "from-indigo-500 to-purple-600",
  },
  {
    slug: "image-upscaler",
    title: "AI Image Upscaler",
    short: "Upscale to 4K with face sharpening.",
    description:
      "Premium AI-grade upscaler for low-res ID & document photos. Upscales to 2× / 4× with denoise and edge sharpening. Perfect for blurry passport, PAN, and Aadhaar photos.",
    category: "Prime AI",
    badge: "Prime",
    icon: Wand2,
    accent: "from-amber-400 via-yellow-500 to-purple-600",
    popular: true,
    prime: true,
  },
  {
    slug: "passport-engine",
    title: "Passport Printing Engine",
    short: "3.5×4.5 cm sheet, A4 / 4×6 / 5×7 at 300 DPI.",
    description:
      "Studio-grade passport sheet generator. Auto crops to 3.5×4.5 cm with cut borders, lays out 1–32 copies on A4 / 4×6 / 5×7 paper at exact 300 DPI, and exports a print-ready PDF.",
    category: "Prime AI",
    badge: "Prime",
    icon: Printer,
    accent: "from-amber-400 via-yellow-500 to-purple-600",
    popular: true,
    prime: true,
  },
  {
    slug: "id-card-engine",
    title: "ID Card Printing Engine",
    short: "86×56 mm Front+Back pair, A4 / 4×6 / 5×7 at 300 DPI.",
    description:
      "Studio-grade ID card sheet generator for Aadhaar, PAN, Voter ID, Ayushman, School ID & more. Upload PDF/JPG/PNG, crop Front & Back separately at 86×56 mm, lay out as F-B pairs on A4 / 4×6 / 5×7 paper at exact 300 DPI, and export a print-ready PDF.",
    category: "Prime AI",
    badge: "Prime",
    icon: CreditCard,
    accent: "from-amber-400 via-yellow-500 to-purple-600",
    popular: true,
    prime: true,
  },
  {
    slug: "delete-pages",
    title: "Delete Pages",
    short: "Click pages to remove from a PDF.",
    description:
      "Open any PDF, click the pages you want to delete, and download a new PDF without them. Fast, private, runs in your browser.",
    category: "PDF Utility",
    badge: "New",
    icon: FileX2,
    accent: "from-rose-500 to-pink-600",
    popular: true,
  },
  {
    slug: "pdf-to-text",
    title: "PDF to Text (OCR)",
    short: "Extract text from any PDF — even scanned.",
    description:
      "Pull all text out of a PDF as a plain .txt file. Text-based PDFs work instantly; scanned/image PDFs run through OCR with English, Gujarati or Hindi support.",
    category: "Convert",
    badge: "New",
    icon: ScanText,
    accent: "from-sky-500 to-indigo-600",
    popular: true,
  },
  {
    slug: "excel-to-pdf",
    title: "Excel to PDF",
    short: "Convert .xlsx / .csv into a printable PDF.",
    description:
      "Turn any spreadsheet (.xlsx, .xls or .csv) into a clean A4 PDF table. Each sheet becomes its own pages with auto-fit column widths.",
    category: "Convert",
    badge: "New",
    icon: FileSpreadsheet,
    accent: "from-emerald-500 to-teal-600",
    popular: true,
  },
  {
    slug: "pdf-to-word",
    title: "PDF to Word",
    short: "Convert a PDF into an editable .docx.",
    description:
      "Extract every line of text from a PDF and save it as a Microsoft Word .docx file you can open and edit. Best for text-based PDFs.",
    category: "Convert",
    badge: "New",
    icon: FileType2,
    accent: "from-blue-500 to-sky-600",
    popular: true,
  },
  {
    slug: "word-to-pdf",
    title: "Word to PDF",
    short: "Convert .docx documents into PDF.",
    description:
      "Upload a Microsoft Word .docx file and get back a clean A4 PDF. Runs entirely in your browser — your file never leaves your device.",
    category: "Convert",
    badge: "New",
    icon: FileText,
    accent: "from-cyan-500 to-blue-600",
    popular: true,
  },
  {
    slug: "lock-pdf",
    title: "Lock PDF",
    short: "Password protect any PDF in your browser.",
    description:
      "Add a password to any PDF so it can only be opened by people who know it. Encryption happens entirely in your browser — your file and password never leave your device.",
    category: "PDF Utility",
    badge: "New",
    icon: Lock,
    accent: "from-slate-700 to-zinc-900",
    popular: true,
  },
  {
    slug: "unlock-pdf",
    title: "Unlock PDF",
    short: "Remove the password from a PDF you own.",
    description:
      "Open any password-protected PDF and save a clean copy without the password. You must know the current password — runs 100% in your browser.",
    category: "PDF Utility",
    badge: "New",
    icon: Unlock,
    accent: "from-amber-500 to-orange-600",
    popular: true,
  },
  {
    slug: "prime-studio",
    title: "Prime Studio",
    short: "Canva-style design studio for posters, social posts & PDFs.",
    description:
      "Royal-purple design studio with shapes, text, icons, image uploads, AI background removal, multi-page support, undo/redo and 300 DPI PDF / PNG / JPG export. Built for Gujarat CSC operators — make banners, visiting cards, Instagram posts, A4 forms — all in your browser.",
    category: "Prime AI",
    badge: "Prime",
    icon: PenTool,
    accent: "from-purple-700 via-fuchsia-600 to-amber-500",
    popular: true,
    prime: true,
  },
  {
    slug: "image-compressor",
    title: "Image Compressor",
    short: "Force file size under any KB limit.",
    description:
      "Compress JPG / PNG images to a target file size (10KB to 1MB). Quality is auto-tuned to hit your exact upload requirement.",
    category: "Image & Photo",
    badge: "Popular",
    icon: ImageIcon,
    accent: "from-violet-500 to-indigo-600",
    popular: true,
  },
];

export const TOOLS_BY_CATEGORY: Record<ToolCategory, ToolMeta[]> = TOOLS.reduce(
  (acc, t) => {
    (acc[t.category] ||= []).push(t);
    return acc;
  },
  {} as Record<ToolCategory, ToolMeta[]>,
);

export const POPULAR_TOOLS = TOOLS.filter((t) => t.popular);

export function getTool(slug: string) {
  return TOOLS.find((t) => t.slug === slug);
}
