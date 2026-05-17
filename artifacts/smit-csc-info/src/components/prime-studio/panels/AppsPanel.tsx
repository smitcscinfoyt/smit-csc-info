/**
 * Apps & Add-ons panel — container for the three add-on generators
 * (QR / Barcode / Calendar). Each sub-panel keeps its own state and
 * unmounts cleanly when the user switches sub-tab.
 *
 * Visual structure mirrors AssetsPanel.tsx so the studio's sidebar
 * panels feel consistent.
 */

import { useState } from "react";
import { Barcode, CalendarDays, QrCode, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { QRSubPanel } from "./apps/QRSubPanel";
import { BarcodeSubPanel } from "./apps/BarcodeSubPanel";
import { CalendarSubPanel } from "./apps/CalendarSubPanel";

type AppSubTab = "qr" | "barcode" | "calendar";

const SUB_TABS: { id: AppSubTab; label: string; icon: LucideIcon }[] = [
  { id: "qr", label: "QR", icon: QrCode },
  { id: "barcode", label: "Barcode", icon: Barcode },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

export function AppsPanel() {
  const [active, setActive] = useState<AppSubTab>("qr");

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-purple-100">
        <div
          className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-purple-50 border border-purple-200"
          role="tablist"
          aria-label="Add-on type"
        >
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all",
                  isActive
                    ? "bg-gradient-to-br from-purple-700 to-indigo-700 text-amber-50 shadow-md shadow-purple-300/40"
                    : "text-purple-700 hover:bg-purple-100",
                )}
                data-testid={`apps-subtab-${tab.id}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {active === "qr" && <QRSubPanel />}
        {active === "barcode" && <BarcodeSubPanel />}
        {active === "calendar" && <CalendarSubPanel />}
      </div>
    </div>
  );
}
