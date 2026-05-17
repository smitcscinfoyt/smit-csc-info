import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Star, Pin, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { SubmitReviewDialog } from "./submit-review-dialog";

interface Review {
  id:         number;
  userId:     number;
  userName:   string;
  rating:     number;
  reviewText: string;
  state:      string | null;
  city:       string | null;
  isPinned:   boolean;
  createdAt:  string;
}

const AVATAR_COLORS = [
  "from-indigo-500 to-purple-600",
  "from-pink-500 to-rose-600",
  "from-green-500 to-emerald-600",
  "from-amber-500 to-orange-600",
  "from-blue-500 to-cyan-600",
  "from-violet-500 to-fuchsia-600",
  "from-teal-500 to-cyan-600",
  "from-red-500 to-pink-600",
];

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function ReviewCard({ review, colorIdx }: { review: Review; colorIdx: number }) {
  // "City, State" pulled directly from the reviews table —
  // falls back to "Gujarat, India" so the slot is never empty.
  const location =
    review.city && review.state
      ? `${review.city}, ${review.state}`
      : "Gujarat, India";
  const initials = getInitials(review.userName);
  const color    = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];

  return (
    <motion.div
      whileHover={{ y: -6, boxShadow: "0 24px 48px rgba(79,70,229,0.12)" }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-full flex flex-col relative w-full"
    >
      {review.isPinned && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">
          <Pin className="h-3 w-3 fill-current" /> Featured
        </div>
      )}

      {/* Stars */}
      <div className="flex mb-3 gap-0.5">
        {[...Array(5)].map((_, j) => (
          <Star
            key={j}
            className={`h-4 w-4 ${j < review.rating ? "text-amber-400 fill-current" : "text-gray-200 fill-current"}`}
          />
        ))}
      </div>

      {/* Review text */}
      <p className="text-sm text-gray-700 leading-relaxed flex-1 mb-5 line-clamp-6">
        "{review.reviewText}"
      </p>

      {/* Footer: Avatar + Name + Location */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-50">
        <div className={`h-11 w-11 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm`}>
          {initials}
        </div>
        <div className="min-w-0">
          <h4 className="font-bold text-sm text-foreground truncate leading-tight">
            {review.userName}
          </h4>
          <p
            className="flex items-center gap-1 truncate mt-1 text-gray-500"
            style={{ fontSize: "0.85rem" }}
          >
            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            {location}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export function MemberStoriesSlider() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [canScrollL, setCanScrollL] = useState(false);
  const [canScrollR, setCanScrollR] = useState(false);

  const { data: reviews, isLoading } = useQuery<Review[]>({
    queryKey: ["reviews-public"],
    queryFn:  () => apiFetch<Review[]>("/api/reviews"),
    staleTime: 60_000,
  });

  // Update arrow enabled state on scroll
  const updateArrows = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollL(el.scrollLeft > 4);
    setCanScrollR(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [reviews]);

  const scrollByCard = (dir: "left" | "right") => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLDivElement>("[data-review-card]");
    const step = card ? card.offsetWidth + 24 /* gap */ : el.clientWidth * 0.8;
    el.scrollBy({ left: dir === "right" ? step : -step, behavior: "smooth" });
  };

  const handleShareClick = () => {
    if (!user) {
      setLocation("/login");
      return;
    }
    setShowDialog(true);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-56 bg-gray-100 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50/50 rounded-2xl border border-dashed">
        <p className="text-muted-foreground mb-4">No member stories yet. Be the first to share yours!</p>
        <Button
          onClick={handleShareClick}
          className="bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white border-0 gap-2"
        >
          <Plus className="h-4 w-4" /> Share Your Story / Review
        </Button>
        <SubmitReviewDialog open={showDialog} onOpenChange={setShowDialog} />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* ── Carousel: arrows take their own columns OUTSIDE the track ── */}
      <div className="flex items-stretch gap-3 md:gap-4">

        {/* Left arrow column (desktop) */}
        <div className="hidden md:flex items-center">
          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.08 }}
            onClick={() => scrollByCard("left")}
            disabled={!canScrollL}
            aria-label="Previous reviews"
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg border border-gray-200 text-indigo-600 transition-opacity ${
              canScrollL ? "opacity-100 hover:bg-indigo-50" : "opacity-30 cursor-not-allowed"
            }`}
          >
            <ChevronLeft className="h-5 w-5" />
          </motion.button>
        </div>

        {/* Scroll track — pinned reviews come first via API ordering */}
        <div
          ref={trackRef}
          className="flex-1 min-w-0 overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="flex gap-4 md:gap-6">
            {reviews.map((r, i) => (
              <div
                key={r.id}
                data-review-card
                className="snap-start flex-shrink-0 basis-full md:basis-[calc((100%-3rem)/3)]"
              >
                <ReviewCard review={r} colorIdx={i} />
              </div>
            ))}
          </div>
        </div>

        {/* Right arrow column (desktop) */}
        <div className="hidden md:flex items-center">
          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.08 }}
            onClick={() => scrollByCard("right")}
            disabled={!canScrollR}
            aria-label="Next reviews"
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg border border-gray-200 text-indigo-600 transition-opacity ${
              canScrollR ? "opacity-100 hover:bg-indigo-50" : "opacity-30 cursor-not-allowed"
            }`}
          >
            <ChevronRight className="h-5 w-5" />
          </motion.button>
        </div>
      </div>

      {/* Mobile arrows */}
      <div className="flex md:hidden justify-center gap-3 mt-6">
        <Button
          variant="outline"
          size="icon"
          onClick={() => scrollByCard("left")}
          disabled={!canScrollL}
          className="h-10 w-10 rounded-full"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => scrollByCard("right")}
          disabled={!canScrollR}
          className="h-10 w-10 rounded-full"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Bottom-center Share button ── */}
      <div className="flex justify-center mt-10">
        <Button
          onClick={handleShareClick}
          size="lg"
          className="bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white border-0 gap-2 font-semibold shadow-lg px-8"
        >
          <Plus className="h-4 w-4" /> Share Your Story / Review
        </Button>
      </div>

      <SubmitReviewDialog open={showDialog} onOpenChange={setShowDialog} />
    </div>
  );
}
