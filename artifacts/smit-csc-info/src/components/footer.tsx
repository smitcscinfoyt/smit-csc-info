import { Link } from "wouter";
import { useLanguage } from "@/lib/i18n";
import { Youtube, MessageCircle, Mail, Phone, MapPin, ExternalLink, Facebook, Instagram } from "lucide-react";
import { motion } from "framer-motion";

export function Footer() {
  const { t } = useLanguage();

  const quickLinks = [
    { href: "/", label: t.footer.home },
    { href: "/content", label: t.footer.contentLibrary },
    { href: "/documents", label: t.footer.documents },
  ];

  const supportLinks = [
    { href: "/contact", label: t.footer.contact },
    { href: "/terms", label: t.footer.terms },
    { href: "/privacy", label: t.footer.privacy },
  ];

  return (
    <footer className="bg-gradient-to-br from-gray-950 to-indigo-950 text-white mt-auto">
      <div className="container mx-auto px-4 py-14 max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-5">
              <img
                src="/logo.png"
                alt="Smit CSC Info Logo"
                className="h-12 w-12 object-contain drop-shadow-md"
              />
              <span className="text-lg font-black text-white">{t.nav.brand}</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed max-w-sm mb-6">
              {t.footer.tagline}
            </p>
            <div className="flex flex-col gap-2 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>{t.footer.location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>{t.footer.timings}</span>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex items-center gap-3 mt-6 flex-wrap">
              <motion.a
                href="https://www.facebook.com/share/18S1fiF4mj/"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#1877F2] to-[#0a4ea8] hover:brightness-110 flex items-center justify-center shadow-md ring-1 ring-amber-300/40 transition-all"
                aria-label="Facebook Page"
                data-testid="footer-social-facebook"
              >
                <Facebook className="h-4 w-4 text-white" />
              </motion.a>
              <motion.a
                href="https://www.instagram.com/smit_csc_info?igsh=MTI3YzRzMDFqeWwxOQ=="
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:brightness-110 flex items-center justify-center shadow-md ring-1 ring-amber-300/40 transition-all"
                aria-label="Instagram Page"
                data-testid="footer-social-instagram"
              >
                <Instagram className="h-4 w-4 text-white" />
              </motion.a>
              <motion.a
                href="https://www.youtube.com/@SmitCSCInfo"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="h-9 w-9 rounded-lg bg-red-600/90 hover:bg-red-500 flex items-center justify-center shadow-md transition-colors"
                aria-label="YouTube Channel"
              >
                <Youtube className="h-4 w-4 text-white" />
              </motion.a>
              <motion.a
                href="https://wa.me/917874080686"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="h-9 w-9 rounded-lg bg-green-600/90 hover:bg-green-500 flex items-center justify-center shadow-md transition-colors"
                aria-label="WhatsApp Support"
              >
                <MessageCircle className="h-4 w-4 text-white" />
              </motion.a>
              <motion.a
                href="mailto:smitcscinfoyt@gmail.com"
                whileHover={{ scale: 1.12, y: -2 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="h-9 w-9 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 flex items-center justify-center shadow-md transition-colors"
                aria-label="Email Support"
              >
                <Mail className="h-4 w-4 text-white" />
              </motion.a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-white mb-5 text-sm uppercase tracking-wider">{t.footer.quickLinks}</h4>
            <ul className="space-y-2.5">
              {quickLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-gray-400 hover:text-indigo-400 transition-colors flex items-center gap-1.5 group"
                  >
                    <span className="h-1 w-1 rounded-full bg-gray-600 group-hover:bg-indigo-400 transition-colors" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-bold text-white mb-5 text-sm uppercase tracking-wider">{t.footer.support}</h4>
            <ul className="space-y-2.5">
              {supportLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-gray-400 hover:text-indigo-400 transition-colors flex items-center gap-1.5 group"
                  >
                    <span className="h-1 w-1 rounded-full bg-gray-600 group-hover:bg-indigo-400 transition-colors" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <h4 className="font-bold text-white mb-3 text-sm uppercase tracking-wider">{t.footer.platform}</h4>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                <span>{t.footer.systemsOperational}</span>
              </div>
              <motion.a
                href="https://www.youtube.com/@SmitCSCInfo"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                whileHover={{ x: 2 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                {t.footer.visitYouTube} <ExternalLink className="h-3 w-3" />
              </motion.a>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
          <span>&copy; {new Date().getFullYear()} {t.nav.brand}. {t.footer.copyright}</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-indigo-400 transition-colors">{t.footer.termsShort}</Link>
            <Link href="/privacy" className="hover:text-indigo-400 transition-colors">{t.footer.privacyShort}</Link>
            <span className="text-gray-600">·</span>
            <span>{t.footer.madeWith}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
