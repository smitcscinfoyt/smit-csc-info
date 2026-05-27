import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Edit2, Trash2, Tag, Copy, ShieldOff } from "lucide-react";
import {
  listAdminCoupons, createAdminCoupon, updateAdminCoupon, deleteAdminCoupon,
  type AdminCoupon, type CouponInput,
} from "@/lib/checkout-api";
import { useAuth } from "@/hooks/use-auth";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string {
  return new Date(v).toISOString();
}

function addDays(localDatetimeValue: string, days: number): string {
  const d = new Date(localDatetimeValue);
  d.setDate(d.getDate() + days);
  return toLocalInputValue(d.toISOString());
}

const PLAN_OPTIONS = [
  { id: "*", label: "All plans" },
  { id: "gold", label: "Operator: Gold" },
  { id: "premium", label: "Operator: Premium" },
  { id: "monthly", label: "Prime: Monthly" },
  { id: "quarterly", label: "Prime: Quarterly" },
  { id: "yearly", label: "Prime: Yearly" },
];

interface CouponFormState {
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  applicablePlans: string[];
  maxUses: string;
  perUserLimit: string;
  minOrderRupees: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
}

function emptyForm(): CouponFormState {
  const now = new Date();
  const inThirty = new Date(Date.now() + 30 * 86400000);
  return {
    code: "",
    description: "",
    discountType: "percent",
    discountValue: "10",
    applicablePlans: ["*"],
    maxUses: "",
    perUserLimit: "1",
    minOrderRupees: "0",
    validFrom: toLocalInputValue(now.toISOString()),
    validUntil: toLocalInputValue(inThirty.toISOString()),
    isActive: true,
  };
}

export default function AdminCoupons() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [items, setItems] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCoupon | null>(null);
  const [form, setForm] = useState<CouponFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminCoupon | null>(null);

  // ── Admin-only guard ──────────────────────────────────────────────────────
  if (user && user.role !== "admin") {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center space-y-4 p-8">
          <ShieldOff className="h-14 w-14 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            Only administrators can access Coupons management.
          </p>
          <Button variant="outline" onClick={() => setLocation("/admin")}>← Back to Admin</Button>
        </div>
      </div>
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const r = await listAdminCoupons();
      setItems(r.items);
    } catch (err: any) {
      toast({ title: "Failed to load coupons", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(c: AdminCoupon) {
    setEditing(c);
    const validFrom = toLocalInputValue(c.validFrom);
    const validUntil = toLocalInputValue(c.validUntil);
    setForm({
      code: c.code,
      description: c.description ?? "",
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      applicablePlans: c.applicablePlans ? c.applicablePlans.split(",").map((s) => s.trim()).filter(Boolean) : ["*"],
      maxUses: c.maxUses == null ? "" : String(c.maxUses),
      perUserLimit: String(c.perUserLimit),
      minOrderRupees: String(Math.floor(c.minOrderPaise / 100)),
      validFrom,
      validUntil: new Date(validUntil) > new Date(validFrom) ? validUntil : addDays(validFrom, 30),
      isActive: c.isActive,
    });
    setDialogOpen(true);
  }

  function handleValidFromChange(newFrom: string) {
    const updatedUntil = new Date(form.validUntil) <= new Date(newFrom)
      ? addDays(newFrom, 30)
      : form.validUntil;
    setForm({ ...form, validFrom: newFrom, validUntil: updatedUntil });
  }

  function buildPayload(): CouponInput | null {
    const code = form.code.trim().toUpperCase();
    if (code.length < 2) { toast({ title: "Code must be at least 2 chars", variant: "destructive" }); return null; }
    const dv = parseInt(form.discountValue, 10);
    if (!Number.isFinite(dv) || dv < 1) { toast({ title: "Discount must be ≥ 1", variant: "destructive" }); return null; }
    if (form.discountType === "percent" && dv > 100) { toast({ title: "Percent cannot exceed 100", variant: "destructive" }); return null; }
    if (!form.validFrom || !form.validUntil) { toast({ title: "Validity dates required", variant: "destructive" }); return null; }
    if (new Date(form.validUntil) <= new Date(form.validFrom)) {
      toast({ title: "End must be after start", description: "Valid Until date/time must be after Valid From.", variant: "destructive" }); return null;
    }
    const plans = form.applicablePlans.length === 0 ? ["*"] : form.applicablePlans;
    return {
      code,
      description: form.description.trim() || null,
      discountType: form.discountType,
      discountValue: form.discountType === "fixed" ? dv * 100 : dv,
      applicablePlans: plans.join(","),
      maxUses: form.maxUses.trim() ? parseInt(form.maxUses, 10) : null,
      perUserLimit: parseInt(form.perUserLimit, 10) || 1,
      minOrderPaise: (parseInt(form.minOrderRupees, 10) || 0) * 100,
      validFrom: fromLocalInputValue(form.validFrom),
      validUntil: fromLocalInputValue(form.validUntil),
      isActive: form.isActive,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      if (editing) {
        await updateAdminCoupon(editing.id, payload);
        toast({ title: "Coupon updated" });
      } else {
        await createAdminCoupon(payload);
        toast({ title: "Coupon created" });
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.data?.error || err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: AdminCoupon) {
    if (!confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
    try {
      await deleteAdminCoupon(c.id);
      toast({ title: "Coupon deleted" });
      await load();
    } catch (err: any) {
      const errMsg: string = err?.data?.error || err?.message || "";
      if (errMsg.toLowerCase().includes("referenced") || errMsg.toLowerCase().includes("redemption") || errMsg.toLowerCase().includes("deactivate")) {
        setDeactivateTarget(c);
      } else {
        toast({
          title: "Delete failed",
          description: errMsg || "Try again",
          variant: "destructive",
        });
      }
    }
  }

  async function handleForceDeactivate() {
    if (!deactivateTarget) return;
    try {
      await updateAdminCoupon(deactivateTarget.id, { isActive: false });
      toast({ title: `"${deactivateTarget.code}" deactivated`, description: "Coupon is now disabled and cannot be used." });
      setDeactivateTarget(null);
      await load();
    } catch (err: any) {
      toast({ title: "Deactivate failed", description: err?.message, variant: "destructive" });
    }
  }

  async function quickToggle(c: AdminCoupon) {
    try {
      await updateAdminCoupon(c.id, { isActive: !c.isActive });
      await load();
    } catch (err: any) {
      toast({ title: "Toggle failed", description: err?.message, variant: "destructive" });
    }
  }

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50 min-h-screen">
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Tag className="h-6 w-6 text-purple-700" />
              Coupons
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create discount coupons with auto-expiry. Coupons activate and disable automatically based on validity dates.
            </p>
          </div>
          <Button onClick={openCreate} data-testid="btn-create-coupon">
            <Plus className="h-4 w-4 mr-2" />New Coupon
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Coupons</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-purple-700" /></div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No coupons yet. Create one to start running offers.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr className="text-left">
                      <th className="p-2">Code</th>
                      <th className="p-2">Discount</th>
                      <th className="p-2">Plans</th>
                      <th className="p-2">Validity</th>
                      <th className="p-2">Used</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.id} className="border-t" data-testid={`coupon-row-${c.id}`}>
                        <td className="p-2">
                          <div className="font-mono font-bold flex items-center gap-2">
                            {c.code}
                            <button
                              onClick={() => { navigator.clipboard.writeText(c.code); toast({ title: "Copied" }); }}
                              className="text-gray-400 hover:text-gray-700"
                              title="Copy"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                        </td>
                        <td className="p-2">
                          {c.discountType === "percent"
                            ? <span className="font-semibold">{c.discountValue}% off</span>
                            : <span className="font-semibold">{formatINR(c.discountValue)} off</span>}
                          {c.minOrderPaise > 0 && (
                            <div className="text-xs text-muted-foreground">Min order {formatINR(c.minOrderPaise)}</div>
                          )}
                        </td>
                        <td className="p-2 text-xs">
                          {c.applicablePlans.split(",").map((p) => {
                            const opt = PLAN_OPTIONS.find((o) => o.id === p.trim());
                            return (
                              <Badge key={p} variant="outline" className="mr-1 mb-1">
                                {opt?.label ?? p}
                              </Badge>
                            );
                          })}
                        </td>
                        <td className="p-2 text-xs whitespace-nowrap">
                          <div>From: {new Date(c.validFrom).toLocaleString()}</div>
                          <div>Until: {new Date(c.validUntil).toLocaleString()}</div>
                        </td>
                        <td className="p-2">
                          {c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}
                          <div className="text-xs text-muted-foreground">Per user: {c.perUserLimit}</div>
                        </td>
                        <td className="p-2">
                          {c.isLive ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Live</Badge>
                          ) : !c.isActive ? (
                            <Badge variant="outline" className="bg-gray-100 text-gray-700">Disabled</Badge>
                          ) : new Date() < new Date(c.validFrom) ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">Scheduled</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">Expired</Badge>
                          )}
                          <div className="mt-1">
                            <Switch
                              checked={c.isActive}
                              onCheckedChange={() => quickToggle(c)}
                              data-testid={`switch-active-${c.id}`}
                            />
                          </div>
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(c)} data-testid={`btn-edit-${c.id}`}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(c)} data-testid={`btn-delete-${c.id}`}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coupon create/edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.code}` : "New Coupon"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. WELCOME50"
                  className="uppercase font-mono"
                  data-testid="form-coupon-code"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Diwali festive offer"
                  data-testid="form-coupon-desc"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Discount Type</Label>
                  <Select value={form.discountType} onValueChange={(v) => setForm({ ...form, discountType: v as any })}>
                    <SelectTrigger data-testid="form-coupon-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{form.discountType === "percent" ? "Percent Off (1-100)" : "Amount Off (₹)"}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={form.discountType === "percent" ? 100 : 1000000}
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    data-testid="form-coupon-value"
                  />
                </div>
              </div>
              <div>
                <Label>Applicable Plans</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PLAN_OPTIONS.map((p) => {
                    const checked = form.applicablePlans.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (p.id === "*") {
                            setForm({ ...form, applicablePlans: ["*"] });
                          } else {
                            const without = form.applicablePlans.filter((x) => x !== "*" && x !== p.id);
                            setForm({ ...form, applicablePlans: checked ? without : [...without, p.id] });
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                          checked
                            ? "bg-purple-700 text-white border-purple-700"
                            : "bg-white text-gray-700 border-gray-300 hover:border-purple-400"
                        }`}
                        data-testid={`form-plan-${p.id}`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label>Max Uses (total)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={form.maxUses}
                    onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    placeholder="Unlimited"
                    data-testid="form-max-uses"
                  />
                </div>
                <div>
                  <Label>Per-User Limit</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={form.perUserLimit}
                    onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
                    data-testid="form-per-user"
                  />
                </div>
                <div>
                  <Label>Min Order (₹)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.minOrderRupees}
                    onChange={(e) => setForm({ ...form, minOrderRupees: e.target.value })}
                    data-testid="form-min-order"
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Valid From</Label>
                  <Input
                    type="datetime-local"
                    value={form.validFrom}
                    onChange={(e) => handleValidFromChange(e.target.value)}
                    data-testid="form-valid-from"
                  />
                </div>
                <div>
                  <Label>Valid Until</Label>
                  <Input
                    type="datetime-local"
                    value={form.validUntil}
                    min={form.validFrom}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    data-testid="form-valid-until"
                  />
                  {form.validUntil && form.validFrom && new Date(form.validUntil) <= new Date(form.validFrom) && (
                    <p className="text-xs text-red-600 mt-1">Valid Until must be after Valid From</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                  data-testid="form-is-active"
                />
                <Label>Active (auto-disable when expired)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} data-testid="btn-save-coupon">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deactivate-instead dialog when delete is blocked by existing payments */}
        <Dialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cannot Delete Coupon</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-mono font-bold text-gray-900">{deactivateTarget?.code}</span> coupon is referenced by existing payments and cannot be deleted (to preserve payment history).
              </p>
              <p className="text-sm text-muted-foreground">
                Would you like to <strong>deactivate</strong> it instead? Deactivated coupons cannot be used by anyone.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleForceDeactivate}>
                Deactivate Coupon
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
