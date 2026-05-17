import { pgTable, serial, integer, varchar, timestamp, bigint, text, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { walletsTable } from "./wallets";

// ─── DMT Senders (remitters registered with A1Topup) ─────────────────────────
export const dmtSendersTable = pgTable(
  "dmt_senders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    senderMobile: varchar("sender_mobile", { length: 15 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    pincode: varchar("pincode", { length: 10 }).notNull(),
    a1SenderId: varchar("a1_sender_id", { length: 80 }),
    monthlyLimitPaise: bigint("monthly_limit_paise", { mode: "number" }),
    monthlyUsedPaise: bigint("monthly_used_paise", { mode: "number" }).default(0),
    status: varchar("status", { length: 30 }).notNull().default("registered"), // registered | pending_kyc | suspended
    rawResponse: jsonb("raw_response"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    userMobileUq: uniqueIndex("dmt_senders_user_mobile_uq").on(t.userId, t.senderMobile),
  }),
);

// ─── DMT Beneficiaries (account-holders to whom money is sent) ───────────────
export const dmtBeneficiariesTable = pgTable(
  "dmt_beneficiaries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    senderId: integer("sender_id").notNull().references(() => dmtSendersTable.id),
    a1BenId: varchar("a1_ben_id", { length: 80 }),
    benName: varchar("ben_name", { length: 200 }).notNull(),
    benMobile: varchar("ben_mobile", { length: 15 }),
    accountNumber: varchar("account_number", { length: 30 }).notNull(),
    ifsc: varchar("ifsc", { length: 15 }).notNull(),
    bankName: varchar("bank_name", { length: 200 }),
    verified: integer("verified").notNull().default(0), // 0/1
    rawResponse: jsonb("raw_response"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    senderAccountUq: uniqueIndex("dmt_beneficiaries_sender_account_uq").on(t.senderId, t.accountNumber, t.ifsc),
    senderIdx: index("dmt_beneficiaries_sender_idx").on(t.senderId),
  }),
);

// ─── DMT Transfers (the actual money-transfer transactions) ──────────────────
export const dmtTransfersTable = pgTable(
  "dmt_transfers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    walletId: integer("wallet_id").notNull().references(() => walletsTable.id),
    senderId: integer("sender_id").notNull().references(() => dmtSendersTable.id),
    beneficiaryId: integer("beneficiary_id").notNull().references(() => dmtBeneficiariesTable.id),

    mode: varchar("mode", { length: 10 }).notNull(), // IMPS | NEFT
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    chargePaise: bigint("charge_paise", { mode: "number" }).notNull().default(0),
    commissionPaise: bigint("commission_paise", { mode: "number" }).notNull().default(0),
    netCostPaise: bigint("net_cost_paise", { mode: "number" }).notNull(),

    // Snapshot of beneficiary at time of transfer (immutable)
    benName: varchar("ben_name", { length: 200 }).notNull(),
    accountNumber: varchar("account_number", { length: 30 }).notNull(),
    ifsc: varchar("ifsc", { length: 15 }).notNull(),

    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | processing | success | failed | refunded
    a1RequestId: varchar("a1_request_id", { length: 80 }).notNull().unique(),
    a1TxnId: varchar("a1_txn_id", { length: 120 }),
    a1OperatorRef: varchar("a1_operator_ref", { length: 120 }),
    a1ResponseCode: varchar("a1_response_code", { length: 40 }),
    errorReason: text("error_reason"),
    responseRaw: jsonb("response_raw"),

    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    debitLedgerId: integer("debit_ledger_id"),
    refundLedgerId: integer("refund_ledger_id"),
    commissionLedgerId: integer("commission_ledger_id"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    userIdempotencyUq: uniqueIndex("dmt_transfers_user_idempotency_uq").on(t.userId, t.idempotencyKey),
    userCreatedIdx: index("dmt_transfers_user_created_idx").on(t.userId, t.createdAt),
  }),
);

export type DmtSender = typeof dmtSendersTable.$inferSelect;
export type DmtBeneficiary = typeof dmtBeneficiariesTable.$inferSelect;
export type DmtTransfer = typeof dmtTransfersTable.$inferSelect;
