import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Inbox,
  CheckCircle2,
  Trash2,
  Loader2,
  Mail,
  Phone,
  Eye,
  Send,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Inquiry {
  id: number;
  userName: string;
  email: string;
  mobile: string | null;
  category: string;
  subject: string | null;
  transactionId: string | null;
  txDate: string | null;
  message: string;
  adminReply: string | null;
  status: "Pending" | "Replied" | "Resolved";
  userId: number | null;
  createdAt: string;
  repliedAt: string | null;
  resolvedAt: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical Issue",
  prime: "Prime Membership",
  document: "Document Correction",
  schemes: "Government Schemes",
  recharge: "Recharge / Bill",
  recharge_mobile: "Mobile / DTH recharge",
  recharge_bill: "Bill payment",
  wallet: "Wallet top-up",
  money_transfer: "Money Transfer (DMT)",
  kyc: "KYC",
  commission: "Commission",
  tpin: "T-PIN",
  operator_membership: "Operator Membership",
  payment_phonepe: "PhonePe Payment",
  refund: "Refund",
  coupon: "Coupon",
  tool_pdf_editor: "Tool: PDF Editor",
  tool_esign: "Tool: E-sign PDF",
  tool_watermark: "Tool: Watermark PDF",
  tool_bg_remover: "Tool: Background Remover",
  tool_image_upscaler: "Tool: Image Upscaler",
  tool_id_card: "Tool: ID Card Engine",
  tool_passport: "Tool: Passport Engine",
  tool_prime_studio: "Tool: Prime Studio",
  live_data: "Live Data",
  youtube_pdf: "YouTube / PDF Library",
  account_login: "Login / Signup",
  profile: "Profile Update",
  feedback: "Feedback",
  other: "Other",
};

function statusBadge(status: Inquiry["status"]) {
  if (status === "Pending")
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>;
  if (status === "Replied")
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Replied</Badge>;
  return (
    <Badge className="bg-green-100 text-green-800 border-green-200 flex items-center gap-1 w-fit">
      <CheckCircle2 className="h-3 w-3" />
      Resolved
    </Badge>
  );
}

export default function AdminInquiries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "Pending" | "Replied" | "Resolved">("all");
  const [active, setActive] = useState<Inquiry | null>(null);
  const [reply, setReply] = useState("");

  const { data: inquiries, isLoading } = useQuery<Inquiry[]>({
    queryKey: ["admin-inquiries", filter],
    queryFn: () =>
      apiFetch<Inquiry[]>(
        filter === "all" ? "/api/admin/inquiries" : `/api/admin/inquiries?status=${filter}`,
      ),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (active) {
      setReply(active.adminReply ?? "");
    } else {
      setReply("");
    }
  }, [active]);

  const sendReply = useMutation({
    mutationFn: ({ id, adminReply, resolve }: { id: number; adminReply: string; resolve: boolean }) =>
      apiFetch(`/api/admin/inquiries/${id}/reply`, {
        method: "PATCH",
        body: JSON.stringify({ adminReply, resolve }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["admin-inquiries-unread"] });
      setActive(null);
      toast({ title: "Reply sent", description: "The user can now view your response." });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/inquiries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["admin-inquiries-unread"] });
      setActive(null);
      toast({ title: "Inquiry deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const pendingCount = inquiries?.filter((i) => i.status === "Pending").length ?? 0;

  return (
    <div className="flex-1 p-4 md:p-8 container mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            Inquiries & Queries
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {inquiries?.length ?? 0} total · {pendingCount} pending
          </p>
        </div>
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger className="w-[180px]" data-testid="filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All inquiries</SelectItem>
            <SelectItem value="Pending">Pending only</SelectItem>
            <SelectItem value="Replied">Replied only</SelectItem>
            <SelectItem value="Resolved">Resolved only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !inquiries || inquiries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-xl bg-gray-50">
          <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No inquiries yet</p>
          <p className="text-sm mt-1">
            User inquiries from the Help & Support page will appear here.
          </p>
        </div>
      ) : (
        <div className="border rounded-md bg-white overflow-x-auto">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Txn ID</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inquiries.map((inq) => (
                <TableRow
                  key={inq.id}
                  className={inq.status === "Pending" ? "bg-amber-50/40" : ""}
                  data-testid={`inquiry-row-${inq.id}`}
                >
                  <TableCell className="text-muted-foreground text-xs font-mono">
                    {inq.id}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{inq.userName}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {inq.email}
                    </div>
                    {inq.mobile && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {inq.mobile}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {CATEGORY_LABELS[inq.category] ?? inq.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <p className="text-sm text-gray-800 line-clamp-2">{inq.subject ?? "—"}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {inq.transactionId ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="text-sm text-gray-700 line-clamp-2">{inq.message}</p>
                  </TableCell>
                  <TableCell>{statusBadge(inq.status)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(inq.createdAt), "dd MMM yyyy, HH:mm")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActive(inq)}
                        title="View / Reply"
                        data-testid={`btn-view-${inq.id}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {inq.status !== "Resolved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/40 text-primary hover:bg-primary/5"
                          onClick={() => setActive(inq)}
                          data-testid={`btn-reply-${inq.id}`}
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline ml-1">Reply</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (confirm(`Delete inquiry from ${inq.userName}?`)) {
                            remove.mutate(inq.id);
                          }
                        }}
                        disabled={remove.isPending}
                        data-testid={`btn-delete-${inq.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Inquiry #{active?.id}
            </DialogTitle>
            <DialogDescription>
              From {active?.userName} ·{" "}
              {active ? format(new Date(active.createdAt), "dd MMM yyyy, HH:mm") : ""}
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Email</div>
                  <div className="font-medium text-sm">{active.email}</div>
                </div>
                {active.mobile && (
                  <div>
                    <div className="text-muted-foreground">Mobile</div>
                    <div className="font-medium text-sm">{active.mobile}</div>
                  </div>
                )}
                <div>
                  <div className="text-muted-foreground">Category</div>
                  <Badge variant="outline" className="mt-0.5">
                    {CATEGORY_LABELS[active.category] ?? active.category}
                  </Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div className="mt-0.5">{statusBadge(active.status)}</div>
                </div>
                {active.subject && (
                  <div className="col-span-2">
                    <div className="text-muted-foreground">Subject</div>
                    <div className="font-medium text-sm">{active.subject}</div>
                  </div>
                )}
                {active.transactionId && (
                  <div>
                    <div className="text-muted-foreground">Transaction ID</div>
                    <div className="font-mono text-sm">{active.transactionId}</div>
                  </div>
                )}
                {active.txDate && (
                  <div>
                    <div className="text-muted-foreground">Transaction Date</div>
                    <div className="font-medium text-sm">
                      {format(new Date(active.txDate), "dd MMM yyyy")}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="text-muted-foreground text-xs mb-1.5">User's message</div>
                <div className="bg-gray-50 border rounded-lg p-3 whitespace-pre-wrap text-gray-800">
                  {active.message}
                </div>
              </div>

              <div>
                <Label htmlFor="adminReply" className="text-xs text-muted-foreground">
                  Your reply to the user
                </Label>
                <Textarea
                  id="adminReply"
                  placeholder="Type your solution or response here. The user will see this in their Support History."
                  rows={5}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className="mt-1.5"
                  data-testid="input-admin-reply"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {reply.length}/4000 characters
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setActive(null)}>
              Close
            </Button>
            {active && (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    sendReply.mutate({ id: active.id, adminReply: reply, resolve: false })
                  }
                  disabled={sendReply.isPending || reply.trim().length < 2}
                  data-testid="btn-save-draft"
                >
                  {sendReply.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Save Reply
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() =>
                    sendReply.mutate({ id: active.id, adminReply: reply, resolve: true })
                  }
                  disabled={sendReply.isPending || reply.trim().length < 2}
                  data-testid="btn-reply-resolve"
                >
                  {sendReply.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Send & Resolve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
