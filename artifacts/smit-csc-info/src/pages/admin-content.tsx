import { useState, useEffect } from "react";
import { useGetContent, getGetContentQueryKey, useAdminCreateContent, useAdminUpdateContent, useAdminDeleteContent, useAdminSyncYoutube } from "@workspace/api-client-react";
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
import { Pencil, Trash2, Plus, Lock, Youtube, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";

const contentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  titleGu: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  type: z.string().min(1, "Type is required"),
  link: z.string().min(1, "Link is required"),
  description: z.string().optional().nullable(),
  isPrime: z.boolean().default(false),
  thumbnailUrl: z.string().optional().nullable(),
});

export default function AdminContent() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: content, isLoading } = useGetContent({
    query: { queryKey: getGetContentQueryKey() }
  });

  const createMutation = useAdminCreateContent();
  const updateMutation = useAdminUpdateContent();
  const deleteMutation = useAdminDeleteContent();
  const syncMutation = useAdminSyncYoutube();

  const handleSyncYoutube = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (res: any) => {
        toast({
          title: "YouTube Sync Complete",
          description: res?.message || `${res?.videos ?? 0} videos synced.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });
      },
      onError: (err: any) => {
        toast({
          title: "Sync failed",
          description: err?.message || "Could not sync from YouTube.",
          variant: "destructive",
        });
      },
    });
  };

  const form = useForm<z.infer<typeof contentSchema>>({
    resolver: zodResolver(contentSchema),
    defaultValues: {
      title: "",
      titleGu: "",
      category: "",
      type: "video",
      link: "",
      description: "",
      isPrime: false,
      thumbnailUrl: "",
    }
  });

  function extractYoutubeId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
      /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  const watchedLink = form.watch("link");
  useEffect(() => {
    const currentThumb = form.getValues("thumbnailUrl");
    if (!currentThumb) {
      const videoId = extractYoutubeId(watchedLink || "");
      if (videoId) {
        form.setValue("thumbnailUrl", `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
      }
    }
  }, [watchedLink]);

  const onSubmit = (data: z.infer<typeof contentSchema>) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Content updated" });
          queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });
          setIsOpen(false);
        }
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Content created" });
          queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });
          setIsOpen(false);
        }
      });
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    form.reset({
      title: item.title,
      titleGu: item.titleGu || "",
      category: item.category,
      type: item.type,
      link: item.link,
      description: item.description || "",
      isPrime: item.isPrime,
      thumbnailUrl: item.thumbnailUrl || "",
    });
    setIsOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this content?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Content deleted" });
          queryClient.invalidateQueries({ queryKey: getGetContentQueryKey() });
        }
      });
    }
  };

  const openNew = () => {
    setEditingId(null);
    form.reset({
      title: "",
      titleGu: "",
      category: "schemes",
      type: "video",
      link: "",
      description: "",
      isPrime: false,
      thumbnailUrl: "",
    });
    setIsOpen(true);
  };

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="flex-1 p-4 md:p-8 container mx-auto">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-900 to-amber-700 bg-clip-text text-transparent">
            Manage Content
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sync videos directly from your YouTube channel, or add manual entries.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSyncYoutube}
            disabled={syncMutation.isPending}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold shadow-md"
          >
            {syncMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Youtube className="mr-2 h-4 w-4" />
            )}
            {syncMutation.isPending ? "Syncing..." : "Sync YouTube Data"}
          </Button>

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Content</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Content" : "Add New Content"}</DialogTitle>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title (English)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="titleGu"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title (Gujarati)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
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
                          <Input placeholder="e.g. schemes, tutorials" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. video, document" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="link"
                    className="col-span-2"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>YouTube Video URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground mt-1">
                          Individual video URL enter કરો (channel URL નહીં). Thumbnail auto-fill થશે.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="thumbnailUrl"
                    className="col-span-2"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Thumbnail URL (Auto-filled from YouTube)</FormLabel>
                        <FormControl>
                          <Input placeholder="YouTube URL enter કરો — auto-fill થશે" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    className="col-span-2"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isPrime"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 col-span-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Prime Content</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Only accessible by members with an active Prime subscription
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Update Content" : "Create Content"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      
      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {content?.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium line-clamp-1 max-w-[300px]">{item.title}</div>
                  {item.titleGu && <div className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]">{item.titleGu}</div>}
                </TableCell>
                <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                <TableCell>{item.type}</TableCell>
                <TableCell>
                  {item.isPrime ? (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Lock className="h-3 w-3 mr-1"/> Prime</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Free</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{format(new Date(item.createdAt), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                    <Pencil className="h-4 w-4 text-blue-600" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
