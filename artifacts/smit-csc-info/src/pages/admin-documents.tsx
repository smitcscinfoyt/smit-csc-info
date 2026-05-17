import { useState, useRef } from "react";
import {
  useGetDocuments,
  getGetDocumentsQueryKey,
  useAdminCreateDocument,
  useAdminDeleteDocument,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Upload, FileText, Lock, Loader2, Link2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPT",
  "image/jpeg": "Image",
  "image/jpg": "Image",
  "image/png": "Image",
};

const CATEGORIES = ["General", "Schemes", "Forms", "Tutorials", "Guidelines", "Notifications"];

const docSchema = z.object({
  title: z.string().min(1, "Title required"),
  description: z.string().optional().nullable(),
  category: z.string().min(1, "Category required"),
  isPrime: z.boolean().default(false),
});

type DocFormValues = z.infer<typeof docSchema>;

const FILE_TYPE_OPTIONS = ["PDF", "Word", "PPT", "Image", "Link"] as const;

/**
 * Normalize popular share-link formats (Google Drive, Dropbox, OneDrive)
 * into a viewable URL the browser can open in a new tab. Falls back to
 * the original URL when no known pattern matches.
 *
 *  • Drive `file/d/<id>/view` or `open?id=<id>` → `uc?export=view&id=<id>`
 *  • Dropbox `?dl=0`        → `?raw=1`
 *  • OneDrive `?e=xxx`      → leave as-is (Microsoft handles it)
 */
function normalizeShareUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  try {
    const u = new URL(url);
    // Google Drive
    if (/(^|\.)drive\.google\.com$/.test(u.hostname)) {
      const m1 = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = m1?.[1] ?? u.searchParams.get("id");
      if (id) return `https://drive.google.com/uc?export=view&id=${id}`;
    }
    // Dropbox: force raw download view
    if (/(^|\.)dropbox\.com$/.test(u.hostname)) {
      u.searchParams.set("raw", "1");
      u.searchParams.delete("dl");
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/** Strip anything that isn't a plain http(s) URL — protects every
 *  downstream `<a href>` from javascript:/data:/file: schemes. Returns
 *  `null` for unsafe input (used to disable the preview anchor and
 *  block submit). */
function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Best-effort filetype guess from a URL's extension. */
function guessTypeFromUrl(url: string): typeof FILE_TYPE_OPTIONS[number] {
  const lower = url.toLowerCase().split("?")[0];
  if (/\.pdf$/.test(lower)) return "PDF";
  if (/\.(docx?|odt)$/.test(lower)) return "Word";
  if (/\.(pptx?|odp)$/.test(lower)) return "PPT";
  if (/\.(jpe?g|png|gif|webp|bmp)$/.test(lower)) return "Image";
  return "Link";
}

async function uploadToStorage(file: File): Promise<string> {
  const urlRes = await fetch(`${API_BASE}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
  });
  if (!urlRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await urlRes.json();

  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!uploadRes.ok) throw new Error("File upload to storage failed");
  return objectPath;
}

function getFileIcon(fileType: string) {
  if (fileType === "PDF") return "🔴";
  if (fileType === "Word") return "🔵";
  if (fileType === "PPT") return "🟠";
  if (fileType === "Image") return "🟢";
  return "📄";
}

export default function AdminDocuments() {
  const [isOpen, setIsOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "link">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkType, setLinkType] = useState<typeof FILE_TYPE_OPTIONS[number]>("Link");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: documents, isLoading } = useGetDocuments({
    query: { queryKey: getGetDocumentsQueryKey() },
  });

  const createMutation = useAdminCreateDocument();
  const deleteMutation = useAdminDeleteDocument();

  const form = useForm<DocFormValues>({
    resolver: zodResolver(docSchema),
    defaultValues: { title: "", description: "", category: "General", isPrime: false },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES[file.type]) {
      toast({ title: "Invalid file type", description: "PDF, Word, PPT, JPG, PNG allowed", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    if (!form.getValues("title")) {
      form.setValue("title", file.name.replace(/\.[^.]+$/, ""));
    }
  };

  const resetDialog = () => {
    setSelectedFile(null);
    setLinkUrl("");
    setLinkType("Link");
    setUploadMode("file");
    form.reset();
  };

  const onSubmit = async (data: DocFormValues) => {
    if (uploadMode === "file" && !selectedFile) {
      toast({ title: "File select કરો", description: "Document upload કરવા file select કરવી જરૂરી છે", variant: "destructive" });
      return;
    }
    if (uploadMode === "link") {
      const trimmed = linkUrl.trim();
      if (!trimmed) {
        toast({ title: "Link દાખલ કરો", description: "Google Drive અથવા external URL paste કરો", variant: "destructive" });
        return;
      }
      if (!safeHttpUrl(trimmed)) {
        toast({ title: "Invalid URL", description: "https:// અથવા http:// થી શરૂ થતી valid link આપો", variant: "destructive" });
        return;
      }
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      let fileUrl: string;
      let fileName: string;
      let fileType: string;

      if (uploadMode === "file" && selectedFile) {
        setUploadProgress(30);
        const objectPath = await uploadToStorage(selectedFile);
        setUploadProgress(70);
        fileUrl = `${API_BASE}/api/storage${objectPath}`;
        fileName = selectedFile.name;
        fileType = ALLOWED_TYPES[selectedFile.type] ?? "File";
      } else {
        setUploadProgress(50);
        fileUrl = normalizeShareUrl(linkUrl);
        // Derive a friendly filename from URL pathname when blank.
        try {
          const u = new URL(fileUrl);
          const last = u.pathname.split("/").filter(Boolean).pop() ?? u.hostname;
          fileName = decodeURIComponent(last) || u.hostname;
        } catch {
          fileName = data.title;
        }
        fileType = linkType === "Link" ? guessTypeFromUrl(fileUrl) : linkType;
      }

      await createMutation.mutateAsync({
        data: {
          title: data.title,
          description: data.description ?? null,
          fileUrl,
          fileName,
          fileType,
          category: data.category,
          isPrime: data.isPrime,
        },
      });

      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: getGetDocumentsQueryKey() });
      toast({ title: "Document upload successful!" });
      setIsOpen(false);
      resetDialog();
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Document delete કરવું?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDocumentsQueryKey() });
          toast({ title: "Document deleted" });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Documents</h2>
          <p className="text-muted-foreground">PDF, Word, PPT, Image files manage કરો</p>
        </div>
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            // Clear stale form/link state when the user closes the
            // dialog without submitting — prevents next open from
            // showing the previous link/file.
            if (!open && !isUploading) resetDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
            {/* Sticky header — keeps the title and the built-in × close
                button always visible even when the body scrolls. */}
            <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
              <DialogTitle>Document Upload</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4 px-6 py-4 overflow-y-auto flex-1"
              >
                <Tabs
                  value={uploadMode}
                  onValueChange={(v) => setUploadMode(v as "file" | "link")}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="file" data-testid="tab-upload-file">
                      <Upload className="h-4 w-4 mr-1.5" /> File Upload
                    </TabsTrigger>
                    <TabsTrigger value="link" data-testid="tab-upload-link">
                      <Link2 className="h-4 w-4 mr-1.5" /> Link / URL
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="file" className="mt-3">
                    <div
                      className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      {selectedFile ? (
                        <div className="space-y-1">
                          <div className="text-3xl">{getFileIcon(ALLOWED_TYPES[selectedFile.type] ?? "File")}</div>
                          <p className="font-medium text-sm">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {ALLOWED_TYPES[selectedFile.type]}
                          </p>
                          <p className="text-xs text-primary">Click to change</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
                          <p className="font-medium">File select કરો</p>
                          <p className="text-xs text-muted-foreground">PDF · Word · PPT · JPG · PNG</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="link" className="mt-3 space-y-3">
                    <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-center text-muted-foreground">
                        <Link2 className="h-8 w-8" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Document URL</label>
                        <Input
                          type="url"
                          placeholder="https://drive.google.com/file/d/..."
                          value={linkUrl}
                          onChange={(e) => {
                            setLinkUrl(e.target.value);
                            // Auto-suggest type & title when user pastes a link
                            if (e.target.value && !form.getValues("title")) {
                              try {
                                const u = new URL(e.target.value);
                                const last = u.pathname.split("/").filter(Boolean).pop();
                                if (last) {
                                  form.setValue(
                                    "title",
                                    decodeURIComponent(last).replace(/\.[^.]+$/, ""),
                                  );
                                }
                              } catch {
                                /* ignore */
                              }
                            }
                            const guessed = guessTypeFromUrl(e.target.value);
                            if (guessed !== "Link") setLinkType(guessed);
                          }}
                          data-testid="input-document-url"
                        />
                        <p className="text-xs text-muted-foreground">
                          Google Drive, Dropbox, અથવા external https:// URL paste કરો. Drive share-links automatically convert થશે.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Type</label>
                        <select
                          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                          value={linkType}
                          onChange={(e) =>
                            setLinkType(e.target.value as typeof FILE_TYPE_OPTIONS[number])
                          }
                          data-testid="select-link-type"
                        >
                          {FILE_TYPE_OPTIONS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      {linkUrl.trim() && (() => {
                        // Only render an <a href> when the URL is a
                        // plain http(s) URL — never `javascript:` or
                        // `data:`. Otherwise show a disabled hint.
                        const safe = safeHttpUrl(normalizeShareUrl(linkUrl));
                        return safe ? (
                          <a
                            href={safe}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> Preview link
                          </a>
                        ) : (
                          <span className="text-xs text-destructive">
                            URL valid નથી (https:// જરૂરી)
                          </span>
                        );
                      })()}
                    </div>
                  </TabsContent>
                </Tabs>

                {isUploading && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Document title" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Short description" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <select
                          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                          {...field}
                          value={field.value ?? "General"}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isPrime"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Prime Content</FormLabel>
                        <p className="text-sm text-muted-foreground">ફક્ત Prime members access કરી શકશે</p>
                      </div>
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isUploading}>
                  {isUploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> Upload Document</>
                  )}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            )}
            {!isLoading && (!documents || documents.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>કોઈ document upload નથી</p>
                  <p className="text-xs mt-1">Upload Document button click કરો</p>
                </TableCell>
              </TableRow>
            )}
            {documents?.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <span className="text-xl">{getFileIcon(doc.fileType)}</span>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{doc.title}</p>
                    {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{doc.fileName}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{doc.category}</Badge>
                </TableCell>
                <TableCell>
                  {doc.isPrime ? (
                    <Badge className="bg-yellow-500 text-white"><Lock className="h-3 w-3 mr-1" />Prime</Badge>
                  ) : (
                    <Badge variant="outline">Free</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(doc.createdAt), "dd MMM yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="icon" asChild>
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
