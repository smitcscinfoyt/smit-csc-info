import { Crown, ShieldCheck, Briefcase } from "lucide-react";
import { motion } from "framer-motion";

export type LoginTier = "admin" | "manager" | "prime" | "free";

export function getLoginTier(role: string | undefined | null, isPrime: boolean): LoginTier {
  if (role === "admin") return "admin";
  if (role === "manager") return "manager";
  if (isPrime) return "prime";
  return "free";
}

interface TierMeta {
  label: string;
  shortLabel: string;
  Icon: typeof Crown;
  gradient: string;
  iconColor: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
}

const TIERS: Record<LoginTier, TierMeta> = {
  admin: {
    label: "Administrator",
    shortLabel: "ADMIN",
    Icon: ShieldCheck,
    gradient: "linear-gradient(135deg, #f43f5e, #be123c)",
    iconColor: "text-white",
    pillBg: "rgba(244,63,94,.12)",
    pillBorder: "rgba(244,63,94,.45)",
    pillText: "#be123c",
  },
  manager: {
    label: "Manager",
    shortLabel: "MANAGER",
    Icon: Briefcase,
    gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
    iconColor: "text-white",
    pillBg: "rgba(59,130,246,.12)",
    pillBorder: "rgba(59,130,246,.45)",
    pillText: "#1d4ed8",
  },
  prime: {
    label: "Prime Member",
    shortLabel: "PRIME",
    Icon: Crown,
    gradient: "linear-gradient(135deg, #FFD700, #DAA520)",
    iconColor: "text-amber-900",
    pillBg: "rgba(218,165,32,.18)",
    pillBorder: "rgba(218,165,32,.5)",
    pillText: "#92400e",
  },
  free: {
    label: "Free Member",
    shortLabel: "FREE",
    Icon: Crown,
    gradient: "linear-gradient(135deg, #94a3b8, #64748b)",
    iconColor: "text-white",
    pillBg: "rgba(100,116,139,.12)",
    pillBorder: "rgba(100,116,139,.35)",
    pillText: "#475569",
  },
};

/**
 * Small circular badge that overlays the corner of an avatar.
 * Free tier renders nothing (clean look for non-special users).
 */
export function AvatarTierBadge({
  tier,
  size = "md",
  className = "",
}: {
  tier: LoginTier;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  if (tier === "free") return null;

  const meta = TIERS[tier];
  const dims = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : size === "lg" ? "h-4 w-4" : "h-3 w-3";

  return (
    <motion.span
      className={`absolute -top-1 -right-1 ${dims} rounded-full flex items-center justify-center shadow-md ring-2 ring-white ${className}`}
      style={{ background: meta.gradient }}
      animate={tier === "admin" ? { scale: [1, 1.08, 1] } : tier === "prime" ? { rotate: [0, 8, -8, 0] } : undefined}
      transition={{ duration: tier === "admin" ? 2 : 3, repeat: Infinity }}
      title={meta.label}
      data-testid={`badge-${tier}`}
    >
      <meta.Icon className={`${iconSize} ${meta.iconColor}`} />
    </motion.span>
  );
}

/**
 * Inline pill badge — used inside dropdowns or beside the user name.
 * Free tier renders a muted "Free Member" pill.
 */
export function RolePill({ tier, className = "" }: { tier: LoginTier; className?: string }) {
  const meta = TIERS[tier];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide border ${className}`}
      style={{ background: meta.pillBg, borderColor: meta.pillBorder, color: meta.pillText }}
      data-testid={`pill-${tier}`}
    >
      <meta.Icon className="h-2.5 w-2.5" />
      {meta.shortLabel}
    </span>
  );
}
