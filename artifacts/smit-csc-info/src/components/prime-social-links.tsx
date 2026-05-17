import { motion } from "framer-motion";
import { Facebook, Instagram, Youtube, MessageCircle, Mail } from "lucide-react";

const LINKS = [
  {
    href: "https://www.facebook.com/share/18S1fiF4mj/",
    label: "Facebook",
    Icon: Facebook,
    grad: "from-[#1877F2] to-[#0a4ea8]",
  },
  {
    href: "https://www.instagram.com/smit_csc_info?igsh=MTI3YzRzMDFqeWwxOQ==",
    label: "Instagram",
    Icon: Instagram,
    grad: "from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
  {
    href: "https://www.youtube.com/@SmitCSCInfo",
    label: "YouTube",
    Icon: Youtube,
    grad: "from-[#FF3B3B] to-[#b30000]",
  },
  {
    href: "/contact",
    label: "WhatsApp",
    Icon: MessageCircle,
    grad: "from-[#25D366] to-[#128C7E]",
  },
  {
    href: "/contact",
    label: "Email",
    Icon: Mail,
    grad: "from-[#4f46e5] to-[#312e81]",
  },
];

export function PrimeSocialLinks({
  variant = "card",
  title = "Connect with Us",
}: {
  variant?: "card" | "inline";
  title?: string;
}) {
  if (variant === "inline") {
    return (
      <div className="px-3 py-3 border-t border-amber-300/15">
        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/70 mb-2 px-1">
          {title}
        </div>
        <div className="flex items-center gap-2">
          {LINKS.map(({ href, label, Icon, grad }) => (
            <motion.a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              data-testid={`social-${label.toLowerCase()}`}
              whileHover={{ scale: 1.12, y: -2 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 380, damping: 16 }}
              className={`relative h-9 w-9 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white shadow-lg shadow-black/30 ring-1 ring-amber-300/40 hover:ring-amber-300 transition-all`}
            >
              <span className="absolute inset-0 rounded-xl bg-amber-300/30 opacity-0 hover:opacity-100 blur-lg animate-pulse pointer-events-none" />
              <Icon className="h-4 w-4 relative z-10" />
            </motion.a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="prime-social-card"
      className="prime-card relative overflow-hidden p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-amber-700">
            Follow Smit CSC Info
          </div>
          <div className="text-base font-bold text-purple-950 mt-0.5">
            {title}
          </div>
          <div className="text-xs text-purple-900/70 mt-1">
            Stay updated with daily tips, schemes &amp; tutorials.
          </div>
        </div>
        <div className="flex items-center gap-3">
          {LINKS.map(({ href, label, Icon, grad }) => (
            <motion.a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              data-testid={`social-card-${label.toLowerCase()}`}
              whileHover={{ scale: 1.08, y: -2 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 380, damping: 16 }}
              className={`group relative h-12 w-12 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center text-white shadow-lg shadow-purple-950/20 ring-2 ring-amber-300/60`}
            >
              <span className="absolute -inset-1 rounded-2xl bg-amber-400/40 blur-lg opacity-0 group-hover:opacity-100 animate-pulse pointer-events-none" />
              <Icon className="h-5 w-5 relative z-10" />
            </motion.a>
          ))}
        </div>
      </div>
    </div>
  );
}
