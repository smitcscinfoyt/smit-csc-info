import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Menu, X, Crown, User as UserIcon, Lock, Image as ImageIcon, LogOut, Sparkles, ShieldCheck, LayoutDashboard } from "lucide-react";
import { AvatarTierBadge, RolePill, getLoginTier } from "@/components/role-badge";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { motion, AnimatePresence } from "framer-motion";
import { LanguageSelector } from "@/components/language-selector";
import { NotificationBell } from "@/components/notification-bell";
import { useLanguage } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

function initialsOf(name?: string | null) {
  if (!name) return "U";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

export function Navbar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLanguage();

  const { data: status } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: !!user,
    staleTime: 60000,
  });
  const isPrime = !!status?.is_prime;
  const isStaff = user?.role === "admin" || user?.role === "manager";
  const premiumLabel = (t as any).premium?.navAccess ?? "Premium Access";

  // Logged-in users see exactly the same nav as logged-out users.
  // The only addition for logged-in users is a small profile avatar on the right.
  const navLinks = [
    { href: "/", label: t.nav.home },
    { href: "/tools", label: t.nav.tools },
    { href: "/recharge", label: "Recharge" },
    { href: "/content", label: (t.nav as any).content ?? "Content" },
    { href: "/documents", label: t.nav.documents },
  ];
  if (!isPrime) {
    navLinks.push({ href: "/membership", label: t.nav.membership });
  }

  const profilePhoto = (user as any)?.profilePhoto as string | null | undefined;
  const displayName = (user as any)?.name ?? user?.email ?? "Account";

  // The reusable list of items shown in both desktop dropdown and mobile sheet.
  const ProfileMenuItems = ({ onClick }: { onClick?: () => void }) => (
    <>
      <Link href="/account" onClick={onClick}>
        <DropdownMenuItem data-testid="menu-my-account" className="cursor-pointer">
          <UserIcon className="h-4 w-4 mr-2" /> My Account
        </DropdownMenuItem>
      </Link>
      <Link href="/wallet" onClick={onClick}>
        <DropdownMenuItem data-testid="menu-wallet" className="cursor-pointer">
          <Sparkles className="h-4 w-4 mr-2" /> My Wallet
        </DropdownMenuItem>
      </Link>
      <DropdownMenuSeparator />
      {!isPrime && (
        <Link href="/membership" onClick={onClick}>
          <DropdownMenuItem
            data-testid="menu-upgrade-prime"
            className="cursor-pointer text-amber-700 focus:text-amber-800 focus:bg-amber-50"
          >
            <Sparkles className="h-4 w-4 mr-2" /> Upgrade to Prime
          </DropdownMenuItem>
        </Link>
      )}
      {isPrime && (
        <Link href="/premium-dashboard" onClick={onClick}>
          <DropdownMenuItem
            data-testid="menu-premium-dashboard"
            className="cursor-pointer text-amber-700 focus:text-amber-800 focus:bg-amber-50"
          >
            <Crown className="h-4 w-4 mr-2" /> {premiumLabel}
          </DropdownMenuItem>
        </Link>
      )}
      {isStaff && (
        <Link href="/admin" onClick={onClick}>
          <DropdownMenuItem data-testid="menu-admin" className="cursor-pointer">
            <ShieldCheck className="h-4 w-4 mr-2" /> {t.nav.admin}
          </DropdownMenuItem>
        </Link>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-testid="menu-logout"
        className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
        onClick={() => { onClick?.(); logout(); }}
      >
        <LogOut className="h-4 w-4 mr-2" /> {t.nav.logout}
      </DropdownMenuItem>
    </>
  );

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-50 w-full border-b border-white/60 bg-white/90 backdrop-blur-xl shadow-sm"
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 max-w-7xl">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <motion.div
            whileHover={{ scale: 1.04 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            className="flex items-center gap-2"
          >
            <img
              src="/logo.png"
              alt="Smit CSC Info Logo"
              className="h-11 w-11 object-contain drop-shadow-sm"
            />
            <span className="text-lg font-black bg-gradient-to-r from-indigo-600 to-violet-700 bg-clip-text text-transparent">
              {t.nav.brand}
            </span>
          </motion.div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <motion.div
                className={`relative px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                  location === link.href
                    ? "text-primary"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/80"
                }`}
                whileTap={{ scale: 0.96 }}
              >
                {link.label}
                <AnimatePresence>
                  {location === link.href && (
                    <motion.div
                      layoutId="nav-underline"
                      className="absolute bottom-0.5 left-3 right-3 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full"
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      exit={{ opacity: 0, scaleX: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 28 }}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            </Link>
          ))}
        </nav>

        {/* Desktop Right: Language + Auth */}
        <div className="hidden md:flex items-center gap-3">
          <LanguageSelector />
          {user && <NotificationBell />}
          {isStaff && (
            <Link href="/admin">
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                data-testid="btn-admin-shield"
                aria-label="Admin Panel"
                title="Admin Panel"
                className="relative h-9 w-9 rounded-full bg-gradient-to-br from-purple-700 to-indigo-700 text-white flex items-center justify-center shadow-md ring-2 ring-amber-300/60 hover:ring-amber-400"
              >
                <ShieldCheck className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 bg-amber-400 text-purple-950 text-[8px] font-black px-1 rounded-full leading-tight">A</span>
              </motion.button>
            </Link>
          )}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="btn-profile-avatar"
                  className={`relative rounded-full ring-2 ring-offset-2 transition-all hover:ring-offset-1 ${
                    isPrime ? "ring-amber-400" : "ring-indigo-200 hover:ring-indigo-400"
                  }`}
                  aria-label="Open profile menu"
                >
                  <Avatar className="h-9 w-9">
                    {profilePhoto ? <AvatarImage src={profilePhoto} alt={displayName} /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold text-sm">
                      {initialsOf(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <AvatarTierBadge tier={getLoginTier(user?.role, isPrime)} size="sm" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-sm truncate">{displayName}</span>
                    {user.email && <span className="text-xs text-gray-500 truncate">{user.email}</span>}
                    <RolePill tier={getLoginTier(user?.role, isPrime)} className="mt-0.5 self-start" />
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ProfileMenuItems />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/register" className="hidden lg:block text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors px-2">
                {t.nav.register}
              </Link>
              <Link href="/login">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                  <Button variant="outline" className="font-semibold border-gray-300">{t.nav.login}</Button>
                </motion.div>
              </Link>
            </>
          )}
        </div>

        {/* Mobile: Language + small avatar (logged-in) + Hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <LanguageSelector />
          {user && <NotificationBell />}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="btn-profile-avatar-mobile"
                  className={`relative rounded-full ring-2 ring-offset-1 ${
                    isPrime ? "ring-amber-400" : "ring-indigo-200"
                  }`}
                  aria-label="Open profile menu"
                >
                  <Avatar className="h-8 w-8">
                    {profilePhoto ? <AvatarImage src={profilePhoto} alt={displayName} /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold text-xs">
                      {initialsOf(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <AvatarTierBadge tier={getLoginTier(user?.role, isPrime)} size="sm" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-sm truncate">{displayName}</span>
                    {user.email && <span className="text-xs text-gray-500 truncate">{user.email}</span>}
                    <RolePill tier={getLoginTier(user?.role, isPrime)} className="mt-0.5 self-start" />
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ProfileMenuItems />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <motion.div whileTap={{ scale: 0.9 }}>
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <motion.div
                    animate={isOpen ? { rotate: 90 } : { rotate: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                  </motion.div>
                </Button>
              </motion.div>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[360px] p-0">
              <div className="p-6 border-b bg-gradient-to-br from-indigo-50 to-violet-50">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/logo.png"
                    alt="Smit CSC Info Logo"
                    className="h-11 w-11 object-contain drop-shadow-sm"
                  />
                  <span className="text-lg font-black bg-gradient-to-r from-indigo-600 to-violet-700 bg-clip-text text-transparent">
                    {t.nav.brand}
                  </span>
                </div>
              </div>
              <nav className="flex flex-col gap-1 p-4">
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className={`block px-4 py-3 text-base font-semibold rounded-xl transition-colors ${
                        location === link.href
                          ? "bg-primary/10 text-primary"
                          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
                {!user && (
                  <>
                    <div className="h-px bg-gray-100 my-3" />
                    <div className="flex flex-col gap-2">
                      <Link href="/login" onClick={() => setIsOpen(false)}>
                        <Button variant="outline" className="w-full justify-center font-bold border-gray-200">
                          {t.nav.login}
                        </Button>
                      </Link>
                      <Link href="/register" onClick={() => setIsOpen(false)}>
                        <Button variant="ghost" className="w-full justify-center font-semibold text-gray-600">
                          {t.nav.register}
                        </Button>
                      </Link>
                    </div>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>

      </div>
    </motion.header>
  );
}
