import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Pin, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Review {
  id: number;
  userId: number;
  userName: string;
  rating: number;
  reviewText: string;
  isPinned: boolean;
  createdAt: string;
}

export default function AdminReviews() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: reviews, isLoading } = useQuery<Review[]>({
    queryKey: ["admin-reviews"],
    queryFn: () => apiFetch<Review[]>("/api/admin/reviews"),
  });

  const togglePin = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/reviews/${id}/pin`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["reviews-public"] });
      toast({ title: "Pin status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteReview = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/reviews/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["reviews-public"] });
      toast({ title: "Review deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-8 container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Manage Reviews</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {reviews?.length ?? 0} total review{reviews?.length !== 1 ? "s" : ""}. Pinned reviews appear first on the home page.
        </p>
      </div>

      {!reviews || reviews.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-xl bg-gray-50">
          <Star className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No reviews yet</p>
          <p className="text-sm mt-1">Reviews submitted by members will appear here.</p>
        </div>
      ) : (
        <div className="border rounded-md bg-white overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap w-8">#</TableHead>
                <TableHead className="whitespace-nowrap">Member</TableHead>
                <TableHead className="whitespace-nowrap">Rating</TableHead>
                <TableHead>Review</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((review) => (
                <TableRow key={review.id} className={review.isPinned ? "bg-amber-50/50" : ""}>
                  <TableCell className="text-muted-foreground text-xs font-mono">{review.id}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{review.userName}</TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-3.5 w-3.5 ${s <= review.rating ? "text-amber-400 fill-current" : "text-gray-200 fill-current"}`}
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="text-sm text-gray-700 line-clamp-2">{review.reviewText}</p>
                  </TableCell>
                  <TableCell>
                    {review.isPinned ? (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 flex items-center gap-1 w-fit">
                        <Pin className="h-3 w-3" /> Pinned
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Normal</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(review.createdAt), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => togglePin.mutate(review.id)}
                        disabled={togglePin.isPending}
                        title={review.isPinned ? "Unpin" : "Pin to top"}
                        className={review.isPinned ? "border-amber-300 text-amber-600 hover:bg-amber-50" : ""}
                      >
                        {togglePin.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                        {review.isPinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Delete review by ${review.userName}?`)) {
                            deleteReview.mutate(review.id);
                          }
                        }}
                        disabled={deleteReview.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      >
                        {deleteReview.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
