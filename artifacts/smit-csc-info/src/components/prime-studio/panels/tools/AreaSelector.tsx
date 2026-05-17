/**
 * Area selector — All / Foreground / Background.
 *
 * UI lives now; the foreground/background modes need an AI cut-out which
 * we plan to wire to @imgly/background-removal in a follow-up. Today they
 * fall back to "all" with an inline hint asking the user to run BG Remove
 * first if they want to isolate the subject.
 */

import { Image as ImageIcon, User, Mountain } from "lucide-react";
import type { ImageElement } from "../../types";

const OPTIONS: Array<{ id: NonNullable<ImageElement["imageEffectArea"]>; label: string; Icon: any }> = [
  { id: "all", label: "All", Icon: ImageIcon },
  { id: "foreground", label: "Foreground", Icon: User },
  { id: "background", label: "Background", Icon: Mountain },
];

interface Props {
  value: ImageElement["imageEffectArea"];
  onChange: (v: NonNullable<ImageElement["imageEffectArea"]>) => void;
}

export function AreaSelector({ value, onChange }: Props) {
  const active = value ?? "all";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-purple-700">
          Apply to
        </span>
        {active !== "all" && (
          <span className="text-[10px] text-amber-700 font-semibold">
            Run BG Remove first
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-purple-50 p-1">
        {OPTIONS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={
                "flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] font-bold transition-colors " +
                (isActive
                  ? "bg-white text-purple-900 shadow-sm ring-1 ring-purple-300"
                  : "text-purple-600 hover:bg-white/60")
              }
              data-testid={`btn-area-${id}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
