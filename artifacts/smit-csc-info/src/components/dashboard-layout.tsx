import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Sparkles,
  Wrench,
  FolderOpen,
  Crown,
  ShieldCheck,
  Award,
  BookOpen,
  Smartphone,
  Wallet,
} from "lucide-react";
import { LanguageSelector } from "@/components/language-selector";
import { NotificationBell } from "@/components/notification-bell";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AvatarTierBadge, getLoginTier } from "@/components/role-badge";

interface UserStatus {
  is_prime: boolean;
}

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

interface NavItem {
  href: string;
  label: string;
  icon: any;
  premium?: boolean;
}

function useNavItems(): NavItem[] {
  const { user } = useAuth();
  const { t } = useLanguage();
  const sb = (t.sidebar as any) ?? {};
  const isAdmin = user?.role === "admin" || user?.role === "manager";
  const items: NavItem[] = [
    { href: "/", label: sb.home ?? "Home", icon: Home },
    { href: "/premium-dashboard", label: sb.premium ?? "Premium", icon: Sparkles, premium: true },
    { href: "/recharge", label: sb.recharge ?? "Recharge", icon: Smartphone },
    { href: "/tools", label: sb.tools ?? "All Tools", icon: Wrench },
    { href: "/content", label: sb.content ?? "Content", icon: BookOpen },
    { href: "/documents", label: sb.documents ?? "Documents", icon: FolderOpen },
    { href: "/dashboard", label: sb.dashboard ?? "Dashboard", icon: Crown },
  ];
  if (isAdmin) {
    items.push({ href: "/admin", label: sb.admin ?? "Admin", icon: ShieldCheck });
  }
  return items;
}

function HeaderNav() {
  const [location] = useLocation();
  const items = useNavItems();
  const { user } = useAuth();
  const { data: status } = useQuery<UserStatus>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<UserStatus>("/api/user/status"),
    enabled: !!user,
    staleTime: 60000,
  });
  const isPrime = !!status?.is_prime;

  return (
    <nav
      className="hidden lg:flex items-center gap-1"
      data-testid="header-nav"
    >
      {items.map(({ href, label, icon: Icon, premium }) => {
        const active = location === href || (href !== "/" && location.startsWith(href));
        return (
          <Link key={href} href={href}>
            <motion.div
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              data-testid={`header-link-${href.replace(/\//g, "-").slice(1) || "home"}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                active
                  ? premium
                    ? "bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-800 border border-amber-300/60 shadow-sm"
                    : "bg-purple-50 text-purple-800 border border-purple-200"
                  : "text-gray-700 hover:text-purple-800 hover:bg-purple-50/60 border border-transparent"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              {premium && !isPrime && (
                <span className="text-[9px] font-bold tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                  PRO
                </span>
              )}
            </motion.div>
          </Link>
        );
      })}
    </nav>
  );
}

function ProfileAvatarLink() {
  const { user } = useAuth();
  const { data: profile } = useQuery<{ profilePhoto?: string | null; name?: string }>({
    queryKey: ["profile-account"],
    queryFn: () => apiFetch<{ profilePhoto?: string | null; name?: string }>("/api/profile"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const { data: status } = useQuery<UserStatus>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<UserStatus>("/api/user/status"),
    enabled: !!user,
    staleTime: 60_000,
  });
  if (!user) return null;
  const photo = profile?.profilePhoto ?? null;
  const initial = (profile?.name ?? user.name ?? "U").charAt(0).toUpperCase();
  const tier = getLoginTier(user.role, !!status?.is_prime);
  return (
    <Link href="/account">
      <div className="relative">
        <div
          data-testid="topbar-profile-avatar"
          className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 font-bold flex items-center justify-center overflow-hidden cursor-pointer ring-2 ring-amber-300/40 hover:ring-amber-400/70 transition-all shadow-sm"
          title="My Account"
        >
          {photo
            ? <img src={photo} alt={profile?.name ?? user.name} className="h-full w-full object-cover" />
            : <span className="text-sm">{initial}</span>}
        </div>
        <AvatarTierBadge tier={tier} size="sm" />
      </div>
    </Link>
  );
}

function MobileBottomTabs() {
  const [location] = useLocation();
  const { t } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";
  const sb = (t.sidebar as any) ?? {};
  const tabs = [
    { href: "/", label: sb.home ?? "Home", icon: Home },
    { href: "/recharge", label: sb.recharge ?? "Recharge", icon: Smartphone },
    { href: "/dashboard", label: sb.dashboard ?? "Dashboard", icon: Crown, primary: true },
    { href: "/wallet", label: sb.wallet ?? "Wallet", icon: Wallet },
    ...(isAdmin
      ? [{ href: "/admin", label: sb.admin ?? "Admin", icon: ShieldCheck }]
      : [{ href: "/tools", label: sb.tools ?? "Tools", icon: Wrench }]),
  ];
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pt-2 pb-3"
      data-testid="mobile-bottom-tabs"
    >
      <div className="mx-auto max-w-md flex items-center justify-around bg-gradient-to-br from-[#1a0033]/95 to-[#15032b]/95 backdrop-blur-xl border border-amber-300/30 rounded-2xl px-2 py-1.5 shadow-2xl shadow-purple-950/40">
        {tabs.map(({ href, label, icon: Icon, primary }) => {
          const active = location === href || (href !== "/" && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <motion.div
                whileTap={{ scale: 0.92 }}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-2.5 rounded-xl transition-colors cursor-pointer min-w-[58px] ${
                  primary
                    ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-purple-950 shadow-lg shadow-amber-500/40 -mt-5"
                    : active
                      ? "text-amber-300"
                      : "text-purple-100/70"
                }`}
                data-testid={`tab-${href.replace(/\//g, "-").slice(1) || "home"}`}
              >
                <Icon className={primary ? "h-5 w-5" : "h-4 w-4"} />
                <span className={primary ? "text-[10px] font-bold" : "text-[10px] font-medium"}>{label}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] flex prime-body">
      <div className="relative flex-1 flex flex-col min-w-0 prime-glow">
        {/* Header with horizontal nav menu */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-amber-300/30">
          <div className="flex items-center justify-between px-4 lg:px-6 h-14 gap-4">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer shrink-0">
                <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center shadow-md ring-2 ring-amber-300/70 overflow-hidden">
                  <img src="/logo.png" alt="Smit CSC Info" className="h-8 w-8 object-contain" />
                </div>
                <span className="font-bold text-sm bg-gradient-to-r from-purple-700 to-amber-600 bg-clip-text text-transparent whitespace-nowrap">
                  Smit CSC Info
                </span>
              </div>
            </Link>

            <HeaderNav />

            <div className="flex items-center gap-2 shrink-0">
              <LanguageSelector />
              <NotificationBell />
              <ProfileAvatarLink />
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={location}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative z-10 flex-1 flex flex-col"
          >
            {children}
            <Footer />
          </motion.main>
        </AnimatePresence>
      </div>

      <MobileBottomTabs />
    </div>
  );
}
