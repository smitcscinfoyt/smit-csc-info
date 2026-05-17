/**
 * Elements panel — shapes, lines, common icons. Click to insert at the
 * centre of the current page.
 */

import {
  Square,
  Circle as CircleIcon,
  Triangle,
  Star,
  Heart,
  Minus,
  ArrowRight,
  Check,
  X,
  Phone,
  Mail,
  MapPin,
  Calendar,
  IdCard,
  Award,
  Sparkles,
} from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { useStudio, useActivePage } from "../store";
import type { CircleElement, ElementData, IconElement, LineElement, RectElement } from "../types";

export function ElementsPanel() {
  const addElement = useStudio((s) => s.addElement);
  const page = useActivePage();

  const cx = (page?.width ?? 1280) / 2;
  const cy = (page?.height ?? 720) / 2;

  const insertRect = (preset: "rect" | "rounded" | "outline") => {
    const w = 240;
    const h = 160;
    const el: Omit<RectElement, "id"> = {
      type: "rect",
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      fill: preset === "outline" ? "transparent" : "#7c3aed",
      stroke: preset === "outline" ? "#7c3aed" : "transparent",
      strokeWidth: preset === "outline" ? 4 : 0,
      cornerRadius: preset === "rounded" ? 24 : 0,
    };
    addElement(el as Omit<ElementData, "id">);
  };

  const insertCircle = (filled: boolean) => {
    const d = 200;
    const el: Omit<CircleElement, "id"> = {
      type: "circle",
      x: cx - d / 2,
      y: cy - d / 2,
      width: d,
      height: d,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      fill: filled ? "#facc15" : "transparent",
      stroke: filled ? "transparent" : "#facc15",
      strokeWidth: filled ? 0 : 4,
    };
    addElement(el as Omit<ElementData, "id">);
  };

  const insertTriangle = () => {
    const w = 220;
    const h = 200;
    const el: Omit<LineElement, "id"> = {
      type: "line",
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      points: [w / 2, 0, 0, h, w, h, w / 2, 0],
      stroke: "#16a34a",
      strokeWidth: 4,
    };
    addElement(el as Omit<ElementData, "id">);
  };

  const insertLine = (arrow: boolean) => {
    const w = 240;
    const el: Omit<LineElement, "id"> = {
      type: "line",
      x: cx - w / 2,
      y: cy,
      width: w,
      height: 4,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      points: [0, 0, w, 0],
      stroke: "#0f172a",
      strokeWidth: 4,
      arrow,
    };
    addElement(el as Omit<ElementData, "id">);
  };

  const insertIcon = (Icon: any, color: string) => {
    const svg = renderToStaticMarkup(
      <Icon size={64} color={color} strokeWidth={2.5} />
    );
    const el: Omit<IconElement, "id"> = {
      type: "icon",
      x: cx - 64,
      y: cy - 64,
      width: 128,
      height: 128,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      svg,
      color,
    };
    addElement(el as Omit<ElementData, "id">);
  };

  return (
    <div className="p-4 space-y-5">
      <SectionTitle>Shapes</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        <ShapeBtn label="Box" onClick={() => insertRect("rect")}>
          <div className="h-8 w-8 bg-purple-600 rounded" />
        </ShapeBtn>
        <ShapeBtn label="Rounded" onClick={() => insertRect("rounded")}>
          <div className="h-8 w-8 bg-purple-600 rounded-xl" />
        </ShapeBtn>
        <ShapeBtn label="Outline" onClick={() => insertRect("outline")}>
          <div className="h-8 w-8 border-2 border-purple-600 rounded" />
        </ShapeBtn>
        <ShapeBtn label="Circle" onClick={() => insertCircle(true)}>
          <div className="h-8 w-8 bg-amber-400 rounded-full" />
        </ShapeBtn>
        <ShapeBtn label="Ring" onClick={() => insertCircle(false)}>
          <div className="h-8 w-8 border-2 border-amber-500 rounded-full" />
        </ShapeBtn>
        <ShapeBtn label="Triangle" onClick={insertTriangle}>
          <Triangle className="h-8 w-8 text-emerald-600" />
        </ShapeBtn>
        <ShapeBtn label="Line" onClick={() => insertLine(false)}>
          <Minus className="h-8 w-8" />
        </ShapeBtn>
        <ShapeBtn label="Arrow" onClick={() => insertLine(true)}>
          <ArrowRight className="h-8 w-8 text-rose-600" />
        </ShapeBtn>
      </div>

      <SectionTitle>Icons</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        <ShapeBtn label="Tick" onClick={() => insertIcon(Check, "#16a34a")}>
          <Check className="h-8 w-8 text-emerald-600" />
        </ShapeBtn>
        <ShapeBtn label="Cross" onClick={() => insertIcon(X, "#dc2626")}>
          <X className="h-8 w-8 text-rose-600" />
        </ShapeBtn>
        <ShapeBtn label="Star" onClick={() => insertIcon(Star, "#f59e0b")}>
          <Star className="h-8 w-8 text-amber-500" />
        </ShapeBtn>
        <ShapeBtn label="Heart" onClick={() => insertIcon(Heart, "#dc2626")}>
          <Heart className="h-8 w-8 text-rose-500" />
        </ShapeBtn>
        <ShapeBtn label="Phone" onClick={() => insertIcon(Phone, "#7c3aed")}>
          <Phone className="h-8 w-8 text-purple-600" />
        </ShapeBtn>
        <ShapeBtn label="Mail" onClick={() => insertIcon(Mail, "#7c3aed")}>
          <Mail className="h-8 w-8 text-purple-600" />
        </ShapeBtn>
        <ShapeBtn label="Map" onClick={() => insertIcon(MapPin, "#dc2626")}>
          <MapPin className="h-8 w-8 text-rose-600" />
        </ShapeBtn>
        <ShapeBtn label="Date" onClick={() => insertIcon(Calendar, "#0ea5e9")}>
          <Calendar className="h-8 w-8 text-sky-600" />
        </ShapeBtn>
        <ShapeBtn label="ID" onClick={() => insertIcon(IdCard, "#4338ca")}>
          <IdCard className="h-8 w-8 text-indigo-700" />
        </ShapeBtn>
        <ShapeBtn label="Award" onClick={() => insertIcon(Award, "#b45309")}>
          <Award className="h-8 w-8 text-amber-700" />
        </ShapeBtn>
        <ShapeBtn label="Spark" onClick={() => insertIcon(Sparkles, "#7c3aed")}>
          <Sparkles className="h-8 w-8 text-purple-600" />
        </ShapeBtn>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-bold tracking-wider uppercase text-purple-700">
      {children}
    </h4>
  );
}

function ShapeBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square rounded-lg border border-purple-200 bg-purple-50/40 hover:bg-purple-100 hover:border-purple-400 hover:scale-[1.03] transition-all flex flex-col items-center justify-center gap-1 group"
      title={label}
    >
      {children}
      <span className="text-[9px] text-purple-700 font-medium leading-none">{label}</span>
    </button>
  );
}

