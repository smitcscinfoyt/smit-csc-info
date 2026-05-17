import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import Cropper, { type Area } from "react-easy-crop";
import { format } from "date-fns";
import {
  User as UserIcon, Mail, Phone, Camera, Pencil, Save, X,
  Loader2, Lock, Eye, EyeOff, CheckCircle2, AlertCircle,
  ZoomIn, ZoomOut, RotateCcw, RotateCw, Crop,
  Award, Download, FileImage, FileText as FilePdf, Crown, Sparkles, ShieldCheck,
  UserCog, Star, Send, LogOut, MessageSquare,
  Facebook, Instagram, Youtube,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { downloadCertificatePDF, downloadCertificatePNG } from "@/hooks/use-certificate";
import { AvatarTierBadge, getLoginTier } from "@/components/role-badge";
import { PrimeSocialLinks } from "@/components/prime-social-links";
import MyQueries from "@/pages/my-queries";

interface ProfileData {
  id: number;
  name: string;
  email: string;
  mobile: string;
  profilePhoto: string | null;
  role: string;
  createdAt?: string;
}

interface UserStatus {
  is_prime: boolean;
  expires_at: string | null;
  membership_type: string;
}

// ─── Crop helper ────────────────────────────────────────────────────────────
async function getCroppedImg(src: string, crop: Area, rotation: number, size = 400): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bw = img.width * cos + img.height * sin;
  const bh = img.width * sin + img.height * cos;
  const off = document.createElement("canvas");
  off.width = bw; off.height = bh;
  const offCtx = off.getContext("2d")!;
  offCtx.translate(bw / 2, bh / 2);
  offCtx.rotate(rad);
  offCtx.drawImage(img, -img.width / 2, -img.height / 2);
  const sX = bw / img.width, sY = bh / img.height;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  c.getContext("2d")!.drawImage(off, crop.x * sX, crop.y * sY, crop.width * sX, crop.height * sY, 0, 0, size, size);
  const url = c.toDataURL("image/jpeg", 0.88);
  if (url.length > 500_000) {
    const s = document.createElement("canvas");
    s.width = 280; s.height = 280;
    s.getContext("2d")!.drawImage(c, 0, 0, 280, 280);
    return s.toDataURL("image/jpeg", 0.8);
  }
  return url;
}

// ─── Crop modal ─────────────────────────────────────────────────────────────
const SOCIAL_FOLLOW_LINKS = [
  { href: "https://www.facebook.com/share/18S1fiF4mj/", label: "Facebook", grad: "from-[#1877F2] to-[#0a4ea8]", Ic: Facebook },
  { href: "https://www.instagram.com/smit_csc_info?igsh=MTI3YzRzMDFqeWwxOQ==", label: "Instagram", grad: "from-[#F58529] via-[#DD2A7B] to-[#8134AF]", Ic: Instagram },
  { href: "https://www.youtube.com/@SmitCSCInfo", label: "YouTube", grad: "from-[#FF3B3B] to-[#b30000]", Ic: Youtube },
  { href: "/contact", label: "WhatsApp", grad: "from-[#25D366] to-[#128C7E]", Ic: MessageSquare },
  { href: "/contact", label: "Email", grad: "from-[#4f46e5] to-[#312e81]", Ic: Mail },
];

function SocialFollowCard() {
  return (
    <div
      className="rounded-3xl p-5 sm:p-6 bg-white border border-indigo-100 shadow-sm"
      data-testid="card-social-follow"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">
            Follow Smit CSC Info
          </div>
          <div className="text-base font-bold text-gray-900 mt-0.5">
            Connect with Us
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Stay updated with daily tips, schemes &amp; tutorials.
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {SOCIAL_FOLLOW_LINKS.map(({ href, label, grad, Ic }) => {
            return (
              <motion.a
                key={label}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                aria-label={label}
                data-testid={`account-social-${label.toLowerCase()}`}
                whileHover={{ scale: 1.08, y: -2 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 380, damping: 16 }}
                className={`h-10 w-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white shadow-md`}
              >
                <Ic className="h-4 w-4" />
              </motion.a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CropModal({ open, src, onDone, onCancel }: {
  open: boolean; src: string; onDone: (url: string) => void; onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    if (!pixels) return;
    setBusy(true);
    try { onDone(await getCroppedImg(src, pixels, rotation)); }
    finally { setBusy(false); }
  };
  const close = () => { setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); onCancel(); };
  return (
    <Dialog open={open} onOpenChange={v => !v && close()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden" style={{ maxHeight: "90dvh" }}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Crop className="h-4 w-4 text-primary" /> Crop Profile Photo
          </DialogTitle>
          <DialogDescription className="text-xs">Drag to reposition · Scroll to zoom</DialogDescription>
        </DialogHeader>
        <div className="relative mx-5 rounded-xl overflow-hidden bg-gray-900" style={{ height: 300 }}>
          <Cropper image={src} crop={crop} zoom={zoom} rotation={rotation} aspect={1} cropShape="round" showGrid={false}
            onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, p) => setPixels(p)} />
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setZoom(z => Math.max(1, z - .1))} className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-gray-50"><ZoomOut className="h-3.5 w-3.5 text-gray-500" /></button>
            <Slider min={1} max={3} step={0.05} value={[zoom]} onValueChange={([v]) => setZoom(v)} className="flex-1" />
            <button onClick={() => setZoom(z => Math.min(3, z + .1))} className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-gray-50"><ZoomIn className="h-3.5 w-3.5 text-gray-500" /></button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setRotation(r => r - 90)} className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-gray-50"><RotateCcw className="h-3.5 w-3.5 text-gray-500" /></button>
            <Slider min={-180} max={180} step={1} value={[rotation]} onValueChange={([v]) => setRotation(v)} className="flex-1" />
            <button onClick={() => setRotation(r => r + 90)} className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-gray-50"><RotateCw className="h-3.5 w-3.5 text-gray-500" /></button>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 gap-2" onClick={close} disabled={busy}><X className="h-4 w-4" /> Cancel</Button>
            <Button className="flex-1 gap-2" onClick={apply} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />}
              {busy ? "Processing…" : "Crop & Apply"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section header (used inside each tab panel) ────────────────────────────
function SectionHeader({
  icon: Icon, title, subtitle, isPrime,
}: {
  icon: any; title: string; subtitle: string; isPrime?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-6 pb-5 border-b" style={{ borderColor: isPrime ? "rgba(218,165,32,.2)" : "rgba(99,52,168,.1)" }}>
      <div className="h-11 w-11 rounded-xl flex items-center justify-center shadow-md" style={{ background: isPrime ? "linear-gradient(135deg, #DAA520, #FFD700)" : "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Profile section ────────────────────────────────────────────────────────
function ProfileSection({ profile, isPrime, onUpdate }: {
  profile: ProfileData; isPrime: boolean; onUpdate: (p: ProfileData) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [mobile, setMobile] = useState(profile.mobile);
  const [photo, setPhoto] = useState<string | null>(profile.profilePhoto);
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile.profilePhoto);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  useEffect(() => {
    setName(profile.name); setEmail(profile.email); setMobile(profile.mobile);
    setPhoto(profile.profilePhoto); setPhotoPreview(profile.profilePhoto);
  }, [profile]);

  const openEdit = () => { setErrors({}); setEditing(true); };
  const cancel = () => {
    setName(profile.name); setEmail(profile.email); setMobile(profile.mobile);
    setPhoto(profile.profilePhoto); setPhotoPreview(profile.profilePhoto);
    setErrors({}); setEditing(false);
  };

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast({ title: "Image too large (max 5MB)", variant: "destructive" }); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { toast({ title: "Only JPG/PNG/WebP allowed", variant: "destructive" }); return; }
    const r = new FileReader();
    r.onload = ev => { setCropSrc(ev.target?.result as string); setCropOpen(true); };
    r.readAsDataURL(f);
  }, [toast]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = "Name must be at least 2 characters";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Invalid email";
    if (!mobile.trim() || !/^\d{10}$/.test(mobile)) e.mobile = "Must be 10 digits";
    setErrors(e); return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const updated = await apiFetch<ProfileData>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), mobile: mobile.trim(), profilePhoto: photo }),
      });
      onUpdate(updated); setEditing(false); toast({ title: "Profile updated!" });
    } catch (err) { toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const avatarSrc = editing ? photoPreview : profile.profilePhoto;

  return (
    <>
      {cropSrc && <CropModal open={cropOpen} src={cropSrc}
        onDone={url => { setPhotoPreview(url); setPhoto(url); setCropOpen(false); setCropSrc(null); }}
        onCancel={() => { setCropOpen(false); setCropSrc(null); }} />}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="relative flex-shrink-0 mx-auto sm:mx-0">
          <div className="h-28 w-28 rounded-2xl overflow-hidden flex items-center justify-center text-3xl font-black shadow-lg"
            style={isPrime ? { background: "linear-gradient(135deg, #DAA520, #FFD700, #B8860B)" } : { background: "linear-gradient(135deg, #ede9fe, #c4b5fd)", color: "#5b21b6" }}>
            {avatarSrc ? <img src={avatarSrc} alt="Profile" className="w-full h-full object-cover" data-testid="profile-avatar" />
              : <span className={isPrime ? "text-white" : ""}>{profile.name.charAt(0).toUpperCase()}</span>}
          </div>
          {!editing && <AvatarTierBadge tier={getLoginTier(profile.role, isPrime)} size="lg" />}
          {editing && (
            <button onClick={() => fileRef.current?.click()} data-testid="btn-change-photo"
              className="absolute inset-0 rounded-2xl bg-black/45 flex flex-col items-center justify-center cursor-pointer hover:bg-black/60">
              <Camera className="h-6 w-6 text-white" />
              <span className="text-[10px] text-white font-bold mt-1">CHANGE</span>
            </button>
          )}
        </div>

        <div className="flex-1 w-full space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <UserIcon className="h-3 w-3" /> Full Name
              </Label>
              {editing ? (
                <Input value={name} onChange={e => setName(e.target.value)} data-testid="input-name"
                  className={errors.name ? "border-red-400" : ""} placeholder="Your full name" />
              ) : (
                <p className="text-base font-semibold text-foreground" data-testid="text-name">{profile.name}</p>
              )}
              {errors.name && <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Email
              </Label>
              {editing ? (
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-email"
                  className={errors.email ? "border-red-400" : ""} placeholder="email@example.com" />
              ) : (
                <p className="text-sm text-foreground break-all" data-testid="text-email">{profile.email}</p>
              )}
              {errors.email && <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> Mobile
              </Label>
              {editing ? (
                <Input type="tel" inputMode="numeric" value={mobile} data-testid="input-mobile"
                  onChange={e => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className={errors.mobile ? "border-red-400" : ""} placeholder="10-digit number" />
              ) : (
                <p className="text-sm text-foreground" data-testid="text-mobile">{profile.mobile}</p>
              )}
              {errors.mobile && <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.mobile}</p>}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            {!editing ? (
              <Button onClick={openEdit} className="gap-2 bg-gradient-to-r from-purple-700 to-amber-600 text-white hover:from-purple-800 hover:to-amber-700" data-testid="btn-edit-profile">
                <Pencil className="h-4 w-4" /> Edit Profile
              </Button>
            ) : (
              <>
                <Button onClick={save} disabled={saving} className="gap-2 bg-gradient-to-r from-purple-700 to-amber-600 text-white" data-testid="btn-save-profile">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
                <Button variant="outline" onClick={cancel} disabled={saving} data-testid="btn-cancel-profile">
                  <X className="h-4 w-4 mr-1.5" /> Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Rate Our Services card ─────────────────────────────────────────────────
function RateOurServicesCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const labels = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      toast({ title: "Please select a star rating", variant: "destructive" });
      return;
    }
    if (text.trim().length < 5) {
      toast({ title: "Please write at least a short note (5+ characters)", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/reviews", {
        method: "POST",
        body: JSON.stringify({ rating, reviewText: text.trim() }),
      });
      setDone(true);
      setRating(0); setText("");
      toast({ title: "Thank you for your review!", description: "Your feedback helps us improve." });
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    } catch (err) {
      toast({ title: "Could not submit review", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="mt-8 rounded-2xl border overflow-hidden"
      style={{ borderColor: "rgba(218,165,32,.3)", background: "linear-gradient(135deg, rgba(124,58,237,.04), rgba(218,165,32,.06))" }}
      data-testid="rate-our-services-card"
    >
      <div className="px-5 sm:px-6 py-4 border-b flex items-center gap-3" style={{ borderColor: "rgba(218,165,32,.2)" }}>
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shadow-md" style={{ background: "linear-gradient(135deg, #DAA520, #FFD700)" }}>
          <Star className="h-5 w-5 text-purple-950 fill-purple-950" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Rate Our Services</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Share your experience with the community</p>
        </div>
      </div>

      {done ? (
        <div className="p-6 text-center" data-testid="rate-success">
          <div className="inline-flex h-12 w-12 rounded-full items-center justify-center mb-3" style={{ background: "linear-gradient(135deg, #DAA520, #FFD700)" }}>
            <CheckCircle2 className="h-7 w-7 text-purple-950" />
          </div>
          <p className="font-bold text-foreground">Thanks for sharing your feedback!</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Your story may appear in our Member Stories.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDone(false)}
            className="border-purple-200 text-purple-700 hover:bg-purple-50"
            data-testid="btn-write-another-review"
          >
            Write another review
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          {/* Stars */}
          <div className="flex flex-col items-center sm:items-start gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Your Rating</Label>
            <div className="flex items-center gap-1.5" onMouseLeave={() => setHover(0)} data-testid="star-rating">
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = (hover || rating) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHover(n)}
                    onClick={() => setRating(n)}
                    className="p-1 rounded-md hover:bg-amber-100/60 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    data-testid={`star-${n}`}
                  >
                    <Star
                      className={`h-7 w-7 transition-all ${
                        filled ? "text-amber-400 fill-amber-400 drop-shadow-[0_2px_4px_rgba(218,165,32,0.4)]" : "text-gray-300"
                      } ${filled ? "scale-110" : ""}`}
                    />
                  </button>
                );
              })}
              <span className="ml-2 text-sm font-semibold text-amber-700 min-w-[64px]" data-testid="rating-label">
                {(hover || rating) ? labels[hover || rating] : ""}
              </span>
            </div>
          </div>

          {/* Textarea */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" /> Your Story / Feedback
            </Label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 500))}
              placeholder="Tell us how Smit CSC Info has helped you serve your community…"
              rows={4}
              data-testid="textarea-review"
              className="w-full rounded-xl border border-purple-200/60 bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400 resize-none shadow-sm transition-all"
            />
            <div className="flex justify-end text-[11px] text-muted-foreground">
              {text.length}/500
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={busy}
              data-testid="btn-submit-review"
              className="gap-2 bg-gradient-to-r from-purple-700 via-purple-600 to-amber-500 hover:from-purple-800 hover:to-amber-600 text-white font-bold shadow-md disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? "Submitting…" : "Submit Review"}
            </Button>
          </div>
        </form>
      )}
    </motion.div>
  );
}

// ─── Logout card (prominent red, on Profile tab) ────────────────────────────
function LogoutCard() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const doLogout = () => {
    try { sessionStorage.removeItem("auth_token"); } catch {}
    try { localStorage.removeItem("auth_token"); } catch {}
    queryClient.clear();
    logout();
    setLocation("/");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="mt-6 rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50 overflow-hidden"
      data-testid="logout-card"
    >
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row items-center sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-md shrink-0">
            <LogOut className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Sign out of your account</h3>
            <p className="text-xs text-muted-foreground mt-0.5">You'll be returned to the homepage.</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button
            onClick={() => setOpen(true)}
            data-testid="btn-account-logout"
            className="gap-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-bold shadow-md min-w-[140px]"
          >
            <LogOut className="h-4 w-4" /> Logout
          </Button>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogOut className="h-5 w-5 text-red-600" />
                Sign out?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              You'll be signed out and returned to the homepage. Any unsaved changes may be lost.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} data-testid="btn-cancel-logout">Cancel</Button>
              <Button
                onClick={doLogout}
                data-testid="btn-confirm-logout"
                className="bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-bold gap-2"
              >
                <LogOut className="h-4 w-4" /> Yes, sign me out
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
}

// ─── Security section ───────────────────────────────────────────────────────
function SecuritySection() {
  const { toast } = useToast();
  const [cur, setCur] = useState("");
  const [nxt, setNxt] = useState("");
  const [conf, setConf] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNxt, setShowNxt] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nxt.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    if (nxt !== conf) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await apiFetch("/api/profile/password", { method: "POST", body: JSON.stringify({ currentPassword: cur, newPassword: nxt }) });
      toast({ title: "Password updated successfully!" });
      setCur(""); setNxt(""); setConf("");
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 max-w-md">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Current Password</Label>
        <div className="relative">
          <Input type={showCur ? "text" : "password"} value={cur} onChange={e => setCur(e.target.value)}
            placeholder="Enter current password" required data-testid="input-current-password" className="pr-10" />
          <button type="button" onClick={() => setShowCur(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">New Password</Label>
        <div className="relative">
          <Input type={showNxt ? "text" : "password"} value={nxt} onChange={e => setNxt(e.target.value)}
            placeholder="At least 6 characters" required data-testid="input-new-password" className="pr-10" />
          <button type="button" onClick={() => setShowNxt(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showNxt ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Confirm New Password</Label>
        <div className="relative">
          <Input type={showConf ? "text" : "password"} value={conf} onChange={e => setConf(e.target.value)}
            placeholder="Re-enter new password" required data-testid="input-confirm-password" className="pr-10" />
          <button type="button" onClick={() => setShowConf(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showConf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {conf && nxt && (
          <p className={`text-[11px] flex items-center gap-1 ${nxt === conf ? "text-green-600" : "text-red-500"}`}>
            {nxt === conf ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {nxt === conf ? "Passwords match" : "Passwords do not match"}
          </p>
        )}
      </div>
      <Button type="submit" disabled={busy} className="gap-2 bg-gradient-to-r from-purple-700 to-amber-600 text-white" data-testid="btn-update-password">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        <Lock className="h-4 w-4" /> Update Password
      </Button>
    </form>
  );
}

// ─── Certificate section ────────────────────────────────────────────────────
function CertificateSection({ profile, status }: {
  profile: ProfileData; status: UserStatus | undefined;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);
  const isPrime = !!status?.is_prime;

  if (!isPrime) {
    return (
      <div className="text-center py-8" data-testid="certificate-locked">
        <div className="inline-flex h-16 w-16 rounded-full bg-purple-100 items-center justify-center mb-4">
          <Award className="h-8 w-8 text-purple-600" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-1">Prime Members Only</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
          Upgrade to Prime to unlock your official Smit CSC Info digital certificate, downloadable as PDF or PNG.
        </p>
        <Button onClick={() => window.location.href = "/membership"} className="gap-2 bg-gradient-to-r from-amber-500 to-yellow-600 text-purple-950 font-bold hover:from-amber-600 hover:to-yellow-700">
          <Crown className="h-4 w-4" /> Upgrade to Prime
        </Button>
      </div>
    );
  }

  const certData = {
    userName: profile.name,
    membershipDate: status?.expires_at ? format(new Date(status.expires_at), "dd MMMM yyyy") : "",
  };

  const dl = async (kind: "pdf" | "png") => {
    setBusy(kind);
    try {
      if (kind === "pdf") await downloadCertificatePDF(certData);
      else await downloadCertificatePNG(certData);
      toast({ title: `${kind.toUpperCase()} certificate downloaded!` });
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-6 text-center" style={{ background: "linear-gradient(145deg, #1a0033 0%, #2d0a5b 50%, #1a0033 100%)", boxShadow: "inset 0 0 0 1px rgba(218,165,32,.3)" }}>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest mb-3"
          style={{ background: "rgba(218,165,32,.2)", color: "#FFD700", border: "1px solid rgba(218,165,32,.45)" }}>
          <Sparkles className="h-3 w-3" /> OFFICIAL CERTIFICATE
        </div>
        <Award className="h-12 w-12 mx-auto mb-2 text-amber-400" />
        <h3 className="text-lg font-bold text-amber-100 mb-1">{profile.name}</h3>
        <p className="text-xs text-purple-200/80 mb-1">Smit CSC Info Prime Member</p>
        {status?.expires_at && (
          <p className="text-[11px] text-amber-300/80">
            Valid until {format(new Date(status.expires_at), "dd MMM yyyy")}
          </p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={() => dl("pdf")} disabled={!!busy} data-testid="btn-download-pdf"
          className="flex-1 gap-2 bg-gradient-to-r from-purple-700 to-purple-900 text-white hover:from-purple-800 hover:to-purple-950">
          {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePdf className="h-4 w-4" />}
          Download PDF
        </Button>
        <Button onClick={() => dl("png")} disabled={!!busy} data-testid="btn-download-png" variant="outline"
          className="flex-1 gap-2 border-amber-400 text-amber-700 hover:bg-amber-50">
          {busy === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
          Download PNG
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground text-center">
        High-resolution A4 landscape · Print-ready · 300 DPI
      </p>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────
type TabKey = "profile" | "security" | "certificate" | "queries";
const PATH_TO_TAB: Record<string, TabKey> = {
  "/profile": "profile",
  "/security": "security",
  "/certificate": "certificate",
  "/queries": "queries",
  "/my-queries": "queries",
};

export default function Account() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  const { data: profile } = useQuery<ProfileData>({
    queryKey: ["profile-account"],
    queryFn: () => apiFetch<ProfileData>("/api/profile"),
    enabled: !!user,
  });

  const { data: status } = useQuery<UserStatus>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<UserStatus>("/api/user/status"),
    enabled: !!user,
  });

  // Initial tab from URL path or hash, default = profile.
  const initialTab: TabKey =
    PATH_TO_TAB[location] ??
    (PATH_TO_TAB["/" + window.location.hash.slice(1)] as TabKey) ??
    "profile";

  const [tab, setTab] = useState<TabKey>(initialTab);

  // Keep tab in sync if user navigates to a deep-link path.
  useEffect(() => {
    const next = PATH_TO_TAB[location];
    if (next && next !== tab) setTab(next);
  }, [location]);

  const handleTabChange = (val: string) => {
    const t = val as TabKey;
    setTab(t);
    // Update URL but stay on the Account page so refresh / share works.
    const targetPath =
      t === "profile" ? "/account" : t === "queries" ? "/my-queries" : `/${t}`;
    if (location !== targetPath) setLocation(targetPath, { replace: true });
  };

  const isPrime = !!status?.is_prime;

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const handleUpdate = (updated: ProfileData) => {
    queryClient.setQueryData(["profile-account"], updated);
    queryClient.setQueryData(getGetMeQueryKey(), updated);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const tabs: { value: TabKey; label: string; shortLabel: string; icon: any }[] = [
    { value: "profile",     label: "Profile",                shortLabel: "Profile",     icon: UserIcon },
    { value: "security",    label: "Security",               shortLabel: "Security",    icon: Lock },
    { value: "queries",     label: "My Queries",             shortLabel: "Queries",     icon: MessageSquare },
    { value: "certificate", label: "Membership Certificate", shortLabel: "Certificate", icon: Award },
  ];

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6" data-testid="account-page">
      {/* Header — gold/purple lounge for Prime, plain indigo card for free members */}
      {isPrime ? (
        <div className="rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #2d0a5b 0%, #4c1d95 50%, #6b21a8 100%)", boxShadow: "0 12px 40px rgba(76,29,149,.25)" }}>
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(218,165,32,.18) 0%, transparent 70%)", transform: "translate(30%,-30%)" }} />
          <div className="relative z-10 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FFD700, #DAA520)" }}>
              <UserCog className="h-7 w-7 text-purple-950" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-amber-200 to-yellow-100 bg-clip-text text-transparent">
                My Account
              </h1>
              <p className="text-sm text-purple-200/80 mt-0.5">
                Manage your profile, security, and membership benefits — all in one place.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl p-6 sm:p-8 bg-white border border-gray-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
              <UserCog className="h-7 w-7 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                My Account
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Manage your profile, security, and account preferences.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Follow us — shown to everyone, above profile, in standard website colors */}
      {isPrime ? (
        <PrimeSocialLinks />
      ) : (
        <SocialFollowCard />
      )}

      {/* Tabbed UI */}
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        {/* Tab list — gold/purple for Prime, clean indigo for free members */}
        <div
          className={`rounded-2xl p-1.5 border ${isPrime ? "" : "bg-gray-50 border-gray-200"}`}
          style={isPrime ? { background: "linear-gradient(135deg, rgba(124,58,237,.06), rgba(218,165,32,.05))", borderColor: "rgba(99,52,168,.15)", boxShadow: "0 4px 16px rgba(99,52,168,.06)" } : undefined}
        >
          <TabsList className="bg-transparent w-full h-auto grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-0">
            {tabs.map((tb) => {
              const active = tab === tb.value;
              return (
                <TabsTrigger
                  key={tb.value}
                  value={tb.value}
                  data-testid={`tab-${tb.value}`}
                  className={`relative h-auto py-3 px-3 sm:px-4 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2
                    data-[state=active]:shadow-md
                    ${active
                      ? isPrime
                        ? "text-white data-[state=active]:scale-[1.01]"
                        : "text-white bg-indigo-600"
                      : isPrime
                        ? "text-purple-950 hover:text-purple-900 hover:bg-white/80"
                        : "text-gray-700 hover:text-gray-900 hover:bg-white"}`}
                  style={active && isPrime ? { background: "linear-gradient(135deg, #6b21a8 0%, #4c1d95 50%, #DAA520 140%)", boxShadow: "0 6px 18px rgba(76,29,149,.35), inset 0 0 0 1px rgba(218,165,32,.4)" } : undefined}
                >
                  <tb.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{tb.label}</span>
                  <span className="sm:hidden">{tb.shortLabel}</span>
                  {tb.value === "certificate" && isPrime && active && (
                    <Crown className="h-3.5 w-3.5 text-amber-300 ml-1" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab panels */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 rounded-3xl border bg-white shadow-sm overflow-hidden"
            style={isPrime && tab === "certificate"
              ? { borderColor: "rgba(218,165,32,.35)", boxShadow: "0 8px 32px rgba(99,52,168,.08), 0 0 0 1px rgba(218,165,32,.15)" }
              : { borderColor: "rgba(99,52,168,.12)" }}
          >
            <TabsContent value="profile" className="p-6 sm:p-8 m-0" data-testid="tabpanel-profile">
              <SectionHeader
                icon={UserIcon}
                title="Profile Settings"
                subtitle="Update your name, contact details and profile photo"
                isPrime={isPrime}
              />
              <ProfileSection profile={profile} isPrime={isPrime} onUpdate={handleUpdate} />
              {!isPrime && (
                <div
                  className="relative overflow-hidden rounded-2xl p-5 sm:p-7 mt-6 text-white shadow-lg"
                  style={{
                    background:
                      "linear-gradient(120deg, #2d0a5b 0%, #3b0f73 45%, #4c1d95 100%)",
                  }}
                  data-testid="card-premium-access"
                >
                  <div
                    className="absolute -top-16 -right-16 w-64 h-64 rounded-full pointer-events-none"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(255,215,0,.18) 0%, transparent 70%)",
                    }}
                  />
                  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
                    <div className="flex-1 min-w-0">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-gradient-to-r from-amber-400 to-yellow-500 text-purple-950">
                        <Crown className="h-3 w-3" /> Premium Access
                      </span>
                      <h3 className="mt-3 text-lg sm:text-xl font-extrabold leading-snug">
                        Unlock Premium AI tools, exclusive content &amp;
                        priority support
                      </h3>
                      <p className="mt-1.5 text-sm text-purple-100/80">
                        Editable forms, daily scheme alerts, HD background
                        remover and more — for serious operators.
                      </p>
                    </div>
                    <Button
                      onClick={() => setLocation("/membership")}
                      data-testid="btn-upgrade-prime"
                      className="shrink-0 h-11 px-5 font-bold text-purple-950 shadow-md hover:brightness-105"
                      style={{
                        background:
                          "linear-gradient(135deg, #FFD700, #DAA520)",
                      }}
                    >
                      <Crown className="h-4 w-4 mr-1.5" /> Upgrade to Prime
                    </Button>
                  </div>
                </div>
              )}
              <RateOurServicesCard />
              <LogoutCard />
            </TabsContent>

            <TabsContent value="queries" className="p-0 m-0" data-testid="tabpanel-queries">
              <MyQueries />
            </TabsContent>

            <TabsContent value="security" className="p-6 sm:p-8 m-0" data-testid="tabpanel-security">
              <SectionHeader
                icon={Lock}
                title="Security"
                subtitle="Change your password to keep your account safe"
              />
              <SecuritySection />
            </TabsContent>

            <TabsContent value="certificate" className="p-6 sm:p-8 m-0" data-testid="tabpanel-certificate">
              <SectionHeader
                icon={Award}
                title="Prime Membership Certificate"
                subtitle="View and download your official digital certificate"
                isPrime={isPrime}
              />
              <CertificateSection profile={profile} status={status} />
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>

      <p className="text-center text-[11px] text-muted-foreground pt-2 flex items-center justify-center gap-1.5">
        <ShieldCheck className="h-3 w-3" /> Your data is encrypted and secure
      </p>
    </div>
  );
}
