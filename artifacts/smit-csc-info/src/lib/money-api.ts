import { apiFetch } from "@/lib/api";

export type DmtSender = {
  id: number;
  userId: number;
  senderMobile: string;
  name: string;
  pincode: string;
  a1SenderId: string | null;
  monthlyLimitPaise: number | null;
  monthlyUsedPaise: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type DmtBeneficiary = {
  id: number;
  userId: number;
  senderId: number;
  a1BenId: string | null;
  benName: string;
  benMobile: string | null;
  accountNumber: string;
  ifsc: string;
  bankName: string | null;
  verified: number;
  createdAt: string;
  updatedAt: string;
};

export type DmtTransfer = {
  id: number;
  userId: number;
  senderId: number;
  beneficiaryId: number;
  mode: "IMPS" | "NEFT";
  amountPaise: number;
  chargePaise: number;
  commissionPaise: number;
  netCostPaise: number;
  benName: string;
  accountNumber: string;
  ifsc: string;
  status: "pending" | "processing" | "success" | "failed" | "refunded";
  a1RequestId: string;
  a1TxnId: string | null;
  a1OperatorRef: string | null;
  errorReason: string | null;
  createdAt: string;
  completedAt: string | null;
};

export interface SenderLookupResponse {
  exists: boolean;
  sender: DmtSender | null;
  beneficiaries: DmtBeneficiary[];
  providerMessage?: string;
}

export const lookupSender = (senderMobile: string) =>
  apiFetch<SenderLookupResponse>("/api/money/sender/lookup", {
    method: "POST", body: JSON.stringify({ senderMobile }),
  });

export const registerSender = (data: { senderMobile: string; name: string; pincode: string }) =>
  apiFetch<{ sender: DmtSender; providerMessage?: string }>("/api/money/sender/register", {
    method: "POST", body: JSON.stringify(data),
  });

export const listBeneficiaries = (senderId: number) =>
  apiFetch<{ items: DmtBeneficiary[] }>(`/api/money/beneficiaries?senderId=${senderId}`);

export const addBeneficiary = (data: {
  senderId: number; benName: string; benMobile?: string;
  accountNumber: string; ifsc: string; bankName?: string;
}) =>
  apiFetch<{ beneficiary: DmtBeneficiary; providerMessage?: string }>(
    "/api/money/beneficiaries",
    { method: "POST", body: JSON.stringify(data) },
  );

export const verifyBeneficiary = (id: number, otp: string) =>
  apiFetch<{ ok: boolean; providerMessage?: string }>(
    `/api/money/beneficiaries/${id}/verify`,
    { method: "POST", body: JSON.stringify({ otp }) },
  );

export const pennyDrop = (id: number) =>
  apiFetch<{ ok: boolean; status: string; message: string }>(
    `/api/money/beneficiaries/${id}/penny-drop`,
    { method: "POST" },
  );

export const transferMoney = (data: {
  beneficiaryId: number; amountPaise: number; mode: "IMPS" | "NEFT";
  idempotencyKey: string; tpin?: string;
}) =>
  apiFetch<{ transfer: DmtTransfer }>("/api/money/transfer", {
    method: "POST", body: JSON.stringify(data),
  });

export const getTransferHistory = (limit = 50) =>
  apiFetch<{ items: DmtTransfer[] }>(`/api/money/transfers?limit=${limit}`);

export const listBanks = () =>
  apiFetch<{ items: Array<{ code: string; name: string }> }>("/api/money/banks");
