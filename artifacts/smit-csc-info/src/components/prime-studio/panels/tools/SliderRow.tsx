/**
 * Compact labelled slider used throughout the Adjustments / Shadows panels.
 *
 * History semantics:
 *   The studio's `_commit` snapshots the *current* state into the undo
 *   stack, so we MUST call it BEFORE the first mutation of a drag — never
 *   after, otherwise undo would restore the post-drag state and become a
 *   no-op. We expose `onDragStart` for that and fire it exactly once per
 *   drag (reset on `onValueCommit` / pointer-up).
 */

import { useRef } from "react";
import { Slider } from "@/components/ui/slider";

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Called exactly once at the start of a drag, BEFORE the first
   *  onChange. Use this to snapshot history (`_commit`). */
  onDragStart?: () => void;
  min?: number;
  max?: number;
  step?: number;
  /** Render value with a sign prefix (e.g. "+15"). Useful for -100..100. */
  signed?: boolean;
  /** Suffix appended to the value display (e.g. "px", "°"). */
  unit?: string;
  testId?: string;
}

export function SliderRow({
  label,
  value,
  onChange,
  onDragStart,
  min = -100,
  max = 100,
  step = 1,
  signed = false,
  unit = "",
  testId,
}: Props) {
  const startedRef = useRef(false);
  const display =
    signed && value > 0 ? `+${value}${unit}` : `${value}${unit}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-purple-900">{label}</span>
        <span className="text-[11px] tabular-nums text-purple-700 font-bold">
          {display}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          if (!startedRef.current) {
            startedRef.current = true;
            onDragStart?.();
          }
          onChange(v[0] ?? 0);
        }}
        onValueCommit={() => {
          startedRef.current = false;
        }}
        className="[&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5"
        data-testid={testId}
      />
    </div>
  );
}
