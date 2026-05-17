import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sticky "Back" button rendered above every admin sub-page.
 *
 * Behaviour:
 *   • On `/admin` (dashboard root) → hidden, since there is nothing to
 *     go "back" to inside the admin area.
 *   • On any `/admin/<sub>` page → click goes to `/admin`. We use a
 *     direct navigation (not `history.back()`) so the destination is
 *     always predictable, even when the user landed on the sub-page
 *     via a hard refresh / direct URL.
 */
export function AdminBackBar() {
  const [location, setLocation] = useLocation();

  if (location === "/admin" || location === "/admin/") return null;

  return (
    <div className="mb-4 flex items-center">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setLocation("/admin")}
        data-testid="button-admin-back"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </Button>
    </div>
  );
}
