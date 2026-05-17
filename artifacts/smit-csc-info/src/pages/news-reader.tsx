import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Newspaper, AlertCircle, Calendar } from "lucide-react";

type NewsArticle = {
  id: number;
  title: string;
  description: string | null;
  body: string | null;
  imageUrl: string | null;
  url: string;
  source: string | null;
  language: string | null;
  publishedAt: string | null;
  fetchedAt: string;
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

export default function NewsReader() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data, isLoading, isError, error } = useQuery<{
    article: NewsArticle;
  }>({
    queryKey: ["news-article", id],
    queryFn: () => apiFetch<{ article: NewsArticle }>(`/api/news/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });

  const a = data?.article;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link href="/documents">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          data-testid="news-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Latest Updates
        </Button>
      </Link>

      {isLoading && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Article not available</p>
              <p className="text-[12px] mt-1 text-destructive/80">
                {(error as Error)?.message ?? "It may have been removed from the cache."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {a && (
        <article>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge variant="secondary" className="text-[11px]">
              <Newspaper className="h-3 w-3 mr-1" />
              {a.source || "News"}
            </Badge>
            {a.language && LANG_LABEL[a.language] && (
              <Badge
                variant="outline"
                className="text-[11px] border-primary/30 text-primary"
              >
                {LANG_LABEL[a.language]}
              </Badge>
            )}
            {a.publishedAt && (
              <span className="text-[12px] text-muted-foreground inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(a.publishedAt)}
              </span>
            )}
          </div>

          <h1
            className="text-2xl sm:text-3xl font-bold leading-tight mb-4"
            data-testid="news-reader-title"
          >
            {a.title}
          </h1>

          {a.imageUrl && (
            <img
              src={a.imageUrl}
              alt={a.title}
              className="w-full rounded-lg mb-5 max-h-[420px] object-cover border"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}

          {a.body ? (
            <div
              className="prose prose-sm sm:prose-base max-w-none text-foreground leading-relaxed whitespace-pre-line"
              data-testid="news-reader-body"
            >
              {a.body}
            </div>
          ) : a.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {a.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Summary not available — please continue reading on the original
              source below.
            </p>
          )}

          <div className="mt-8 pt-4 border-t">
            <p
              className="text-[12px] text-muted-foreground"
              data-testid="news-reader-source-line"
            >
              Source: <strong className="text-foreground">{a.source || "External"}</strong>
              {a.publishedAt ? ` · ${formatDate(a.publishedAt)}` : ""}
            </p>
          </div>
        </article>
      )}
    </div>
  );
}
