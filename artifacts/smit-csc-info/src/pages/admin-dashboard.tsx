import { useAdminGetStats, getAdminGetStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CreditCard, Video, Activity, FileText, Star, Inbox, Zap, Wallet, ShieldCheck, Percent, Settings, BarChart3, Tag } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useAdminGetStats({
    query: { queryKey: getAdminGetStatsQueryKey() }
  });

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["admin-inquiries-unread"],
    queryFn: () => apiFetch<{ count: number }>("/api/admin/inquiries/unread-count"),
    refetchInterval: 30000,
  });
  const unreadCount = unread?.count ?? 0;

  if (isLoading || !stats) {
    return <div className="p-8">Loading stats...</div>;
  }

  const isAdmin = user?.role === "admin";

  return (
    <div className="flex-1 p-4 md:p-8 container mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          {isAdmin ? "Admin Overview" : "Manager Overview"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin ? "Full access to all management features." : "You have manager-level access."}
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{stats.recentSignups} this week
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Members</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeMembers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((stats.activeMembers / stats.totalUsers) * 100 || 0).toFixed(1)}% conversion rate
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{stats.totalRevenue}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Content</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalContent}</div>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-bold mb-4 text-foreground">Quick Management</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Link href="/admin/users">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Manage Users
          </Button>
        </Link>
        <Link href="/admin/content">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2">
            <Video className="h-6 w-6 text-primary" />
            Manage Content
          </Button>
        </Link>
        <Link href="/admin/documents">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Documents
          </Button>
        </Link>
        <Link href="/admin/payments">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            View Payments
          </Button>
        </Link>
        <Link href="/admin/reviews">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2">
            <Star className="h-6 w-6 text-primary" />
            Reviews
          </Button>
        </Link>
        <Link href="/admin/inquiries">
          <Button
            variant="outline"
            className="w-full h-24 text-base flex flex-col items-center justify-center gap-2 relative"
            data-testid="link-admin-inquiries"
          >
            <Inbox className="h-6 w-6 text-primary" />
            Inquiries
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        </Link>
      </div>

      <h2 className="text-xl font-bold mt-8 mb-4 text-foreground">Recharge Portal</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Link href="/admin/recharge">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2" data-testid="link-admin-recharge">
            <Zap className="h-6 w-6 text-primary" />Recharges
          </Button>
        </Link>
        <Link href="/admin/wallets">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2" data-testid="link-admin-wallets">
            <Wallet className="h-6 w-6 text-primary" />Wallets
          </Button>
        </Link>
        {isAdmin && (
          <Link href="/admin/manual-topups">
            <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2" data-testid="link-admin-manual-topups">
              <Wallet className="h-6 w-6 text-amber-600" />Manual Top-ups
            </Button>
          </Link>
        )}
        <Link href="/admin/kyc">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2" data-testid="link-admin-kyc">
            <ShieldCheck className="h-6 w-6 text-primary" />KYC Review
          </Button>
        </Link>
        <Link href="/admin/commission">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2" data-testid="link-admin-commission">
            <Percent className="h-6 w-6 text-primary" />Commission
          </Button>
        </Link>
        {isAdmin && (
          <Link href="/admin/recharge-settings">
            <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2" data-testid="link-admin-recharge-settings">
              <Settings className="h-6 w-6 text-primary" />Recharge Settings
            </Button>
          </Link>
        )}
        <Link href="/admin/reports">
          <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2" data-testid="link-admin-reports">
            <BarChart3 className="h-6 w-6 text-primary" />Reports & Analytics
          </Button>
        </Link>
        {isAdmin && (
          <Link href="/admin/coupons">
            <Button variant="outline" className="w-full h-24 text-base flex flex-col items-center justify-center gap-2" data-testid="link-admin-coupons">
              <Tag className="h-6 w-6 text-emerald-600" />Coupons
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
