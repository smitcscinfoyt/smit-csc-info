import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Crown,
  LogOut,
  Loader2,
  Download,
  Sparkles,
  Wand2,
  Image as ImageIcon,
  FileEdit,
  Palette,
  IdCard,
  Bot,
  Headphones,
  Wallet,
  PlayCircle,
  FolderOpen,
  Award,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

interface UserStatus {
  is_prime: boolean;
  hd_credits: number;
  membership_type: string;
  expires_at: string | null;
}

const PRIME_WHATSAPP =
  "https://wa.me/919876543210?text=Hello%20Smit%20CSC%20Info%20Prime%20Support";

type PrimeService = {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
};

function openAiSahayak() {
  const btn = document.querySelector<HTMLButtonElement>(
    '[data-testid="ai-sahayak-bubble"]',
  );
  if (btn) btn.click();
}

const PRIME_SERVICES: PrimeService[] = [
  {
    id: "unlimited-downloads",
    icon: <Download className="h-6 w-6" />,
    title: "Unlimited downloads from every Prime tool",
    desc: "Export and download without daily limits across all Prime tools.",
    badge: "Unlimited",
    href: "/tools",
  },
  {
    id: "fhd-bg-remover",
    icon: <Sparkles className="h-6 w-6" />,
    title: "FHD Background Remover (up to 4K)",
    desc: "Studio-grade transparent PNG output up to 4K resolution.",
    badge: "FHD / 4K",
    href: "/tools/background-remover",
  },
  {
    id: "image-upscaler",
    icon: <Wand2 className="h-6 w-6" />,
    title: "AI Image Upscaler — 2× / 4× output",
    desc: "Enhance low-resolution photos to 2× or 4× with AI super-resolution.",
    badge: "2× / 4×",
    href: "/tools/image-upscaler",
  },
  {
    id: "pdf-editor-v2",
    icon: <FileEdit className="h-6 w-6" />,
    title: "PDF Editor v2 with Smart Text Edit",
    desc: "Edit text directly inside any PDF with OCR-powered Smart Text Edit.",
    badge: "Smart Edit",
    href: "/tools/pdf-editor-v2",
  },
  {
    id: "prime-studio",
    icon: <Palette className="h-6 w-6" />,
    title: "Prime Studio (Canva-style designer)",
    desc: "Full canvas designer with templates, brand kits, multi-doc tabs and PDF export.",
    badge: "Designer",
    href: "/tools/prime-studio",
  },
  {
    id: "id-passport-sheets",
    icon: <IdCard className="h-6 w-6" />,
    title: "ID Card / Passport print sheets — PDF + JPG",
    desc: "Auto-arranged 86×56 ID cards and passport-photo sheets, PDF & JPG output.",
    badge: "Print Ready",
    href: "/tools/id-card-engine",
  },
  {
    id: "ai-sahayak",
    icon: <Bot className="h-6 w-6" />,
    title: "24/7 AI Sahayak (Gujarati)",
    desc: "Always-on Gujarati AI assistant — tap to open the chat instantly.",
    badge: "Gujarati AI",
    onClick: openAiSahayak,
  },
  {
    id: "priority-support",
    icon: <Headphones className="h-6 w-6" />,
    title: "Priority Prime support (WhatsApp + email)",
    desc: "Skip the queue — direct WhatsApp line and priority email response.",
    badge: "Priority",
    href: PRIME_WHATSAPP,
    external: true,
  },
  {
    id: "premium-recharge",
    icon: <Wallet className="h-6 w-6" />,
    title: "Premium Recharge Portal — higher % commission",
    desc: "Premium tier-share commission boost on every recharge and bill payment.",
    badge: "Higher %",
    href: "/recharge",
  },
  {
    id: "prime-videos",
    icon: <PlayCircle className="h-6 w-6" />,
    title: "Prime video content access (training + tutorials)",
    desc: "Full Gujarati training & tutorial library — Prime members only.",
    badge: "Training",
    href: "/content?type=video",
  },
  {
    id: "prime-library",
    icon: <FolderOpen className="h-6 w-6" />,
    title: "Prime documents & resources library",
    desc: "Editable forms, GR circulars and exclusive resources curated for Prime members.",
    badge: "Library",
    href: "/library",
  },
  {
    id: "membership-certificate",
    icon: <Award className="h-6 w-6" />,
    title: "Prime membership certificate (downloadable)",
    desc: "Download your personalised Smit CSC Info Prime membership certificate.",
    badge: "Downloadable",
    href: "/certificate",
  },
];

export default function PremiumDashboard() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const p = (t as any).premium ?? {};

  const { data: status, isLoading: statusLoading } = useQuery<UserStatus>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<UserStatus>("/api/user/status"),
  });

  useEffect(() => {
    if (!statusLoading && status && !status.is_prime) {
      setLocation("/membership");
    }
  }, [status, statusLoading, setLocation]);

  if (statusLoading || !status) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (!status.is_prime) return null;

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-[#1a0033] via-[#2d0a4e] to-[#0f0420] text-white"
      data-testid="premium-dashboard"
    >
      {/* HERO */}
      <div className="relative overflow-hidden border-b border-amber-300/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,200,80,0.18),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.18),transparent_50%)]" />
        <div className="container mx-auto max-w-6xl px-4 py-10 md:py-14 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col md:flex-row md:items-center justify-between gap-6"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400/20 to-yellow-300/10 border border-amber-300/30 backdrop-blur-sm">
                  <Crown className="h-4 w-4 text-amber-300" />
                  <span className="text-xs font-semibold tracking-wide text-amber-200">
                    {p.badge ?? "PRIME MEMBER LOUNGE"}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation("/")}
                  className="h-7 px-3 rounded-full border-amber-300/40 bg-white/5 hover:bg-white/10 text-amber-100 hover:text-white text-xs font-semibold backdrop-blur"
                  data-testid="exit-premium"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  Exit Premium Access
                </Button>
              </div>
              <h1
                className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent"
                data-testid="premium-title"
              >
                {p.heroTitle ?? "Welcome to your Premium Lounge"}
              </h1>
              <p className="text-purple-100/70 text-sm md:text-base mt-2 max-w-xl">
                {p.heroSubtitle ??
                  "All Prime services in one place — exclusively for Prime members."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:min-w-[280px]">
              <div className="rounded-2xl border border-amber-300/30 bg-white/5 backdrop-blur p-4">
                <div className="text-[11px] uppercase tracking-wider text-amber-200/70">
                  {p.hdCredits ?? "HD Credits"}
                </div>
                <div
                  className="text-2xl font-extrabold text-amber-300 mt-0.5"
                  data-testid="hd-credits"
                >
                  {status.hd_credits}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-300/30 bg-white/5 backdrop-blur p-4">
                <div className="text-[11px] uppercase tracking-wider text-amber-200/70">
                  {p.plan ?? "Plan"}
                </div>
                <div className="text-2xl font-extrabold text-white mt-0.5">
                  {status.membership_type}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* PRIME SERVICES GRID */}
      <div className="container mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-center gap-2 text-amber-300 text-sm font-bold uppercase tracking-wider mb-2">
          <Crown className="h-5 w-5" />
          Your Prime Services
        </div>
        <p className="text-purple-200/70 text-sm mb-6">
          Every benefit included with your Prime membership — tap any card to open.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRIME_SERVICES.map((svc, i) => (
            <PrimeServiceCard key={svc.id} svc={svc} index={i} />
          ))}
        </div>

      </div>
    </div>
  );
}

function PrimeServiceCard({ svc, index }: { svc: PrimeService; index: number }) {
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: 0.04 + index * 0.04,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="h-full rounded-2xl border border-amber-300/20 bg-white/[0.04] backdrop-blur-md p-5 hover:border-amber-300/60 hover:bg-white/[0.07] transition-all group flex flex-col"
      data-testid={`prime-service-${svc.id}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400/20 to-yellow-300/10 border border-amber-300/30 flex items-center justify-center text-amber-300 group-hover:scale-110 transition-transform">
          {svc.icon}
        </div>
        {svc.badge && (
          <Badge className="bg-amber-400 text-purple-950 font-bold">
            {svc.badge}
          </Badge>
        )}
      </div>
      <div className="font-bold text-white text-base leading-snug mb-1.5">
        {svc.title}
      </div>
      <p className="text-xs text-purple-200/70 flex-1">{svc.desc}</p>
      {(svc.href || svc.onClick) && (
        <div className="mt-4 inline-flex items-center text-xs font-bold text-amber-200 gap-1 group-hover:text-amber-100">
          Open <ArrowRight className="h-3.5 w-3.5" />
        </div>
      )}
    </motion.div>
  );

  if (svc.onClick) {
    return (
      <button
        type="button"
        onClick={svc.onClick}
        className="block h-full text-left w-full"
      >
        {card}
      </button>
    );
  }

  if (!svc.href) return card;

  if (svc.external) {
    return (
      <a href={svc.href} rel="noopener noreferrer" className="block h-full">
        {card}
      </a>
    );
  }

  return (
    <Link href={svc.href} className="block h-full">
      {card}
    </Link>
  );
}
