import { useAdminGetUsers, getAdminGetUsersQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2,
  ShieldCheck,
  Crown,
  User,
  MoreHorizontal,
  KeyRound,
  Sparkles,
  XCircle,
  Search,
  Trash2,
} from "lucide-react";
import { isSuperAdminEmail } from "@/lib/super-admins";

type Role = "user" | "manager" | "admin";
type PrimeFilter = "all" | "prime" | "free";

function roleBadgeProps(role: string) {
  if (role === "admin") return { className: "bg-indigo-100 text-indigo-700 border-indigo-200", label: "Admin", Icon: ShieldCheck };
  if (role === "manager") return { className: "bg-violet-100 text-violet-700 border-violet-200", label: "Manager", Icon: Crown };
  return { className: "bg-gray-100 text-gray-600 border-gray-200", label: "User", Icon: User };
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Per-row busy tracking — each user id is independent so concurrent actions don't clobber each other.
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const markBusy = (id: number) => setBusyIds((s) => { const n = new Set(s); n.add(id); return n; });
  const markIdle = (id: number) => setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; });
  const isBusy = (id: number) => busyIds.has(id);

  const [filter, setFilter] = useState<PrimeFilter>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useAdminGetUsers({
    query: { queryKey: getAdminGetUsersQueryKey() },
  });

  const isAdmin = currentUser?.role === "admin";
  // Only the hard-coded super-admin allowlist may delete user accounts.
  // Server enforces the same list (lib/super-admins.ts) — this flag is
  // used purely to gate the UI affordance.
  const isSuperAdmin = isSuperAdminEmail(currentUser?.email);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getAdminGetUsersQueryKey() });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) =>
      apiFetch(`/api/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: (_d, vars) => { refresh(); toast({ title: `Role updated to ${vars.role}` }); },
    onError: (err: Error) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
    onSettled: (_d, _e, vars) => markIdle(vars.id),
  });

  const grantPrime = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) =>
      apiFetch(`/api/admin/grant-prime`, { method: "POST", body: JSON.stringify({ email, days: 30 }) }),
    onSuccess: () => { refresh(); toast({ title: "Prime granted (30 days)" }); },
    onError: (err: Error) => { toast({ title: "Failed to grant Prime", description: err.message, variant: "destructive" }); },
    onSettled: (_d, _e, vars) => markIdle(vars.id),
  });

  const revokePrime = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) =>
      apiFetch(`/api/admin/revoke-prime`, { method: "POST", body: JSON.stringify({ email }) }),
    onSuccess: () => { refresh(); toast({ title: "Prime revoked" }); },
    onError: (err: Error) => { toast({ title: "Failed to revoke Prime", description: err.message, variant: "destructive" }); },
    onSettled: (_d, _e, vars) => markIdle(vars.id),
  });

  const deleteUser = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: (_d, id) => {
      const u = data?.users.find((x) => x.id === id);
      refresh();
      toast({ title: "User deleted", description: u ? u.email : undefined });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
    onSettled: (_d, _e, id) => markIdle(id),
  });

  const resetPwd = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/users/${id}/reset-password`, { method: "POST" }),
    onSuccess: (_d, id) => {
      const u = data?.users.find((x) => x.id === id);
      toast({ title: "Reset email sent", description: u ? `Sent to ${u.email}` : undefined });
    },
    onError: (err: Error) => { toast({ title: "Reset failed", description: err.message, variant: "destructive" }); },
    onSettled: (_d, _e, id) => markIdle(id),
  });

  const visible = useMemo(() => {
    if (!data?.users) return [];
    return data.users.filter((u) => {
      const isPrime = (u as any).isPrime ?? false;
      if (filter === "prime" && !isPrime) return false;
      if (filter === "free" && isPrime) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !u.name.toLowerCase().includes(q) &&
          !u.email.toLowerCase().includes(q) &&
          !(u.mobile || "").includes(q)
        ) return false;
      }
      return true;
    });
  }, [data?.users, filter, search]);

  const counts = useMemo(() => {
    const all = data?.users?.length ?? 0;
    const prime = data?.users?.filter((u) => (u as any).isPrime).length ?? 0;
    return { all, prime, free: all - prime };
  }, [data?.users]);

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
        <h1 className="text-2xl font-bold">Manage Users</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {data?.total ?? 0} total users · {counts.prime} Prime · {counts.free} Free
          {!isAdmin && " — Role/membership management requires admin access."}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            data-testid="admin-users-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or mobile…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "free", "prime"] as PrimeFilter[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={filter === k ? "default" : "outline"}
              onClick={() => setFilter(k)}
              data-testid={`admin-filter-${k}`}
              className="capitalize"
            >
              {k} ({k === "all" ? counts.all : k === "prime" ? counts.prime : counts.free})
            </Button>
          ))}
        </div>
      </div>

      <div className="border rounded-md bg-white overflow-x-auto">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Name</TableHead>
              <TableHead className="whitespace-nowrap">Email</TableHead>
              <TableHead className="whitespace-nowrap">Mobile</TableHead>
              <TableHead className="whitespace-nowrap">Role</TableHead>
              <TableHead className="whitespace-nowrap">Prime</TableHead>
              <TableHead className="whitespace-nowrap">Joined</TableHead>
              {isAdmin && <TableHead className="whitespace-nowrap text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-10 text-sm text-muted-foreground">
                  No users match the current filter.
                </TableCell>
              </TableRow>
            )}
            {visible.map((u) => {
              const { className, label, Icon } = roleBadgeProps(u.role);
              const isPrime = (u as any).isPrime ?? false;
              const isSelf = u.id === currentUser?.id;
              const busy = isBusy(u.id);

              return (
                <TableRow key={u.id} data-testid={`admin-user-row-${u.id}`}>
                  <TableCell className="font-medium whitespace-nowrap">{u.name}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-sm">{u.mobile || "—"}</TableCell>
                  <TableCell>
                    <Badge className={`flex items-center gap-1 w-fit text-xs ${className}`}>
                      <Icon className="h-3 w-3" /> {label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isPrime ? (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1">
                        <Crown className="h-3 w-3" /> Prime
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Free</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(u.createdAt), "dd MMM yyyy")}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground italic">You</span>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              data-testid={`admin-user-actions-${u.id}`}
                              className="text-xs"
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MoreHorizontal className="h-3 w-3" />}
                              <span className="ml-1">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {isPrime ? (
                              <DropdownMenuItem
                                onClick={() => { markBusy(u.id); revokePrime.mutate({ id: u.id, email: u.email }); }}
                                className="text-red-600 focus:text-red-700"
                                data-testid={`admin-revoke-prime-${u.id}`}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-2" /> Revoke Prime
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => { markBusy(u.id); grantPrime.mutate({ id: u.id, email: u.email }); }}
                                className="text-amber-700 focus:text-amber-800"
                                data-testid={`admin-grant-prime-${u.id}`}
                              >
                                <Sparkles className="h-3.5 w-3.5 mr-2" /> Grant Prime (30 days)
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                if (confirm(`Send a password-reset email to ${u.email}?`)) {
                                  markBusy(u.id); resetPwd.mutate(u.id);
                                }
                              }}
                              data-testid={`admin-reset-password-${u.id}`}
                            >
                              <KeyRound className="h-3.5 w-3.5 mr-2" /> Send Password Reset
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {u.role === "user" ? (
                              <DropdownMenuItem
                                onClick={() => { markBusy(u.id); changeRole.mutate({ id: u.id, role: "manager" }); }}
                                className="text-violet-700 focus:text-violet-800"
                              >
                                <Crown className="h-3.5 w-3.5 mr-2" /> Promote to Manager
                              </DropdownMenuItem>
                            ) : u.role === "manager" ? (
                              <DropdownMenuItem
                                onClick={() => { markBusy(u.id); changeRole.mutate({ id: u.id, role: "user" }); }}
                              >
                                <User className="h-3.5 w-3.5 mr-2" /> Demote to User
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem disabled>
                                <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Admin (protected)
                              </DropdownMenuItem>
                            )}
                            {/* Delete account — super-admin only.
                                Backend (lib/super-admins.ts) blocks
                                deletion of self and of any other
                                super-admin even if the UI somehow
                                requested it. */}
                            {isSuperAdmin &&
                              !isSuperAdminEmail(u.email) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (
                                        confirm(
                                          `Permanently delete ${u.email}? This cannot be undone.`,
                                        )
                                      ) {
                                        markBusy(u.id);
                                        deleteUser.mutate(u.id);
                                      }
                                    }}
                                    className="text-red-600 focus:text-red-700"
                                    data-testid={`admin-delete-user-${u.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />{" "}
                                    Delete Account
                                  </DropdownMenuItem>
                                </>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
