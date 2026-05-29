import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (pin: string) => void | Promise<void>;
  amount?: number;
  loading?: boolean;
}

export function TpinDialog({ open, onOpenChange, onSubmit, amount, loading }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!/^\d{4,6}$/.test(pin)) {
      setError("T-PIN must be 4 to 6 digits");
      return;
    }
    await onSubmit(pin);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) { onOpenChange(v); if (!v) setPin(""); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" />Enter T-PIN</DialogTitle>
          <DialogDescription>
            {amount ? `T-PIN required for transaction of Rs.${(amount / 100).toFixed(2)}.` : "Enter your 4-6 digit T-PIN to confirm the transaction."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="tpin">T-PIN</Label>
          <Input
            id="tpin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="****"
            autoFocus
            data-testid="input-tpin"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || pin.length < 4} data-testid="btn-tpin-submit">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
