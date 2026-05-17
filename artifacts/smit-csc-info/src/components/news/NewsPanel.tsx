import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Newspaper, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";

type NewsArticle = {
  id: number;
  title: string;
  description: string | null;
  url: string;
  source: string | null;
  language: string | null;
  publishedAt: string | null;
  fetchedAt: string;
};

type NewsResponse = {
  count: number;
  lastFetchedAt: string | null;
  articles: NewsArticle[];
};

const LANG_LABEL: Record<string, string> = {
  guj: "ગુજરાતી",
  hin: "हिन्दी",
  eng: "English",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NewsPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useQuery<NewsResponse>({
      queryKey: ["news-latest"],
      queryFn: () => apiFetch<NewsResponse>("/api/news/latest"),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-primary" />
            Latest Updates
          </h1>
          <p className="text-sm text-muted-foreground">
            Gujarat agriculture, Khedut Sahay, government schemes & i-Khedut
            updates — refreshed every 3 hours.
          </p>
          {data?.lastFetchedAt && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Last updated {formatRelative(data.lastFetchedAt)}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="news-refresh"
        >
          <RefreshCw
            className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Failed to load news</p>
              <p className="text-[12px] mt-1 text-destructive/80">
                {(error as Error)?.message ?? "Please try again later."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.articles.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <Newspaper className="h-10 w-10 mx-auto mb-3 opacity-30" />
            No news articles available yet. The cache is refreshing in the
            background — please check back in a moment.
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.articles.length > 0 && (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="news-grid"
        >
          {data.articles.map((a) => (
            <Card
              key={a.id}
              className="flex flex-col hover:shadow-md transition-shadow border-border/60"
              data-testid={`news-card-${a.id}`}
            >
              <CardContent className="p-5 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {a.source && (
                    <Badge
                      variant="secondary"
                      className="text-[11px] font-medium px-2 py-0.5"
                    >
                      {a.source}
                    </Badge>
                  )}
                  {a.language && LANG_LABEL[a.language] && (
                    <Badge
                      variant="outline"
                      className="text-[11px] border-primary/30 text-primary px-2 py-0.5"
                    >
                      {LANG_LABEL[a.language]}
                    </Badge>
                  )}
                  {a.publishedAt && (
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {formatDate(a.publishedAt)}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-[17px] leading-snug mb-2.5 line-clamp-3 text-foreground">
                  {a.title}
                </h3>
                {a.description && (
                  <p className="text-[14px] text-muted-foreground leading-relaxed line-clamp-3 mb-4">
                    {a.description}
                  </p>
                )}
                <Link
                  href={`/news/${a.id}`}
                  className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  data-testid={`news-readmore-${a.id}`}
                >
                  Read More
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
