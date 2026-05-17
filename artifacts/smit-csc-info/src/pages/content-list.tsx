import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetContent, getGetContentQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  PlayCircle,
  Search,
  Youtube,
  ExternalLink,
  BookOpen,
  Crown,
  ListVideo,
  Sparkles,
  Layers,
  LayoutGrid,
  Lock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";

const YOUTUBE_CHANNEL = "https://www.youtube.com/@SmitCSCInfo";
const ALL_PLAYLISTS = "__all_playlists__";

type Tab = "latest" | "playlists" | "prime" | "all";

interface Theme {
  page: string;
  hero: string;
  heroOrb1: string;
  heroOrb2: string;
  badge: string;
  badgeText: string;
  iconBox: string;
  iconColor: string;
  subtitle: string;
  statBadge: string;
  stickyBar: string;
  divider: string;
  searchInput: string;
  searchIcon: string;
  headingText: string;
  headingIcon: string;
  countBadge: string;
  cardBorder: string;
  cardTitle: string;
  cardTitleHover: string;
  emptyBox: string;
  primeBadge: string;
  hint: string;
  topTabActive: string;
  topTabInactive: string;
  topTabIconActive: string;
  topTabIconInactive: string;
  topTabCountActive: string;
  topTabCountInactive: string;
  pillActive: string;
  pillInactive: string;
  pillCountActive: string;
  pillCountInactive: string;
}

const primeTheme: Theme = {
  page: "bg-gradient-to-b from-purple-50 via-white to-amber-50/50",
  hero: "bg-gradient-to-br from-purple-950 via-purple-900 to-purple-800",
  heroOrb1: "bg-amber-400/20",
  heroOrb2: "bg-purple-500/20",
  badge:
    "bg-amber-400/15 border-amber-300/30 text-amber-200",
  badgeText: "text-white",
  iconBox: "bg-gradient-to-br from-amber-400 to-yellow-600",
  iconColor: "text-purple-950",
  subtitle: "text-amber-100/85",
  statBadge:
    "bg-amber-400/20 text-amber-100 border-amber-300/30 hover:bg-amber-400/25",
  stickyBar: "bg-white/95 border-purple-100",
  divider: "border-amber-400/40",
  searchInput:
    "border-purple-200 focus-visible:ring-amber-500/40 focus-visible:border-amber-500",
  searchIcon: "text-purple-700/60",
  headingText: "text-purple-950",
  headingIcon: "text-amber-600",
  countBadge: "bg-purple-50 border-purple-200 text-purple-800",
  cardBorder:
    "border-purple-100 hover:border-amber-400/60 hover:shadow-purple-900/10",
  cardTitle: "text-purple-950",
  cardTitleHover: "group-hover:text-purple-700",
  emptyBox: "border-purple-200",
  primeBadge:
    "bg-gradient-to-r from-amber-400 to-yellow-600 text-purple-950 shadow-md",
  hint: "text-amber-700",
  topTabActive:
    "bg-gradient-to-r from-purple-950 to-purple-900 text-amber-300 border-amber-400 shadow-lg",
  topTabInactive:
    "bg-white text-purple-900 border-purple-100 hover:border-amber-400/60 hover:bg-purple-50",
  topTabIconActive: "text-amber-300",
  topTabIconInactive: "text-purple-700",
  topTabCountActive: "bg-amber-400 text-purple-950",
  topTabCountInactive: "bg-purple-100 text-purple-800",
  pillActive: "bg-purple-950 text-amber-300 border-purple-950 shadow-md",
  pillInactive:
    "bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100 hover:border-amber-400/60",
  pillCountActive: "bg-amber-400 text-purple-950",
  pillCountInactive: "bg-purple-200 text-purple-800",
};

const normalTheme: Theme = {
  page: "bg-gray-50/50",
  hero: "bg-gradient-to-br from-indigo-700 via-indigo-800 to-violet-800",
  heroOrb1: "bg-indigo-400/20",
  heroOrb2: "bg-violet-400/20",
  badge:
    "bg-white/10 border-white/20 text-white",
  badgeText: "text-white",
  iconBox: "bg-gradient-to-br from-indigo-500 to-violet-600",
  iconColor: "text-white",
  subtitle: "text-indigo-100/90",
  statBadge:
    "bg-white/15 text-white border-white/25 hover:bg-white/20",
  stickyBar: "bg-white/95 border-gray-200",
  divider: "border-indigo-200",
  searchInput:
    "border-gray-200 focus-visible:ring-indigo-500/40 focus-visible:border-indigo-500",
  searchIcon: "text-gray-500",
  headingText: "text-gray-900",
  headingIcon: "text-indigo-600",
  countBadge: "bg-indigo-50 border-indigo-200 text-indigo-800",
  cardBorder:
    "border-gray-200 hover:border-indigo-400/60 hover:shadow-indigo-900/10",
  cardTitle: "text-gray-900",
  cardTitleHover: "group-hover:text-indigo-700",
  emptyBox: "border-gray-200",
  primeBadge:
    "bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-md",
  hint: "text-indigo-700",
  topTabActive:
    "bg-gradient-to-r from-indigo-600 to-violet-700 text-white border-indigo-600 shadow-md",
  topTabInactive:
    "bg-white text-gray-700 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50",
  topTabIconActive: "text-white",
  topTabIconInactive: "text-gray-500",
  topTabCountActive: "bg-white/25 text-white",
  topTabCountInactive: "bg-gray-100 text-gray-700",
  pillActive: "bg-indigo-600 text-white border-indigo-600 shadow-md",
  pillInactive:
    "bg-white text-gray-700 border-gray-200 hover:bg-indigo-50 hover:border-indigo-400",
  pillCountActive: "bg-white/25 text-white",
  pillCountInactive: "bg-gray-100 text-gray-700",
};

function getYoutubeThumbnail(link: string | null | undefined): string | null {
  if (!link) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
  }
  return null;
}

interface ContentItem {
  id: number;
  title: string;
  titleGu?: string | null;
  category: string;
  type: string;
  link: string;
  description?: string | null;
  isPrime: boolean;
  thumbnailUrl?: string | null;
  playlistTitle?: string | null;
  publishedAt?: string | null;
  createdAt: string;
}

function playlistOf(item: ContentItem): string {
  return item.playlistTitle || item.category || "Other Videos";
}

function dateMs(item: ContentItem): number {
  const d = item.publishedAt || item.createdAt;
  const t = d ? new Date(d).getTime() : 0;
  return isNaN(t) ? 0 : t;
}

export default function ContentList() {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>("latest");
  const [search, setSearch] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] =
    useState<string>(ALL_PLAYLISTS);

  // Royal-purple + golden "Prime look" only applies to logged-in Prime members.
  // Guests and Free users see the normal indigo/violet site theme.
  const { user } = useAuth();
  const { data: status } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const primeMode = !!user && !!status?.is_prime;
  const theme = primeMode ? primeTheme : normalTheme;

  const { data: content, isLoading } = useGetContent(undefined, {
    query: { queryKey: getGetContentQueryKey() },
  });

  // Only show videos in the library
  const videos = useMemo<ContentItem[]>(() => {
    if (!content) return [];
    return (content as ContentItem[]).filter((i) => i.type === "video");
  }, [content]);

  // Build playlist list with counts (used inside Playlists tab)
  const playlists = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of videos) {
      const name = playlistOf(v);
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [videos]);

  const primeCount = useMemo(
    () => videos.filter((v) => v.isPrime).length,
    [videos],
  );

  // Apply tab filter, then playlist sub-filter (if Playlists tab), then search
  const filtered = useMemo<ContentItem[]>(() => {
    let list: ContentItem[];

    switch (activeTab) {
      case "latest":
        list = [...videos].sort((a, b) => dateMs(b) - dateMs(a));
        break;
      case "prime":
        list = videos.filter((v) => v.isPrime);
        break;
      case "playlists":
        list =
          selectedPlaylist === ALL_PLAYLISTS
            ? videos
            : videos.filter((v) => playlistOf(v) === selectedPlaylist);
        break;
      case "all":
      default:
        list = videos;
        break;
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.titleGu || "").toLowerCase().includes(q) ||
          (item.description || "").toLowerCase().includes(q) ||
          (item.category || "").toLowerCase().includes(q) ||
          (item.playlistTitle || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [videos, activeTab, selectedPlaylist, search]);

  const showPlaylistTagOnCard =
    activeTab === "latest" ||
    activeTab === "all" ||
    activeTab === "prime" ||
    (activeTab === "playlists" && selectedPlaylist === ALL_PLAYLISTS);

  return (
    <div className={`flex-1 ${theme.page} min-h-screen`}>
      {/* Hero */}
      <section className={`relative overflow-hidden ${theme.hero} px-4 py-12 md:py-14`}>
        <div className={`absolute -top-24 -right-24 w-96 h-96 rounded-full ${theme.heroOrb1} blur-3xl pointer-events-none`} />
        <div className={`absolute -bottom-32 -left-24 w-96 h-96 rounded-full ${theme.heroOrb2} blur-3xl pointer-events-none`} />
        <div className="container mx-auto max-w-6xl relative z-10">
          <div className={`inline-flex items-center gap-2 border backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-bold mb-5 ${theme.badge}`}>
            {primeMode ? <Crown className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />} CONTENT LIBRARY
          </div>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className={`h-14 w-14 md:h-16 md:w-16 rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0 ${theme.iconBox}`}>
                <BookOpen className={`h-7 w-7 md:h-8 md:w-8 ${theme.iconColor}`} />
              </div>
              <div>
                <h1 className={`text-3xl md:text-5xl font-black leading-tight ${theme.badgeText}`}>
                  {t.contentList.title}
                </h1>
                <p className={`text-sm md:text-base mt-1.5 max-w-xl ${theme.subtitle}`}>
                  {t.contentList.subtitle}
                </p>
                {!isLoading && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge className={theme.statBadge}>
                      {playlists.length} Playlists
                    </Badge>
                    <Badge className={theme.statBadge}>
                      {videos.length} Videos
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <a
              href={YOUTUBE_CHANNEL}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start md:self-end"
            >
              <Button className="bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg">
                <Youtube className="mr-2 h-4 w-4" /> Visit YouTube Channel
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Sticky tab bar — Latest | Playlists | Prime | All */}
      <div className={`sticky top-0 z-20 backdrop-blur-md border-b shadow-sm ${theme.stickyBar}`}>
        <div className="container mx-auto max-w-6xl px-4 md:px-8">
          <div className="flex items-center gap-2 overflow-x-auto py-3">
            <TopTab
              theme={theme}
              icon={<Sparkles className="h-4 w-4" />}
              label="Latest"
              count={videos.length}
              active={activeTab === "latest"}
              onClick={() => setActiveTab("latest")}
            />
            <TopTab
              theme={theme}
              icon={<Layers className="h-4 w-4" />}
              label="Playlists"
              count={playlists.length}
              active={activeTab === "playlists"}
              onClick={() => setActiveTab("playlists")}
            />
            <TopTab
              theme={theme}
              icon={<Crown className="h-4 w-4" />}
              label="Prime"
              count={primeCount}
              active={activeTab === "prime"}
              onClick={() => setActiveTab("prime")}
            />
            <TopTab
              theme={theme}
              icon={<LayoutGrid className="h-4 w-4" />}
              label="All"
              count={videos.length}
              active={activeTab === "all"}
              onClick={() => setActiveTab("all")}
            />
          </div>

          {/* Sub-bar for Playlists: show every playlist as a button */}
          {activeTab === "playlists" && playlists.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-3 -mt-1">
              <PlaylistPill
                theme={theme}
                label="All Playlists"
                count={videos.length}
                active={selectedPlaylist === ALL_PLAYLISTS}
                onClick={() => setSelectedPlaylist(ALL_PLAYLISTS)}
              />
              {playlists.map((p) => (
                <PlaylistPill
                  theme={theme}
                  key={p.name}
                  label={p.name}
                  count={p.count}
                  active={selectedPlaylist === p.name}
                  onClick={() => setSelectedPlaylist(p.name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 md:px-8 py-8">
        {/* Search */}
        <div className="mb-6 relative max-w-md">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${theme.searchIcon}`} />
          <Input
            placeholder={t.contentList.searchPlaceholder}
            className={`pl-9 ${theme.searchInput}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Section heading for the active tab */}
        {!isLoading && (
          <SectionHeading
            theme={theme}
            primeMode={primeMode}
            tab={activeTab}
            playlist={selectedPlaylist}
            count={filtered.length}
          />
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="aspect-video bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={`text-center py-20 bg-white rounded-xl border border-dashed ${theme.emptyBox}`}>
            <BookOpen className={`h-12 w-12 mx-auto mb-3 ${primeMode ? "text-purple-300" : "text-gray-300"}`} />
            <p className={`font-semibold ${theme.headingText}`}>
              {search
                ? "No videos match your search."
                : activeTab === "prime"
                ? "No Prime videos yet."
                : activeTab === "playlists" && selectedPlaylist !== ALL_PLAYLISTS
                ? `No videos in "${selectedPlaylist}" yet.`
                : t.contentList.noResults}
            </p>
            {!search && videos.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Admins can sync videos from YouTube via the Manage Content page.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
              {filtered.map((item, i) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: Math.min(i * 0.02, 0.2), duration: 0.25 }}
                  whileHover={{ y: -4 }}
                >
                  <Link href={`/content/${item.id}`}>
                    <Card className={`h-full overflow-hidden cursor-pointer group border hover:shadow-lg transition-all duration-300 ${theme.cardBorder}`}>
                      <div className={`aspect-video relative overflow-hidden ${primeMode ? "bg-purple-50" : "bg-gray-100"}`}>
                        {(() => {
                          const thumb =
                            item.thumbnailUrl || getYoutubeThumbnail(item.link);
                          return thumb ? (
                            <img
                              src={thumb}
                              alt={item.title}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src.includes("maxresdefault")) {
                                  img.src = img.src.replace("maxresdefault", "hqdefault");
                                } else {
                                  img.style.display = "none";
                                }
                              }}
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${primeMode ? "bg-gradient-to-br from-purple-100 to-amber-100" : "bg-gradient-to-br from-indigo-100 to-violet-100"}`}>
                              <PlayCircle className={`h-14 w-14 ${primeMode ? "text-purple-400" : "text-indigo-400"}`} />
                            </div>
                          );
                        })()}

                        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity ${primeMode ? "bg-gradient-to-t from-purple-950/80 via-purple-950/0 to-purple-950/0" : "bg-gradient-to-t from-gray-950/80 via-gray-950/0 to-gray-950/0"}`} />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className={`h-16 w-16 rounded-full flex items-center justify-center shadow-2xl ${primeMode ? "bg-amber-400/95" : "bg-white/95"}`}>
                            <PlayCircle
                              className={`h-9 w-9 ${primeMode ? "text-purple-950" : "text-indigo-700"}`}
                              fill="currentColor"
                            />
                          </div>
                        </div>

                        {/* Top-left: playlist tag */}
                        {showPlaylistTagOnCard && (
                          <div className="absolute top-2 left-2">
                            <Badge className={`border-0 backdrop-blur-sm font-medium ${primeMode ? "bg-purple-950/85 text-amber-200" : "bg-gray-950/80 text-white"}`}>
                              <ListVideo className="h-3 w-3 mr-1" />
                              <span className="max-w-[140px] truncate">
                                {playlistOf(item)}
                              </span>
                            </Badge>
                          </div>
                        )}

                        {/* Top-right: Prime badge */}
                        {item.isPrime && (
                          <div className="absolute top-2 right-2">
                            <Badge className={`border-0 font-bold ${theme.primeBadge}`}>
                              <Crown className="h-3 w-3 mr-1" /> Prime
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="p-4">
                        <h3 className={`font-semibold line-clamp-2 leading-snug transition-colors ${theme.cardTitle} ${theme.cardTitleHover}`}>
                          {item.title}
                        </h3>
                        {language === "gu" && item.titleGu && (
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1.5">
                            {item.titleGu}
                          </p>
                        )}
                        {item.isPrime && (
                          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${theme.hint}`}>
                            <Lock className="h-3 w-3" />
                            Login required to play
                          </div>
                        )}
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeading({
  theme,
  primeMode,
  tab,
  playlist,
  count,
}: {
  theme: Theme;
  primeMode: boolean;
  tab: Tab;
  playlist: string;
  count: number;
}) {
  let title = "";
  let icon: React.ReactNode = null;

  if (tab === "latest") {
    title = "Latest Videos";
    icon = <Sparkles className={`h-5 w-5 ${theme.headingIcon}`} />;
  } else if (tab === "prime") {
    title = "Prime Videos";
    icon = <Crown className={`h-5 w-5 ${theme.headingIcon}`} />;
  } else if (tab === "all") {
    title = "All Videos";
    icon = <LayoutGrid className={`h-5 w-5 ${theme.headingIcon}`} />;
  } else if (tab === "playlists") {
    title = playlist === ALL_PLAYLISTS ? "All Playlists" : playlist;
    icon = <Layers className={`h-5 w-5 ${theme.headingIcon}`} />;
  }

  return (
    <div className={`flex items-center gap-3 mb-5 pb-3 border-b-2 ${theme.divider}`}>
      <div
        className={`h-1.5 w-8 rounded-full flex-shrink-0 ${
          primeMode
            ? "bg-gradient-to-r from-amber-400 to-yellow-600"
            : "bg-gradient-to-r from-indigo-500 to-violet-600"
        }`}
      />
      {icon}
      <h2 className={`text-xl md:text-2xl font-bold truncate ${theme.headingText}`}>
        {title}
      </h2>
      <Badge
        variant="outline"
        className={`font-semibold flex-shrink-0 ${theme.countBadge}`}
      >
        {count} {count === 1 ? "video" : "videos"}
      </Badge>
    </div>
  );
}

function TopTab({
  theme,
  icon,
  label,
  count,
  active,
  onClick,
}: {
  theme: Theme;
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all whitespace-nowrap",
        active ? theme.topTabActive : theme.topTabInactive,
      ].join(" ")}
    >
      <span className={active ? theme.topTabIconActive : theme.topTabIconInactive}>
        {icon}
      </span>
      <span>{label}</span>
      <span
        className={[
          "text-[11px] font-extrabold px-2 py-0.5 rounded-full leading-none",
          active ? theme.topTabCountActive : theme.topTabCountInactive,
        ].join(" ")}
      >
        {count}
      </span>
    </button>
  );
}

function PlaylistPill({
  theme,
  label,
  count,
  active,
  onClick,
}: {
  theme: Theme;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all whitespace-nowrap",
        active ? theme.pillActive : theme.pillInactive,
      ].join(" ")}
    >
      <span className="max-w-[180px] truncate">{label}</span>
      <span
        className={[
          "text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none",
          active ? theme.pillCountActive : theme.pillCountInactive,
        ].join(" ")}
      >
        {count}
      </span>
    </button>
  );
}
