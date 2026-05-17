import { ReactNode } from "react";
import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { DashboardLayout } from "./dashboard-layout";
import { AiSahayakWidget } from "./ai-sahayak-widget";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

const pageVariants = {
  initial: { opacity: 0, y: 16, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, filter: "blur(2px)", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } },
};

// Public-facing pages (login / register / verification flows) always use the
// plain marketing layout — even Prime members shouldn't see the operator portal
// chrome on these screens.
const PUBLIC_AUTH_PREFIXES = ["/login", "/register", "/verify", "/reset-password"];

function isPublicAuthRoute(path: string) {
  return PUBLIC_AUTH_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?")
  );
}

// Full-screen tool routes — they paint their own chrome and rely on every
// pixel of the viewport (Canva-style design surfaces). Render children
// without any Layout/Navbar/Footer/Chat-widget overlays.
const FULLSCREEN_TOOL_ROUTES = ["/tools/prime-studio"];

function isFullscreenToolRoute(path: string) {
  return FULLSCREEN_TOOL_ROUTES.some((p) => path === p || path.startsWith(p + "/"));
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  // Lazily check Prime status only when logged in.
  const { data: status } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const isPrime = !!status?.is_prime;

  // Layout rules (Prime status and admin role are independent):
  //   1. Logged out                   -> public layout
  //   2. Logged in (Free)             -> public layout
  //   3. Logged in (Free) + admin     -> public layout + Admin link in navbar
  //   4. Logged in (Prime)            -> Prime operator portal
  //   5. Logged in (Prime) + admin    -> Prime operator portal + Admin link
  // The admin role only adds an extra Admin entry in the nav; it never blocks
  // the Prime UI for a paying user.
  // Full-screen tool routes (Prime Studio etc.) bypass all chrome entirely.
  if (isFullscreenToolRoute(location)) {
    return <>{children}</>;
  }

  if (user && isPrime && !isPublicAuthRoute(location)) {
    return (
      <>
        <DashboardLayout>{children}</DashboardLayout>
        <AiSahayakWidget />
      </>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-50/50">
      <Navbar />
      <AnimatePresence mode="wait">
        <motion.main
          key={location}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex-1 flex flex-col"
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <Footer />
      <AiSahayakWidget />
    </div>
  );
}
