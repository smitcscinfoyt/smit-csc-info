import { useState } from "react";
import { Mail, Phone, Youtube, Clock, MapPin, Send, MessageCircle, Lock, Crown, LifeBuoy, Loader2, Facebook, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useGetMembershipStatus } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useIsPrime } from "@/hooks/use-prime";

type Lang = "en" | "gu" | "hi";
type CatLabel = Record<Lang, string>;
interface CatGroup { group: CatLabel; items: { value: string; label: CatLabel }[] }

const CATEGORY_GROUPS: CatGroup[] = [
  {
    group: { en: "Recharge & Wallet", gu: "રિચાર્જ અને વોલેટ", hi: "रिचार्ज और वॉलेट" },
    items: [
      { value: "recharge_mobile",   label: { en: "Mobile / DTH recharge failed",        gu: "મોબાઇલ / DTH રિચાર્જ ફેઇલ",         hi: "मोबाइल / DTH रिचार्ज फेल" } },
      { value: "recharge_bill",     label: { en: "Bill payment issue (Electricity/Gas/LIC/FASTag)", gu: "બિલ પેમેન્ટ સમસ્યા (વીજળી/ગેસ/LIC/FASTag)", hi: "बिल भुगतान समस्या (बिजली/गैस/LIC/FASTag)" } },
      { value: "wallet",            label: { en: "Wallet top-up not credited",          gu: "વોલેટ ટોપ-અપ ક્રેડિટ નથી થયું",       hi: "वॉलेट टॉप-अप क्रेडिट नहीं हुआ" } },
      { value: "money_transfer",    label: { en: "Money Transfer / DMT issue",          gu: "મની ટ્રાન્સફર / DMT સમસ્યા",         hi: "मनी ट्रांसफर / DMT समस्या" } },
      { value: "kyc",               label: { en: "KYC / verification issue",            gu: "KYC / વેરિફિકેશન સમસ્યા",            hi: "KYC / सत्यापन समस्या" } },
      { value: "commission",        label: { en: "Commission not credited",             gu: "કમિશન ક્રેડિટ નથી થયું",              hi: "कमीशन क्रेडिट नहीं हुआ" } },
      { value: "tpin",              label: { en: "T-PIN reset / forgot",                gu: "T-PIN રીસેટ / ભૂલી ગયા",             hi: "T-PIN रीसेट / भूल गए" } },
    ],
  },
  {
    group: { en: "Membership & Payments", gu: "મેમ્બરશિપ અને પેમેન્ટ", hi: "मेंबरशिप और भुगतान" },
    items: [
      { value: "operator_membership", label: { en: "Operator membership (Silver/Gold/Premium)", gu: "ઓપરેટર મેમ્બરશિપ (Silver/Gold/Premium)", hi: "ऑपरेटर मेंबरशिप (Silver/Gold/Premium)" } },
      { value: "prime",             label: { en: "Prime membership",                    gu: "Prime મેમ્બરશિપ",                    hi: "Prime सदस्यता" } },
      { value: "payment_phonepe",   label: { en: "PhonePe payment failed / pending",    gu: "PhonePe પેમેન્ટ ફેઇલ / પેન્ડિંગ",     hi: "PhonePe भुगतान फेल / पेंडिंग" } },
      { value: "refund",            label: { en: "Refund request",                      gu: "રિફંડ વિનંતી",                       hi: "रिफंड अनुरोध" } },
      { value: "coupon",            label: { en: "Coupon code not working",             gu: "કૂપન કોડ કામ નથી કરતો",              hi: "कूपन कोड काम नहीं कर रहा" } },
    ],
  },
  {
    group: { en: "Digital Tools", gu: "ડિજિટલ ટૂલ્સ", hi: "डिजिटल टूल्स" },
    items: [
      { value: "tool_pdf_editor",   label: { en: "PDF Editor issue",                    gu: "PDF એડિટર સમસ્યા",                   hi: "PDF एडिटर समस्या" } },
      { value: "tool_esign",        label: { en: "E-sign PDF issue",                    gu: "ઈ-સાઇન PDF સમસ્યા",                   hi: "ई-साइन PDF समस्या" } },
      { value: "tool_watermark",    label: { en: "Watermark PDF issue",                 gu: "વોટરમાર્ક PDF સમસ્યા",                hi: "वॉटरमार्क PDF समस्या" } },
      { value: "tool_bg_remover",   label: { en: "Background Remover issue",            gu: "બેકગ્રાઉન્ડ રિમૂવર સમસ્યા",            hi: "बैकग्राउंड रिमूवर समस्या" } },
      { value: "tool_image_upscaler", label: { en: "Image Upscaler issue",              gu: "ઇમેજ અપસ્કેલર સમસ્યા",                hi: "इमेज अपस्केलर समस्या" } },
      { value: "tool_id_card",      label: { en: "ID Card Engine issue",                gu: "ID કાર્ડ એન્જિન સમસ્યા",              hi: "ID कार्ड इंजन समस्या" } },
      { value: "tool_passport",     label: { en: "Passport Photo Engine issue",         gu: "પાસપોર્ટ ફોટો એન્જિન સમસ્યા",         hi: "पासपोर्ट फोटो इंजन समस्या" } },
      { value: "tool_prime_studio", label: { en: "Prime Studio (design tool) issue",    gu: "Prime સ્ટુડિયો (ડિઝાઇન ટૂલ) સમસ્યા",  hi: "Prime स्टूडियो (डिज़ाइन टूल) समस्या" } },
    ],
  },
  {
    group: { en: "Content & Documents", gu: "કન્ટેન્ટ અને દસ્તાવેજ", hi: "कंटेंट और दस्तावेज़" },
    items: [
      { value: "document",          label: { en: "Document correction / upload",        gu: "દસ્તાવેજ સુધારો / અપલોડ",             hi: "दस्तावेज़ सुधार / अपलोड" } },
      { value: "schemes",           label: { en: "Government scheme query",             gu: "સરકારી યોજના પૂછપરછ",                 hi: "सरकारी योजना पूछताछ" } },
      { value: "live_data",         label: { en: "Live Data (Mandi/Weather/Water)",     gu: "લાઇવ ડેટા (મંડી/હવામાન/પાણી)",        hi: "लाइव डेटा (मंडी/मौसम/पानी)" } },
      { value: "youtube_pdf",       label: { en: "YouTube video / PDF library",         gu: "YouTube વિડિયો / PDF લાઇબ્રેરી",      hi: "YouTube वीडियो / PDF लाइब्रेरी" } },
    ],
  },
  {
    group: { en: "Account & Other", gu: "એકાઉન્ટ અને અન્ય", hi: "खाता और अन्य" },
    items: [
      { value: "account_login",     label: { en: "Login / signup / password issue",     gu: "લોગિન / સાઇનઅપ / પાસવર્ડ સમસ્યા",     hi: "लॉगिन / साइनअप / पासवर्ड समस्या" } },
      { value: "profile",           label: { en: "Profile update / mobile / email",     gu: "પ્રોફાઇલ અપડેટ / મોબાઇલ / ઈમેલ",       hi: "प्रोफ़ाइल अपडेट / मोबाइल / ईमेल" } },
      { value: "technical",         label: { en: "Technical issue (website / app)",     gu: "ટેક્નિકલ સમસ્યા (વેબસાઇટ / એપ)",      hi: "तकनीकी समस्या (वेबसाइट / ऐप)" } },
      { value: "feedback",          label: { en: "Feedback / suggestion",               gu: "ફીડબેક / સૂચન",                       hi: "फीडबैक / सुझाव" } },
      { value: "other",             label: { en: "Other",                               gu: "અન્ય",                                 hi: "अन्य" } },
    ],
  },
];

export default function Contact() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    category: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const { data: membershipStatus } = useGetMembershipStatus({
    query: { enabled: !!user },
  });

  const isPrime = membershipStatus?.isActive === true;
  const primeLook = useIsPrime();

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    let value = e.target.value;
    if (e.target.name === "mobile") {
      value = value.replace(/\D/g, "").slice(0, 10);
    }
    setForm((prev) => ({ ...prev, [e.target.name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast({ title: t.contact.fillRequired, variant: "destructive" });
      return;
    }
    if (!form.category) {
      toast({ title: "Please select a Query Category", variant: "destructive" });
      return;
    }
    const emailTrim = form.email.trim();
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(emailTrim)) {
      toast({ title: "Invalid email", description: "Please enter a valid email like name@example.com", variant: "destructive" });
      return;
    }
    if (/@(gmail|yahoo|hotmail|outlook|live|rediffmail|icloud|googlemail|ymail)\.(co|cm|om|con|coom|cim)$/i.test(emailTrim)) {
      toast({ title: "Email looks incomplete", description: "Did you mean .com? Please complete your email address.", variant: "destructive" });
      return;
    }
    if (form.mobile.trim() && !/^[6-9]\d{9}$/.test(form.mobile.trim())) {
      toast({ title: "Invalid mobile number", description: "Enter a 10-digit Indian mobile starting with 6, 7, 8 or 9", variant: "destructive" });
      return;
    }
    const wc = form.message.trim().split(/\s+/).filter(Boolean).length;
    if (wc < 25) {
      toast({ title: "Message too short", description: `Please write at least 25 words (current: ${wc}).`, variant: "destructive" });
      return;
    }
    if (wc > 300) {
      toast({ title: "Message too long", description: `Please keep it under 300 words (current: ${wc}).`, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/support/submit", {
        method: "POST",
        body: JSON.stringify({
          userName: form.name.trim(),
          email: form.email.trim(),
          mobile: form.mobile.trim() || null,
          category: form.category,
          message: form.message.trim(),
        }),
      });
      setForm({ name: "", email: "", mobile: "", category: "", message: "" });
      toast({
        title: t.contact.messageSent,
        description: t.contact.messageSentDesc,
      });
    } catch (err: any) {
      toast({
        title: t.contact.sendFailed,
        description: err?.message || t.contact.sendFailedDesc,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={primeLook ? "bg-gradient-to-b from-purple-50/40 via-white to-amber-50/30" : ""}>
      {primeLook && (
        <section className="relative bg-gradient-to-br from-purple-950 via-purple-900 to-amber-900 px-4 py-14 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-amber-400/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />
          <div className="container mx-auto max-w-4xl relative z-10">
            <div className="inline-flex items-center gap-2 bg-amber-400/15 border border-amber-300/30 backdrop-blur-sm text-amber-200 px-3 py-1 rounded-full text-xs font-bold mb-4">
              <Crown className="h-3.5 w-3.5" /> PRIME MEMBER SUPPORT
            </div>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg">
                <LifeBuoy className="h-6 w-6 text-purple-950" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-white" data-testid="help-title">{t.contact.title}</h1>
                <p className="text-amber-100/80 text-sm mt-1">{t.contact.subtitle}</p>
              </div>
            </div>
          </div>
        </section>
      )}

    <div className="container mx-auto px-4 py-12 max-w-4xl">
      {!primeLook && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <LifeBuoy className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold text-primary" data-testid="help-title">
              {t.contact.title}
            </h1>
          </div>
          <p className="text-muted-foreground mb-10 ml-15">{t.contact.subtitle}</p>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <Card className="border shadow-sm">
          <CardContent className="p-6 flex gap-4 items-start">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">{t.contact.email}</h3>
              <p className="text-xs text-muted-foreground mb-2">{t.contact.emailQueryDesc}</p>
              <a
                href="mailto:smitcscinfoyt@gmail.com"
                className="text-primary text-sm underline font-medium"
              >
                smitcscinfoyt@gmail.com
              </a>
            </div>
          </CardContent>
        </Card>

        {isPrime ? (
          <Card className="border border-green-200 shadow-sm bg-green-50">
            <CardContent className="p-6 flex gap-4 items-start">
              <div className="h-10 w-10 rounded-full bg-green-200 flex items-center justify-center shrink-0">
                <Phone className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{t.contact.whatsapp}</h3>
                  <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1">
                    <Crown className="h-3 w-3" /> PRIME
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{t.contact.whatsappQueryDesc}</p>
                <a href="tel:+917874080686" className="text-primary text-sm underline font-medium block">
                  +91 7874080686
                </a>
                <a
                  href="https://wa.me/917874080686"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-700 text-xs hover:underline mt-1 inline-flex items-center gap-1"
                >
                  <MessageCircle className="h-3 w-3" /> {t.contact.chatOnWhatsApp}
                </a>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border shadow-sm relative overflow-hidden">
            <CardContent className="p-6 flex gap-4 items-start">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Phone className="h-5 w-5 text-gray-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-500">{t.contact.whatsapp}</h3>
                  <Lock className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <p className="text-xs text-muted-foreground mb-3">{t.contact.whatsappPrime}</p>
                <div className="blur-sm select-none text-sm text-gray-400 mb-3">+91 XXXXXXXXXX</div>
                <Link href="/membership">
                  <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold gap-1.5">
                    <Crown className="h-3.5 w-3.5" /> {t.contact.joinPrime}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border shadow-sm">
          <CardContent className="p-6 flex gap-4 items-start">
            <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">{t.contact.timings}</h3>
              <p className="text-sm font-medium text-foreground">{t.contact.timingsValue}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-6 flex gap-4 items-start">
            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">{t.contact.missionTitle}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.contact.missionDesc}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-12">
        <h2 className="text-xl font-bold mb-5 text-primary">{t.contact.followUs}</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="https://youtube.com/@smitcscinfo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 hover:bg-red-100 transition-colors"
          >
            <Youtube className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-xs text-muted-foreground">{t.contact.youtubeLabel}</p>
              <p className="text-sm font-medium text-red-600">@smitcscinfo</p>
            </div>
          </a>
          <a
            href="https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 hover:bg-green-100 transition-colors"
          >
            <MessageCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">{t.contact.whatsappGroup}</p>
              <p className="text-sm font-medium text-green-600">{t.contact.joinGroup}</p>
            </div>
          </a>
          <a
            href="https://t.me/+PnazScJdJXI3MzVl"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 hover:bg-blue-100 transition-colors"
          >
            <Send className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">{t.contact.telegramChannel}</p>
              <p className="text-sm font-medium text-blue-500">{t.contact.joinChannel}</p>
            </div>
          </a>
          <a
            href="https://www.facebook.com/share/18S1fiF4mj/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 hover:bg-blue-100 transition-colors"
          >
            <Facebook className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs text-muted-foreground">Facebook</p>
              <p className="text-sm font-medium text-blue-600">Smit CSC Info</p>
            </div>
          </a>
          <a
            href="https://www.instagram.com/smit_csc_info?igsh=MTI3YzRzMDFqeWwxOQ=="
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-pink-50 border border-pink-200 rounded-lg px-4 py-3 hover:bg-pink-100 transition-colors"
          >
            <Instagram className="h-5 w-5 text-pink-600" />
            <div>
              <p className="text-xs text-muted-foreground">Instagram</p>
              <p className="text-sm font-medium text-pink-600">@smit_csc_info</p>
            </div>
          </a>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-5 text-primary">{t.contact.formTitle}</h2>
        <Card className="border shadow-sm">
          <CardContent className="p-6">
            <form
              onSubmit={handleSubmit}
              className="space-y-4"
              data-testid="support-form"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    {t.contact.name} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder={t.contact.namePlaceholder}
                    value={form.name}
                    onChange={handleChange}
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mobile">{t.contact.mobile}</Label>
                  <Input
                    id="mobile"
                    name="mobile"
                    type="tel"
                    inputMode="numeric"
                    pattern="[6-9][0-9]{9}"
                    maxLength={10}
                    placeholder={t.contact.mobilePlaceholder}
                    value={form.mobile}
                    onChange={handleChange}
                    data-testid="input-mobile"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">
                    {t.contact.emailLabel} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={t.contact.emailPlaceholder}
                    value={form.email}
                    onChange={handleChange}
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category">
                    {t.contact.category} <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, category: v }))}
                  >
                    <SelectTrigger id="category" data-testid="select-category">
                      <SelectValue placeholder={t.contact.categoryPlaceholder} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[60vh]">
                      {CATEGORY_GROUPS.map((g, gi) => (
                        <SelectGroup key={gi}>
                          <SelectLabel className="text-xs text-primary/80 uppercase tracking-wide">
                            {g.group[language as Lang] ?? g.group.en}
                          </SelectLabel>
                          {g.items.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label[language as Lang] ?? c.label.en}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="message">
                  {t.contact.message} <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="message"
                  name="message"
                  placeholder={t.contact.messagePlaceholder}
                  rows={5}
                  value={form.message}
                  onChange={handleChange}
                  data-testid="input-message"
                />
                {(() => {
                  const wc = form.message.trim().split(/\s+/).filter(Boolean).length;
                  const ok = wc >= 25 && wc <= 300;
                  const cls = wc === 0
                    ? "text-muted-foreground"
                    : ok
                    ? "text-green-700"
                    : "text-red-600";
                  return (
                    <div className={`text-[11px] mt-1 flex justify-between ${cls}`} data-testid="message-wordcount">
                      <span>Min 25 words, max 300 words</span>
                      <span>{wc} word{wc === 1 ? "" : "s"}</span>
                    </div>
                  );
                })()}
              </div>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={submitting}
                data-testid="btn-send-inquiry"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t.contact.sending}
                  </>
                ) : (
                  t.contact.send
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
