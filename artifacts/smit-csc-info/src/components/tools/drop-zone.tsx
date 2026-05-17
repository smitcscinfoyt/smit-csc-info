import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Upload, X, FileText, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/tools/file";
import { consumePendingFile, subscribeToPipeline } from "@/lib/tools/pipeline";

interface DropZoneProps {
  accept: string;
  multiple?: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
  label?: string;
  hint?: string;
  maxSizeMb?: number;
  preview?: ReactNode;
}

interface FilePreview {
  file: File;
  url: string | null;
}

export function DropZone({
  accept,
  multiple = false,
  files,
  onFiles,
  label = "Drag & drop a file here",
  hint = "or click to browse",
  maxSizeMb = 25,
  preview,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipedIn, setPipedIn] = useState(false);

  // Stop the browser from navigating away to a dropped file when the user
  // misses the dropzone target by even a few pixels.
  useEffect(() => {
    const block = (e: globalThis.DragEvent) => {
      const types = e.dataTransfer?.types;
      if (!types) return;
      if (Array.from(types).includes("Files")) {
        e.preventDefault();
      }
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  // Auto-load piped file from previous tool.
  useEffect(() => {
    let active = true;
    const tryConsume = async () => {
      if (!active) return;
      if (filesRef.current.length > 0) return;
      const piped = await consumePendingFile(accept);
      if (!active) return;
      if (piped) {
        setPipedIn(true);
        onFilesRef.current([piped]);
      }
    };
    void tryConsume();
    const unsub = subscribeToPipeline(() => {
      void tryConsume();
    });
    return () => {
      active = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build object-URL previews for image files in an effect so URL creation is
  // a tracked side-effect (StrictMode-safe) and previous URLs are deterministically revoked.
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  useEffect(() => {
    const next: FilePreview[] = files.map((f) => ({
      file: f,
      url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
    }));
    setPreviews(next);
    return () => {
      next.forEach((p) => {
        if (p.url) URL.revokeObjectURL(p.url);
      });
    };
  }, [files]);

  const handle = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    const max = maxSizeMb * 1024 * 1024;
    const oversize = list.find((f) => f.size > max);
    if (oversize) {
      setError(`${oversize.name} is over ${maxSizeMb} MB.`);
      return;
    }
    setError(null);
    onFiles(multiple ? [...files, ...list] : list.slice(0, 1));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handle(e.dataTransfer?.files ?? null);
  };

  const removeAt = (idx: number) => {
    onFiles(files.filter((_, i) => i !== idx));
  };

  const hasFiles = files.length > 0;
  const openPicker = () => inputRef.current?.click();

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={hasFiles ? undefined : openPicker}
        onKeyDown={
          hasFiles
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openPicker();
                }
              }
        }
        role={hasFiles ? undefined : "button"}
        tabIndex={hasFiles ? undefined : 0}
        aria-label={hasFiles ? undefined : label}
        className={`relative border-2 border-dashed rounded-2xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 ${
          drag
            ? "border-indigo-500 bg-indigo-50/80"
            : hasFiles
              ? "border-indigo-200 bg-white"
              : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/40 bg-white cursor-pointer"
        } ${hasFiles ? "p-4 sm:p-5" : "p-8 sm:p-12 text-center"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            handle(e.target.files);
            // Reset so re-selecting the same file still fires onChange.
            if (inputRef.current) inputRef.current.value = "";
          }}
        />

        {!hasFiles && (
          <div className="flex flex-col items-center gap-2">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Upload className="h-7 w-7 text-white" />
            </div>
            <div className="text-base font-semibold text-gray-900 mt-2">{label}</div>
            <div className="text-sm text-gray-500">{hint}</div>
            <div className="text-[11px] text-gray-400 mt-1">
              Max {maxSizeMb} MB • {accept.replace(/image\//g, "").replace(/application\//g, "")}
            </div>
          </div>
        )}

        {hasFiles && (
          <div className="flex flex-col gap-3">
            <div
              className={`grid gap-3 ${
                previews.length === 1
                  ? "grid-cols-1"
                  : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
              }`}
            >
              {previews.map((p, i) => (
                <FileTile
                  key={`${p.file.name}-${i}`}
                  preview={p}
                  onRemove={(e) => {
                    e.stopPropagation();
                    removeAt(i);
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-[11px] text-gray-500">
                {files.length} file{files.length > 1 ? "s" : ""} ready
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
                className="h-8 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1.5" />
                {multiple ? "Add more" : "Choose another"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {pipedIn && hasFiles && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-800">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          Continuing with the file from your previous tool. Choose another file to start fresh.
        </div>
      )}

      {preview && <div className="mt-6">{preview}</div>}
    </div>
  );
}

function FileTile({
  preview,
  onRemove,
}: {
  preview: FilePreview;
  onRemove: (e: React.MouseEvent) => void;
}) {
  const { file, url } = preview;
  const isImage = !!url;
  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  return (
    <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
      <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden">
        {isImage ? (
          <img
            src={url!}
            alt={file.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-gray-500 px-3">
            <div
              className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                isPdf
                  ? "bg-rose-100 text-rose-600"
                  : "bg-indigo-100 text-indigo-600"
              }`}
            >
              <FileText className="h-6 w-6" />
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider">
              {isPdf ? "PDF" : (file.name.split(".").pop() || "file").slice(0, 5)}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-white/95 border border-gray-200 shadow-sm text-gray-500 hover:text-red-600 hover:border-red-300 flex items-center justify-center transition-colors"
          aria-label="Remove file"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-2.5 py-2 border-t border-gray-100">
        <div className="text-xs font-medium text-gray-900 truncate" title={file.name}>
          {file.name}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">{formatBytes(file.size)}</div>
      </div>
    </div>
  );
}
