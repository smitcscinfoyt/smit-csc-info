import { Sparkles } from "lucide-react";

export function GenericPanel({
  title,
  subtitle,
  comingSoon,
}: {
  title: string;
  subtitle?: string;
  comingSoon?: boolean;
}) {
  return (
    <div className="p-4">
      <h3 className="text-base font-bold text-purple-950 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-purple-700 mb-4 leading-relaxed">{subtitle}</p>}
      {comingSoon && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
          <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            This feature will be added in Phase 2. The "Elements", "Text", "Uploads" and "Tools"
            tabs are fully working right now.
          </p>
        </div>
      )}
    </div>
  );
}
