import { useState, useRef, useCallback } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Pencil, Camera, Save, X, Loader2, Eye, EyeOff,
  Mail, Phone, Lock, CheckCircle2, AlertCircle,
  ZoomIn, ZoomOut, RotateCcw, RotateCw, Crop,
  Crown, Sparkles, Download, ArrowRight, Calendar,
  ShieldCheck, Video, CreditCard,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { downloadCertificatePDF, downloadCertificatePNG } from "@/hooks/use-certificate";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileData {
  id: number;
  name: string;
  email: string;
  mobile: string;
  profilePhoto: string | null;
  role: string;
}

export interface MembershipInfo {
  isActive: boolean;
  plan?: string;
  expiresAt?: string;
  daysRemaining?: number;
}

interface UnifiedProfileCardProps {
  profile: ProfileData;
  membership: MembershipInfo;
  membershipDate: string;
  contentStats: { totalContent: number; freeContent: number; primeContent: number };
  recentPaymentsCount: number;
  onUpdate: (updated: ProfileData) => void;
}

// ─── Canvas crop helper ───────────────────────────────────────────────────────

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

  const scaleX = bw / img.width;
  const scaleY = bh / img.height;

  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  canvas.getContext("2d")!.drawImage(
    off, crop.x * scaleX, crop.y * scaleY,
    crop.width * scaleX, crop.height * scaleY, 0, 0, size, size,
  );

  const url = canvas.toDataURL("image/jpeg", 0.88);
  if (url.length > 500_000) {
    const s = document.createElement("canvas");
    s.width = 280; s.height = 280;
    s.getContext("2d")!.drawImage(canvas, 0, 0, 280, 280);
    return s.toDataURL("image/jpeg", 0.80);
  }
  return url;
}

// ─── Image Cropper Modal ──────────────────────────────────────────────────────

function CropModal({ open, src, onDone, onCancel }: {
  open: boolean; src: string;
  onDone: (url: string) => void; onCancel: () => void;
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

  const close = () => {
    setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && close()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden" style={{ maxHeight: "90dvh" }}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Crop className="h-4 w-4 text-primary" /> Crop Profile Photo
          </DialogTitle>
          <DialogDescription className="text-xs">Drag to reposition · Pinch or scroll to zoom</DialogDescription>
        </DialogHeader>
        <div className="relative mx-5 rounded-xl overflow-hidden bg-gray-900" style={{ height: 300 }}>
          <Cropper image={src} crop={crop} zoom={zoom} rotation={rotation} aspect={1}
            cropShape="round" showGrid={false}
            onCropChange={setCrop} onZoomChange={setZoom}
            onCropComplete={(_, px) => setPixels(px)}
            style={{
              cropAreaStyle: { border: "2px solid rgba(99,102,241,.9)", boxShadow: "0 0 0 9999px rgba(0,0,0,.55)" },
            }}
          />
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1"><ZoomIn className="h-3 w-3" /> Zoom</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom(z => Math.max(1, z - .1))} className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-gray-50"><ZoomOut className="h-3.5 w-3.5 text-gray-500" /></button>
              <Slider min={1} max={3} step={0.05} value={[zoom]} onValueChange={([v]) => setZoom(v)} className="flex-1" />
              <button onClick={() => setZoom(z => Math.min(3, z + .1))} className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-gray-50"><ZoomIn className="h-3.5 w-3.5 text-gray-500" /></button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1"><RotateCw className="h-3 w-3" /> Rotate</span>
              <span>{rotation}°</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setRotation(r => r - 90)} className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-gray-50"><RotateCcw className="h-3.5 w-3.5 text-gray-500" /></button>
              <Slider min={-180} max={180} step={1} value={[rotation]} onValueChange={([v]) => setRotation(v)} className="flex-1" />
              <button onClick={() => setRotation(r => r + 90)} className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-gray-50"><RotateCw className="h-3.5 w-3.5 text-gray-500" /></button>
            </div>
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

// ─── Password Modal ───────────────────────────────────────────────────────────

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [cur, setCur] = useState(""); const [nxt, setNxt] = useState("");
  const [conf, setConf] = useState(""); const [showCur, setShowCur] = useState(false);
  const [showNxt, setShowNxt] = useState(false); const [showConf, setShowConf] = useState(false); const [busy, setBusy] = useState(false);

  const reset = () => { setCur(""); setNxt(""); setConf(""); onClose(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nxt.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    if (nxt !== conf) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await apiFetch("/api/profile/password", { method: "POST", body: JSON.stringify({ currentPassword: cur, newPassword: nxt }) });
      toast({ title: "Password updated successfully!" }); reset();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && reset()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" /> Change Password</DialogTitle>
          <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          {[
            { label: "Current Password", val: cur, set: setCur, show: showCur, toggle: () => setShowCur(s => !s) },
            { label: "New Password", val: nxt, set: setNxt, show: showNxt, toggle: () => setShowNxt(s => !s) },
          ].map(({ label, val, set, show, toggle }) => (
            <div key={label} className="space-y-1.5">
              <Label>{label}</Label>
              <div className="relative">
                <Input type={show ? "text" : "password"} value={val} onChange={e => set(e.target.value)} placeholder={label} required className="pr-10" />
                <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <div className="relative">
              <Input type={showConf ? "text" : "password"} value={conf} onChange={e => setConf(e.target.value)} placeholder="Re-enter new password" required className="pr-10" />
              <button type="button" onClick={() => setShowConf(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showConf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {conf && nxt && (
              <p className={`text-xs flex items-center gap-1 ${nxt === conf ? "text-green-600" : "text-red-500"}`}>
                {nxt === conf ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {nxt === conf ? "Passwords match" : "Passwords do not match"}
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={reset} disabled={busy}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Update Password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Unified Profile Card ────────────────────────────────────────────────

export function UnifiedProfileCard({
  profile, membership, membershipDate, contentStats, recentPaymentsCount, onUpdate,
}: UnifiedProfileCardProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [mobile, setMobile] = useState(profile.mobile);
  const [photo, setPhoto] = useState<string | null>(profile.profilePhoto);
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile.profilePhoto);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const isPrime = membership.isActive;

  const openEdit = () => {
    setName(profile.name); setEmail(profile.email); setMobile(profile.mobile);
    setPhoto(profile.profilePhoto); setPhotoPreview(profile.profilePhoto);
    setErrors({}); setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setErrors({}); };

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Image too large (max 5MB)", variant: "destructive" }); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast({ title: "Only JPG, PNG or WebP allowed", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = ev => { setCropSrc(ev.target?.result as string); setCropOpen(true); };
    reader.readAsDataURL(file);
  }, [toast]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = "Name must be at least 2 characters";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Invalid email";
    if (!mobile.trim() || !/^\d{10}$/.test(mobile)) e.mobile = "Must be exactly 10 digits";
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

  const certData = { userName: profile.name, membershipDate: format(new Date(membershipDate), "dd MMMM yyyy") };

  const downloadCertPDF = async () => {
    setCertBusy(true);
    try {
      await downloadCertificatePDF(certData);
      toast({ title: "PDF Certificate downloaded!" });
    } catch (err) { toast({ title: "Download failed", description: (err as Error).message, variant: "destructive" }); }
    finally { setCertBusy(false); }
  };

  const downloadCertPNG = async () => {
    setCertBusy(true);
    try {
      await downloadCertificatePNG(certData);
      toast({ title: "PNG Certificate downloaded!" });
    } catch (err) { toast({ title: "Download failed", description: (err as Error).message, variant: "destructive" }); }
    finally { setCertBusy(false); }
  };

  const avatarSrc = editing ? photoPreview : profile.profilePhoto;
  const displayName = editing ? name : profile.name;

  return (
    <>
      {cropSrc && <CropModal open={cropOpen} src={cropSrc} onDone={url => { setPhotoPreview(url); setPhoto(url); setCropOpen(false); setCropSrc(null); }} onCancel={() => { setCropOpen(false); setCropSrc(null); }} />}
      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileSelect} className="hidden" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-3xl"
        style={isPrime
          ? { background: "linear-gradient(145deg, #0f0c29 0%, #1a1a4e 50%, #0d1b4b 100%)", boxShadow: "0 0 0 1px rgba(218,165,32,.3), 0 24px 64px rgba(0,0,0,.45), 0 0 80px rgba(218,165,32,.07)" }
          : { background: "linear-gradient(145deg, #ffffff 0%, #f8f9ff 100%)", boxShadow: "0 1px 0 rgba(0,0,0,.06), 0 8px 32px rgba(79,70,229,.08)", border: "1px solid rgba(79,70,229,.1)" }
        }
      >
        {/* Glow blobs for prime */}
        {isPrime && <>
          <motion.div className="absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(218,165,32,.13) 0%, transparent 70%)" }} animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 5, repeat: Infinity }} />
          <motion.div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,215,0,.08) 0%, transparent 70%)" }} animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 6, repeat: Infinity }} />
        </>}

        <div className="relative z-10">

          {/* ── TOP HEADER ── */}
          <div className={`p-6 ${isPrime ? "pb-4" : "pb-5"}`}>
            <div className="flex items-start gap-4">

              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <motion.div
                  className="h-[72px] w-[72px] rounded-2xl overflow-hidden flex items-center justify-center text-2xl font-black shadow-lg"
                  style={isPrime
                    ? { background: "linear-gradient(135deg, #DAA520, #FFD700, #B8860B)" }
                    : { background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)", color: "#4338ca" }
                  }
                  whileHover={{ scale: editing ? 1.02 : 1 }}
                >
                  {avatarSrc
                    ? <img src={avatarSrc} alt="Profile" className="w-full h-full object-cover" />
                    : <span className={isPrime ? "text-white" : "text-indigo-700"}>{displayName.charAt(0).toUpperCase()}</span>
                  }
                </motion.div>

                {/* Crown badge */}
                {isPrime && !editing && (
                  <motion.div className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full flex items-center justify-center shadow-md" style={{ background: "linear-gradient(135deg, #FFD700, #DAA520)" }} animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                    <Crown className="h-3 w-3 text-amber-900" />
                  </motion.div>
                )}

                {/* Edit overlay */}
                {editing && (
                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => fileRef.current?.click()} className="absolute inset-0 rounded-2xl bg-black/45 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:bg-black/60 transition-colors">
                    <Camera className="h-5 w-5 text-white" />
                    <span className="text-[9px] text-white font-bold">CHANGE</span>
                  </motion.button>
                )}
              </div>

              {/* Name + badge + details */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {isPrime ? (
                    <motion.span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest" style={{ background: "rgba(218,165,32,.2)", border: "1px solid rgba(218,165,32,.45)", color: "#FFD700" }} animate={{ opacity: [.8, 1, .8] }} transition={{ duration: 2, repeat: Infinity }}>
                      <Sparkles className="h-2.5 w-2.5" /> PRIME
                    </motion.span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest bg-gray-100 text-gray-500 border border-gray-200">
                      FREE MEMBER
                    </span>
                  )}
                  {editing && photoPreview && photoPreview !== profile.profilePhoto && (
                    <span className="text-[10px] text-green-500 font-semibold flex items-center gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" /> Photo ready</span>
                  )}
                </div>

                {editing ? (
                  <Input value={name} onChange={e => setName(e.target.value)} className={`text-lg font-bold h-9 px-2 mb-1.5 ${isPrime ? "bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-amber-400" : ""} ${errors.name ? "border-red-400" : ""}`} placeholder="Your name" />
                ) : (
                  <h2 className={`text-xl font-black truncate ${isPrime ? "text-white" : "text-foreground"}`}>{profile.name}</h2>
                )}

                {!editing && (
                  <p className={`text-xs mt-0.5 truncate ${isPrime ? "text-white/50" : "text-muted-foreground"}`}>
                    {profile.email}
                    {profile.mobile && <> · {profile.mobile}</>}
                  </p>
                )}
              </div>

              {/* Action buttons top-right */}
              <div className="flex-shrink-0 mt-0.5">
                {!editing ? (
                  <motion.button onClick={openEdit} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${isPrime ? "bg-white/10 text-white/80 hover:bg-white/20" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100"}`}>
                    <Pencil className="h-3 w-3" /> Edit
                  </motion.button>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Button size="sm" onClick={save} disabled={saving} className="h-8 px-3 text-xs gap-1.5">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving} className={`h-8 px-3 text-xs gap-1.5 ${isPrime ? "text-white/70 hover:text-white hover:bg-white/10" : ""}`}>
                      <X className="h-3 w-3" /> Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Edit mode: inline fields */}
            <AnimatePresence>
              {editing && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div className="space-y-1">
                      <Label className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isPrime ? "text-white/50" : "text-muted-foreground"}`}><Mail className="h-2.5 w-2.5" /> Email</Label>
                      <Input value={email} type="email" onChange={e => setEmail(e.target.value)} className={`h-9 text-sm ${isPrime ? "bg-white/10 border-white/20 text-white placeholder:text-white/40" : ""} ${errors.email ? "border-red-400" : ""}`} placeholder="your@email.com" />
                      {errors.email && <p className="text-[10px] text-red-400 flex items-center gap-0.5"><AlertCircle className="h-2.5 w-2.5" />{errors.email}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isPrime ? "text-white/50" : "text-muted-foreground"}`}><Phone className="h-2.5 w-2.5" /> Mobile</Label>
                      <Input value={mobile} type="tel" inputMode="numeric" onChange={e => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} className={`h-9 text-sm ${isPrime ? "bg-white/10 border-white/20 text-white placeholder:text-white/40" : ""} ${errors.mobile ? "border-red-400" : ""}`} placeholder="10-digit number" />
                      {errors.mobile && <p className="text-[10px] text-red-400 flex items-center gap-0.5"><AlertCircle className="h-2.5 w-2.5" />{errors.mobile}</p>}
                    </div>
                  </div>
                  <button onClick={() => setPwOpen(true)} className={`mt-3 flex items-center gap-1.5 text-xs font-semibold hover:underline underline-offset-2 ${isPrime ? "text-amber-400" : "text-primary"}`}>
                    <Lock className="h-3 w-3" /> Change Password
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── DIVIDER ── */}
          <div className={`mx-6 h-px ${isPrime ? "bg-white/8" : "bg-gray-100"}`} />

          {/* ── MEMBERSHIP ACTION ZONE ── */}
          <div className="p-6 pt-5">
            {isPrime ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-white/50 text-xs mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3" />
                    {membership.plan} Plan · {membership.daysRemaining} days remaining
                  </p>
                  <p className="text-white/35 text-xs flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    Member since {format(new Date(membershipDate), "MMMM yyyy")}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                  <motion.button
                    onClick={downloadCertPDF}
                    disabled={certBusy}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-amber-900 disabled:opacity-60 shadow-lg"
                    style={{ background: "linear-gradient(135deg, #FFD700, #DAA520, #B8860B)", boxShadow: "0 4px 20px rgba(218,165,32,.45), inset 0 1px 0 rgba(255,255,255,.25)" }}
                  >
                    {certBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {certBusy ? "Generating…" : "PDF"}
                  </motion.button>
                  <motion.button
                    onClick={downloadCertPNG}
                    disabled={certBusy}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 border"
                    style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,215,0,0.9)", borderColor: "rgba(218,165,32,0.35)" }}
                  >
                    <Download className="h-4 w-4" />
                    PNG
                  </motion.button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Unlock Prime Membership</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Get your certificate, full library access & more</p>
                  </div>
                  <Link href="/membership" className="flex-shrink-0">
                    <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                      <Button className="gap-2 font-bold shadow-lg" style={{ background: "linear-gradient(135deg, #4F46E5, #7C3AED)", border: "none", boxShadow: "0 4px 16px rgba(79,70,229,.35)" }}>
                        <Crown className="h-4 w-4" /> Upgrade to Prime <ArrowRight className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  </Link>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: "🏆", label: "Certificate" },
                    { icon: "📚", label: "Full Library" },
                    { icon: "⚡", label: "Priority Updates" },
                  ].map(({ icon, label }) => (
                    <div key={label} className="flex flex-col items-center gap-1.5 bg-indigo-50/60 border border-dashed border-indigo-100 rounded-2xl px-2 py-3">
                      <span className="text-xl opacity-50">{icon}</span>
                      <span className="text-[10px] font-semibold text-indigo-400 text-center leading-tight">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── DIVIDER ── */}
          <div className={`mx-6 h-px ${isPrime ? "bg-white/8" : "bg-gray-100"}`} />

          {/* ── STATS STRIP ── */}
          <div className="grid grid-cols-3 divide-x px-0" style={{ divideBorderColor: isPrime ? "rgba(255,255,255,.06)" : "#f3f4f6" }}>
            {[
              { icon: Calendar, label: "Member Since", value: format(new Date(membershipDate), "MMM ''yy") },
              { icon: Video, label: "Content", value: `${contentStats.totalContent} videos` },
              { icon: CreditCard, label: "Payments", value: `${recentPaymentsCount} record${recentPaymentsCount !== 1 ? "s" : ""}` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex flex-col items-center py-4 px-2 gap-0.5">
                <Icon className={`h-4 w-4 mb-1 ${isPrime ? "text-white/30" : "text-muted-foreground/50"}`} />
                <span className={`text-sm font-bold ${isPrime ? "text-white/80" : "text-foreground"}`}>{value}</span>
                <span className={`text-[10px] ${isPrime ? "text-white/35" : "text-muted-foreground"}`}>{label}</span>
              </div>
            ))}
          </div>

        </div>
      </motion.div>
    </>
  );
}
