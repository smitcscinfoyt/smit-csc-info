import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Send, UserPlus, ShieldCheck, Loader2, Search, AlertCircle,
  CheckCircle2, XCircle, Banknote, ArrowRight, ChevronsUpDown, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  lookupSender, registerSender, addBeneficiary, verifyBeneficiary,
  pennyDrop, transferMoney, getTransferHistory, listBanks,
  type DmtSender, type DmtBeneficiary,
} from "@/lib/money-api";
import { formatINR, getWallet, getTpinStatus } from "@/lib/recharge-api";
import { TpinDialog } from "@/components/recharge/tpin-dialog";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";
import { loadDraft, clearDraft } from "@/lib/draft-store";

type TabKey = "transfer" | "register" | "add_ben" | "verify_ben" | "search_ben";

const TABS: Array<{ key: TabKey; label: string; icon: any }> = [
  { key: "transfer",   label: "Money Transfer",       icon: Send },
  { key: "register",   label: "Sender Registration",  icon: UserPlus },
  { key: "add_ben",    label: "Add Beneficiary",      icon: UserPlus },
  { key: "verify_ben", label: "Verify Beneficiary",   icon: ShieldCheck },
  { key: "search_ben", label: "Search Beneficiary",   icon: Search },
];

export default function MoneyTransferHub() {
  const [tab, setTab] = useState<TabKey>("transfer");

  return (
    <div className="space-y-4">
      <Card className="shadow-md border-2 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 text-white px-5 py-4 flex items-center gap-2">
          <Send className="h-5 w-5" />
          <div className="font-bold text-sm sm:text-base uppercase tracking-wide">
            Domestic Money Transfer (DMT)
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="border-b bg-gray-50 overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  data-testid={`tab-dmt-${t.key}`}
                  className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors ${
                    active
                      ? "border-purple-600 text-purple-700 bg-white"
                      : "border-transparent text-gray-600 hover:text-purple-600 hover:bg-white/60"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <CardContent className="pt-5">
          {tab === "transfer"   && <TabMoneyTransfer />}
          {tab === "register"   && <TabSenderRegistration />}
          {tab === "add_ben"    && <TabAddBeneficiary />}
          {tab === "verify_ben" && <TabVerifyBeneficiary />}
          {tab === "search_ben" && <TabSearchBeneficiary />}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Shared: sender lookup hook — fetches sender + beneficiaries
// ════════════════════════════════════════════════════════════════════════════
function useSenderLookup() {
  const { toast } = useToast();
  const [senderMobile, setSenderMobile] = useState("");
  const [sender, setSender] = useState<DmtSender | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<DmtBeneficiary[]>([]);
  const [notRegistered, setNotRegistered] = useState(false);

  // Guard against state updates after unmount when user switches tabs
  // mid-flight on the sender-lookup mutation.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const m = useMutation({
    mutationFn: () => lookupSender(senderMobile),
    onSuccess: (r) => {
      if (!mountedRef.current) return;
      if (r.exists && r.sender) {
        setSender(r.sender);
        setBeneficiaries(r.beneficiaries);
        setNotRegistered(false);
      } else {
        setSender(null);
        setBeneficiaries([]);
        setNotRegistered(true);
      }
    },
    onError: (e: any) => {
      if (!mountedRef.current) return;
      toast({ variant: "destructive", title: "Lookup failed",
        description: e?.data?.error ?? e?.message });
    },
  });

  const lookup = () => {
    if (!/^[6-9]\d{9}$/.test(senderMobile)) {
      toast({ variant: "destructive", title: "Enter a valid 10-digit mobile" });
      return;
    }
    m.mutate();
  };

  const reset = () => {
    setSender(null);
    setBeneficiaries([]);
    setNotRegistered(false);
    setSenderMobile("");
  };

  return {
    senderMobile, setSenderMobile,
    sender, setSender, beneficiaries, setBeneficiaries,
    notRegistered, lookup, reset,
    isPending: m.isPending,
  };
}

function SenderMobileField({
  value, onChange, onLookup, isPending, label = "Sender Mobile Number",
}: {
  value: string; onChange: (v: string) => void; onLookup: () => void;
  isPending: boolean; label?: string;
}) {
  return (
    <div>
      <Label>{label} <span className="text-red-500">*</span></Label>
      <div className="flex gap-2 mt-1">
        <Input
          inputMode="numeric"
          maxLength={10}
          placeholder="10-digit registered sender mobile"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          data-testid="input-sender-mobile"
        />
        <Button onClick={onLookup} disabled={isPending} data-testid="btn-lookup-sender">
          {isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><Search className="h-4 w-4 mr-1" />Continue</>}
        </Button>
      </div>
    </div>
  );
}

function SenderInfoBanner({ sender, onChange }: { sender: DmtSender; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded">
      <div>
        <div className="font-bold">{sender.name}</div>
        <div className="text-sm text-muted-foreground">+91 {sender.senderMobile}</div>
        {sender.monthlyLimitPaise != null && (
          <div className="text-xs mt-1">
            Monthly limit: <span className="font-semibold">{formatINR(sender.monthlyLimitPaise)}</span>
            {sender.monthlyUsedPaise != null && (
              <> · Used: <span className="font-semibold">{formatINR(sender.monthlyUsedPaise)}</span></>
            )}
          </div>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onChange} data-testid="btn-change-sender">
        Change Sender
      </Button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1: MONEY TRANSFER
// ════════════════════════════════════════════════════════════════════════════
function TabMoneyTransfer() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const ls = useSenderLookup();
  const walletQ = useQuery({ queryKey: ["wallet"], queryFn: getWallet });
  const tpinQ = useQuery({ queryKey: ["tpin", "status"], queryFn: getTpinStatus });
  const historyQ = useQuery({ queryKey: ["dmt", "history"], queryFn: () => getTransferHistory(10) });

  const [benId, setBenId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"IMPS" | "NEFT">("IMPS");
  const [showTpin, setShowTpin] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `dmt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  );

  const beneficiary = ls.beneficiaries.find((b) => String(b.id) === benId);
  const numAmount = parseFloat(amount) || 0;
  const amountPaise = Math.round(numAmount * 100);
  const chargePaise = Math.min(2500, Math.max(500, Math.round(amountPaise * 0.01)));
  const totalPaise = amountPaise + chargePaise;
  const walletBal = walletQ.data?.balance ?? 0;
  const insufficient = totalPaise > walletBal;
  const requiresTpin = totalPaise >= 50000;
  const tpinSet = !!tpinQ.data?.hasPin;

  const transferM = useMutation({
    mutationFn: (tpin?: string) => transferMoney({
      beneficiaryId: beneficiary!.id,
      amountPaise, mode, idempotencyKey, tpin,
    }),
    onSuccess: (r) => {
      const t = r.transfer;
      const friendly = t.status === "success"
        ? "Transfer successful"
        : t.status === "refunded" ? "Transfer failed — refunded"
        : "Transfer is being processed";
      toast({
        title: friendly,
        description: t.errorReason ?? `${t.mode} ${formatINR(t.amountPaise)} → ${t.benName}`,
      });
      setAmount("");
      setIdempotencyKey(`dmt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["dmt", "history"] });
      setShowTpin(false);
    },
    onError: (e: any) => {
      // Backend may require T-PIN even if UI heuristic didn't trigger it.
      const code = e?.data?.code ?? e?.data?.error;
      if (code === "TPIN_REQUIRED" && tpinSet) {
        setShowTpin(true);
        return;
      }
      setShowTpin(false);
      toast({ variant: "destructive", title: "Transfer failed",
        description: e?.data?.error ?? e?.message });
    },
  });

  const submit = () => {
    if (!beneficiary) { toast({ variant: "destructive", title: "Select a beneficiary" }); return; }
    if (numAmount < 10) { toast({ variant: "destructive", title: "Minimum ₹10" }); return; }
    if (numAmount > 25000) { toast({ variant: "destructive", title: "Maximum ₹25,000 per transaction" }); return; }
    if (insufficient) { toast({ variant: "destructive", title: "Insufficient wallet balance" }); return; }
    if (requiresTpin) {
      if (!tpinSet) { toast({ variant: "destructive", title: "T-PIN required for ≥ ₹500" }); return; }
      setShowTpin(true);
    } else {
      transferM.mutate(undefined);
    }
  };

  return (
    <div className="space-y-4">
      {!ls.sender ? (
        <>
          <SenderMobileField
            value={ls.senderMobile} onChange={ls.setSenderMobile}
            onLookup={ls.lookup} isPending={ls.isPending}
          />
          {ls.notRegistered && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Sender not registered. Please go to <strong>Sender Registration</strong> tab to register first.
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : (
        <>
          <SenderInfoBanner sender={ls.sender} onChange={ls.reset} />

          <div>
            <Label>Beneficiary ID <span className="text-red-500">*</span></Label>
            <Select value={benId} onValueChange={setBenId}>
              <SelectTrigger data-testid="select-beneficiary"><SelectValue placeholder="Select beneficiary" /></SelectTrigger>
              <SelectContent>
                {ls.beneficiaries.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    No beneficiaries. Add one from the "Add Beneficiary" tab.
                  </div>
                ) : (
                  ls.beneficiaries.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.benName} — A/C {b.accountNumber} ({b.ifsc})
                      {b.verified ? " ✓" : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Transfer Mode <span className="text-red-500">*</span></Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "IMPS" | "NEFT")}>
              <SelectTrigger data-testid="select-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IMPS">IMPS — Instant (24x7)</SelectItem>
                <SelectItem value="NEFT">NEFT — Bank hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Amount (₹) <span className="text-red-500">*</span></Label>
            <Input type="number" inputMode="numeric" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Min ₹10 · Max ₹25,000"
              data-testid="input-transfer-amount" />
          </div>

          {amountPaise > 0 && beneficiary && (
            <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Transfer Amount</span><span>{formatINR(amountPaise)}</span></div>
              <div className="flex justify-between"><span>Charge (1%, min ₹5, max ₹25)</span><span>{formatINR(chargePaise)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Total Debit</span><span>{formatINR(totalPaise)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>Wallet Balance</span><span>{formatINR(walletBal)}</span></div>
              {insufficient && <div className="text-red-600 text-xs">Insufficient balance</div>}
            </div>
          )}

          <Button
            onClick={submit}
            disabled={transferM.isPending || !beneficiary || amountPaise <= 0}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
            data-testid="btn-submit-transfer"
          >
            {transferM.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Send className="h-4 w-4 mr-2" />}
            Transfer Money
          </Button>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Wallet: <strong>{formatINR(walletBal)}</strong> · Charge: 1% (min ₹5, max ₹25) · Per-txn limit ₹25,000.
            </AlertDescription>
          </Alert>
        </>
      )}

      {/* Recent transfers */}
      <div>
        <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
          <Banknote className="h-4 w-4" />Recent Transfers
        </h3>
        {historyQ.isLoading ? (
          <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : (historyQ.data?.items ?? []).length === 0 ? (
          <div className="text-center py-3 text-xs text-muted-foreground border rounded">No transfers yet</div>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase">
                <tr>
                  <th className="p-2">Beneficiary</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {historyQ.data!.items.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{t.benName}</div>
                      <div className="text-xs text-muted-foreground">{t.accountNumber} · {t.ifsc}</div>
                    </td>
                    <td className="p-2">{t.mode}</td>
                    <td className="p-2 text-right">{formatINR(t.amountPaise)}</td>
                    <td className="p-2"><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showTpin && (
        <TpinDialog
          open={showTpin}
          onOpenChange={setShowTpin}
          onSubmit={(pin: string) => transferM.mutate(pin)}
          amount={totalPaise}
          loading={transferM.isPending}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2: SENDER REGISTRATION
// ════════════════════════════════════════════════════════════════════════════
function TabSenderRegistration() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [pincode, setPincode] = useState("");
  const [senderMobile, setSenderMobile] = useState("");
  const [registered, setRegistered] = useState<DmtSender | null>(null);

  // Draft autosave — restore on mount, persist on change.
  useEffect(() => {
    const d = loadDraft<{ name: string; pincode: string; senderMobile: string }>("dmt:sender-reg");
    if (d) {
      if (d.name) setName(d.name);
      if (d.pincode) setPincode(d.pincode);
      if (d.senderMobile) setSenderMobile(d.senderMobile);
    }
  }, []);
  useDraftAutosave("dmt:sender-reg", { name, pincode, senderMobile });

  const m = useMutation({
    mutationFn: () => registerSender({ senderMobile, name: name.trim(), pincode }),
    onSuccess: (r) => {
      toast({ title: "Sender registered successfully", description: r.providerMessage ?? "" });
      setRegistered(r.sender);
      setName(""); setPincode(""); setSenderMobile("");
      clearDraft("dmt:sender-reg");
    },
    onError: (e: any) => {
      const data = e?.data ?? {};
      const main = data.error ?? e?.message ?? "Registration failed";
      const isSilent = data.code === "SENDER_REGISTRATION_NOT_ACCEPTED";
      toast({
        variant: "destructive",
        title: isSilent ? "Registration not accepted by provider" : "Registration failed",
        description: main,
      });
      // eslint-disable-next-line no-console
      console.error("[Sender Registration] failed:", data);
    },
  });

  const submit = () => {
    if (name.trim().length < 2) { toast({ variant: "destructive", title: "Enter sender name" }); return; }
    if (!/^\d{6}$/.test(pincode)) { toast({ variant: "destructive", title: "Enter a valid 6-digit pincode" }); return; }
    if (!/^[6-9]\d{9}$/.test(senderMobile)) { toast({ variant: "destructive", title: "Enter a valid 10-digit mobile" }); return; }
    m.mutate();
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Sender Name <span className="text-red-500">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Full name as per Aadhaar"
          data-testid="input-sender-name" />
      </div>

      <div>
        <Label>Postal Pin Code <span className="text-red-500">*</span></Label>
        <Input value={pincode} maxLength={6} inputMode="numeric"
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
          placeholder="6-digit pincode of sender's address"
          data-testid="input-sender-pincode" />
      </div>

      <div>
        <Label>Mobile Number <span className="text-red-500">*</span></Label>
        <Input value={senderMobile} maxLength={10} inputMode="numeric"
          onChange={(e) => setSenderMobile(e.target.value.replace(/\D/g, ""))}
          placeholder="10-digit mobile of sender"
          data-testid="input-register-mobile" />
      </div>

      <Button onClick={submit} disabled={m.isPending}
        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
        data-testid="btn-register-sender">
        {m.isPending
          ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
          : <UserPlus className="h-4 w-4 mr-2" />}
        Register Sender
      </Button>

      {registered && (
        <Alert className="border-green-300 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-xs">
            <strong>{registered.name}</strong> (+91 {registered.senderMobile}) registered successfully.
            {registered.a1SenderId && <> Sender ID: <code>{registered.a1SenderId}</code></>}
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          The sender mobile must be in the sender's own name. Maximum monthly transfer limit per sender: ₹25,000 (KYC) / ₹50,000 (full-KYC).
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 3: ADD BENEFICIARY
// ════════════════════════════════════════════════════════════════════════════
function TabAddBeneficiary() {
  const { toast } = useToast();
  const ls = useSenderLookup();
  const [benName, setBenName] = useState("");
  const [benMobile, setBenMobile] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [added, setAdded] = useState<DmtBeneficiary | null>(null);

  // Draft autosave — beneficiary entry is long (5 fields incl. IFSC) and
  // mobile users frequently switch tabs to verify the IFSC, losing state.
  useEffect(() => {
    const d = loadDraft<{ benName: string; benMobile: string; account: string; ifsc: string; bankName: string }>("dmt:add-ben");
    if (d) {
      if (d.benName) setBenName(d.benName);
      if (d.benMobile) setBenMobile(d.benMobile);
      if (d.account) setAccount(d.account);
      if (d.ifsc) setIfsc(d.ifsc);
      if (d.bankName) setBankName(d.bankName);
    }
  }, []);
  useDraftAutosave("dmt:add-ben", { benName, benMobile, account, ifsc, bankName });

  const banksQ = useQuery({ queryKey: ["dmt", "banks"], queryFn: listBanks, enabled: !!ls.sender });

  const m = useMutation({
    mutationFn: () => addBeneficiary({
      senderId: ls.sender!.id,
      benName: benName.trim(),
      benMobile: benMobile || undefined,
      accountNumber: account,
      ifsc: ifsc.toUpperCase(),
      bankName: bankName || undefined,
    }),
    onSuccess: (r) => {
      toast({ title: "Beneficiary added", description: r.providerMessage ?? "" });
      setAdded(r.beneficiary);
      // Merge into shared list so other tabs see it immediately
      ls.setBeneficiaries((prev) => [r.beneficiary, ...prev]);
      setBenName(""); setBenMobile(""); setAccount(""); setIfsc(""); setBankName("");
      clearDraft("dmt:add-ben");
    },
    onError: (e: any) => {
      const data = e?.data ?? {};
      const main = data.error ?? e?.message ?? "Add beneficiary failed";

      // Special-case: provider doesn't have this sender registered yet.
      if (data.code === "SENDER_NOT_REGISTERED_AT_PROVIDER") {
        toast({
          variant: "destructive",
          title: "Sender not registered",
          description: "This mobile is not yet registered with the money-transfer provider. Please open the Sender Registration tab and complete registration first.",
        });
        // Reset local sender selection so the user re-enters via lookup or registers fresh.
        ls.reset();
        return;
      }

      const extra: string[] = [];
      if (data.providerMessage && data.providerMessage !== main) extra.push(`Provider: ${data.providerMessage}`);
      if (data.providerStatus !== undefined && data.providerStatus !== null && data.providerStatus !== "") extra.push(`Status code: ${data.providerStatus}`);
      if (data.raw && extra.length === 0) {
        try { extra.push(`Raw: ${JSON.stringify(data.raw).slice(0, 220)}`); } catch { /* ignore */ }
      }
      toast({
        variant: "destructive",
        title: "Add failed",
        description: extra.length ? `${main}\n${extra.join(" · ")}` : main,
      });
      // eslint-disable-next-line no-console
      console.error("[Add Beneficiary] failed:", data);
    },
  });

  const submit = () => {
    if (benName.trim().length < 2) { toast({ variant: "destructive", title: "Enter beneficiary name" }); return; }
    if (!/^\d{6,18}$/.test(account)) { toast({ variant: "destructive", title: "Enter a valid account number" }); return; }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) { toast({ variant: "destructive", title: "Enter a valid IFSC" }); return; }
    if (benMobile && !/^[6-9]\d{9}$/.test(benMobile)) { toast({ variant: "destructive", title: "Invalid mobile (or leave empty)" }); return; }
    m.mutate();
  };

  return (
    <div className="space-y-4">
      {!ls.sender ? (
        <>
          <SenderMobileField
            value={ls.senderMobile} onChange={ls.setSenderMobile}
            onLookup={ls.lookup} isPending={ls.isPending}
          />
          {ls.notRegistered && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Sender not registered. Please use <strong>Sender Registration</strong> tab first.
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : (
        <>
          <SenderInfoBanner sender={ls.sender} onChange={ls.reset} />

          <div>
            <Label>Beneficiary Name <span className="text-red-500">*</span></Label>
            <Input value={benName} onChange={(e) => setBenName(e.target.value)}
              placeholder="As per bank record"
              data-testid="input-ben-name" />
          </div>

          <div>
            <Label>Beneficiary Mobile (optional)</Label>
            <Input value={benMobile} maxLength={10} inputMode="numeric"
              onChange={(e) => setBenMobile(e.target.value.replace(/\D/g, ""))}
              placeholder="10-digit mobile"
              data-testid="input-ben-mobile" />
          </div>

          <div>
            <Label>Bank (optional)</Label>
            <BankCombobox
              banks={banksQ.data?.items ?? []}
              value={bankName}
              onChange={setBankName}
              loading={banksQ.isLoading}
            />
          </div>

          <div>
            <Label>Bank Account Number <span className="text-red-500">*</span></Label>
            <Input value={account} inputMode="numeric"
              onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))}
              placeholder="6-18 digit account number"
              data-testid="input-ben-account" />
          </div>

          <div>
            <Label>IFSC Code <span className="text-red-500">*</span></Label>
            <Input value={ifsc} maxLength={11}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="e.g. SBIN0001234"
              data-testid="input-ben-ifsc" />
          </div>

          <Button onClick={submit} disabled={m.isPending}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
            data-testid="btn-add-beneficiary-submit">
            {m.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <UserPlus className="h-4 w-4 mr-2" />}
            Add Beneficiary
          </Button>

          {added && (
            <Alert className="border-green-300 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-xs">
                <strong>{added.benName}</strong> added. Beneficiary ID: <code>{added.id}</code>
                {added.a1BenId && <> · Provider Ref: <code>{added.a1BenId}</code></>}
                <br />Now go to <strong>Verify Beneficiary</strong> tab to complete OTP verification.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 4: VERIFY BENEFICIARY (OTP)
// ════════════════════════════════════════════════════════════════════════════
function TabVerifyBeneficiary() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const ls = useSenderLookup();
  const [benId, setBenId] = useState<string>("");
  const [otp, setOtp] = useState("");

  const beneficiary = ls.beneficiaries.find((b) => String(b.id) === benId);

  const verifyM = useMutation({
    mutationFn: () => verifyBeneficiary(Number(benId), otp),
    onSuccess: (r) => {
      toast({
        title: r.ok ? "Beneficiary verified" : "Verification result",
        description: r.providerMessage ?? "",
        variant: r.ok ? "default" : "destructive",
      });
      if (r.ok) {
        // refresh local list
        ls.setBeneficiaries((prev) => prev.map((b) =>
          b.id === Number(benId) ? { ...b, verified: 1 } : b,
        ));
        setOtp("");
        qc.invalidateQueries({ queryKey: ["dmt"] });
      }
    },
    onError: (e: any) => toast({
      variant: "destructive", title: "Verify failed",
      description: e?.data?.error ?? e?.message,
    }),
  });

  const pennyM = useMutation({
    mutationFn: () => pennyDrop(Number(benId)),
    onSuccess: (r) => toast({
      title: r.ok ? "Penny-drop verified" : "Penny-drop result",
      description: r.message,
      variant: r.ok ? "default" : "destructive",
    }),
    onError: (e: any) => toast({
      variant: "destructive", title: "Penny-drop failed",
      description: e?.data?.error ?? e?.message,
    }),
  });

  const submit = () => {
    if (!benId) { toast({ variant: "destructive", title: "Select a beneficiary" }); return; }
    if (!/^\d{4,8}$/.test(otp)) { toast({ variant: "destructive", title: "Enter a valid OTP" }); return; }
    verifyM.mutate();
  };

  return (
    <div className="space-y-4">
      {!ls.sender ? (
        <>
          <SenderMobileField
            value={ls.senderMobile} onChange={ls.setSenderMobile}
            onLookup={ls.lookup} isPending={ls.isPending}
          />
          {ls.notRegistered && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Sender not registered.
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : (
        <>
          <SenderInfoBanner sender={ls.sender} onChange={ls.reset} />

          <div>
            <Label>Beneficiary ID <span className="text-red-500">*</span></Label>
            <Select value={benId} onValueChange={setBenId}>
              <SelectTrigger data-testid="select-verify-ben"><SelectValue placeholder="Select beneficiary to verify" /></SelectTrigger>
              <SelectContent>
                {ls.beneficiaries.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    No beneficiaries.
                  </div>
                ) : (
                  ls.beneficiaries.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      #{b.id} · {b.benName} · A/C {b.accountNumber}
                      {b.verified ? " (verified)" : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {beneficiary && (
            <div className="p-3 bg-gray-50 border rounded text-sm">
              <div><strong>Name:</strong> {beneficiary.benName}</div>
              <div><strong>A/C:</strong> {beneficiary.accountNumber}</div>
              <div><strong>IFSC:</strong> {beneficiary.ifsc}</div>
              {beneficiary.bankName && <div><strong>Bank:</strong> {beneficiary.bankName}</div>}
            </div>
          )}

          <div>
            <Label>OTP <span className="text-red-500">*</span></Label>
            <Input value={otp} maxLength={8} inputMode="numeric"
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="OTP received on sender's mobile"
              data-testid="input-verify-otp" />
            <p className="text-xs text-muted-foreground mt-1">
              OTP is sent to the sender's mobile when you add a beneficiary.
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={submit} disabled={verifyM.isPending || !benId}
              className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
              data-testid="btn-verify-submit">
              {verifyM.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <ShieldCheck className="h-4 w-4 mr-2" />}
              Verify with OTP
            </Button>
            <Button variant="outline" onClick={() => pennyM.mutate()}
              disabled={!benId || pennyM.isPending}
              data-testid="btn-penny-drop">
              {pennyM.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <Banknote className="h-4 w-4 mr-2" />}
              Penny Drop
            </Button>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Penny-drop deposits ₹1 to validate the account holder name. Charge: ₹2 per check.
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 5: SEARCH BENEFICIARY
// ════════════════════════════════════════════════════════════════════════════
function TabSearchBeneficiary() {
  const ls = useSenderLookup();

  return (
    <div className="space-y-4">
      {!ls.sender && !ls.notRegistered && (
        <SenderMobileField
          value={ls.senderMobile} onChange={ls.setSenderMobile}
          onLookup={ls.lookup} isPending={ls.isPending}
        />
      )}

      {ls.notRegistered && (
        <>
          <SenderMobileField
            value={ls.senderMobile} onChange={ls.setSenderMobile}
            onLookup={ls.lookup} isPending={ls.isPending}
          />
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Sender <strong>+91 {ls.senderMobile}</strong> is not registered with us.
            </AlertDescription>
          </Alert>
        </>
      )}

      {ls.sender && (
        <>
          <SenderInfoBanner sender={ls.sender} onChange={ls.reset} />

          <div>
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Search className="h-4 w-4" />
              Beneficiaries ({ls.beneficiaries.length})
            </h3>
            {ls.beneficiaries.length === 0 ? (
              <div className="border rounded p-6 text-center text-sm text-muted-foreground">
                No beneficiaries found for this sender. Add one from the "Add Beneficiary" tab.
              </div>
            ) : (
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase">
                    <tr>
                      <th className="p-2">ID</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Account</th>
                      <th className="p-2">IFSC</th>
                      <th className="p-2">Bank</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ls.beneficiaries.map((b) => (
                      <tr key={b.id} className="border-t" data-testid={`row-ben-${b.id}`}>
                        <td className="p-2 font-mono text-xs">#{b.id}</td>
                        <td className="p-2 font-medium">{b.benName}</td>
                        <td className="p-2 font-mono text-xs">{b.accountNumber}</td>
                        <td className="p-2 font-mono text-xs">{b.ifsc}</td>
                        <td className="p-2 text-xs">{b.bankName ?? "—"}</td>
                        <td className="p-2">
                          {b.verified ? (
                            <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">
                              <ShieldCheck className="h-3 w-3 mr-1" />Verified
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Unverified</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs flex items-center gap-1">
              To send money, switch to <strong>Money Transfer</strong> tab. <ArrowRight className="h-3 w-3" />
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Searchable bank combobox (NPCI IMPS member list, ~150 banks)
// ════════════════════════════════════════════════════════════════════════════
function BankCombobox({
  banks, value, onChange, loading,
}: {
  banks: Array<{ code: string; name: string }>;
  value: string;
  onChange: (v: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = banks.find((b) => b.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          data-testid="select-ben-bank"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {loading
              ? "Loading banks..."
              : selected ? selected.name
              : `Choose bank (${banks.length} available)`}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search bank by name or code..."
            data-testid="input-bank-search"
          />
          <CommandList className="max-h-72">
            <CommandEmpty>No bank found.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => { onChange(""); setOpen(false); }}
                  className="text-muted-foreground italic"
                >
                  Clear selection
                </CommandItem>
              )}
              {banks.map((b) => (
                <CommandItem
                  key={b.code}
                  value={`${b.name} ${b.code}`}
                  onSelect={() => { onChange(b.name); setOpen(false); }}
                  data-testid={`bank-option-${b.code}`}
                >
                  <Check className={cn("h-4 w-4 mr-2",
                    value === b.name ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{b.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono ml-2">
                    {b.code}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: any }> = {
    success:    { cls: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle2 },
    processing: { cls: "bg-blue-100 text-blue-700 border-blue-300",    icon: Loader2 },
    pending:    { cls: "bg-amber-100 text-amber-700 border-amber-300", icon: Loader2 },
    failed:     { cls: "bg-red-100 text-red-700 border-red-300",       icon: XCircle },
    refunded:   { cls: "bg-gray-100 text-gray-700 border-gray-300",    icon: XCircle },
  };
  const m = map[status] ?? map.pending;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`${m.cls} text-[10px]`}>
      <Icon className="h-3 w-3 mr-1" />{status}
    </Badge>
  );
}
