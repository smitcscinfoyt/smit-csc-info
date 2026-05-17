import { useParams, Link } from "wouter";
import { useGetContentItem, getGetContentItemQueryKey, useGetMembershipStatus, getGetMembershipStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Lock, Calendar, Tag, Youtube, ExternalLink } from "lucide-react";
import { format } from "date-fns";

export default function ContentDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0");

  const { data: item, isLoading: isLoadingItem } = useGetContentItem(id, {
    query: { queryKey: getGetContentItemQueryKey(id), enabled: !!id }
  });

  const { data: membershipStatus, isLoading: isLoadingMembership } = useGetMembershipStatus({
    query: { queryKey: getGetMembershipStatusQueryKey(), retry: false }
  });

  if (isLoadingItem) {
    return <div className="flex-1 p-8 animate-pulse container mx-auto max-w-4xl">Loading...</div>;
  }

  if (!item) {
    return <div className="flex-1 p-8 text-center">Content not found.</div>;
  }

  const isLocked = item.isPrime && (!membershipStatus || !membershipStatus.isActive);

  // Extract YouTube video ID or detect channel/playlist links
  let videoId: string | null = item.link;
  let isChannelLink = false;
  try {
    const url = new URL(item.link);
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) {
        videoId = v;
      } else if (url.pathname.startsWith("/@") || url.pathname.startsWith("/c/") || url.pathname.startsWith("/channel/") || url.pathname.startsWith("/user/")) {
        isChannelLink = true;
        videoId = null;
      } else {
        videoId = item.link;
      }
    } else if (url.hostname.includes("youtu.be")) {
      videoId = url.pathname.slice(1);
    }
  } catch {
    // Not a valid URL — treat as plain video ID
  }

  return (
    <div className="flex-1 p-4 md:p-8 container mx-auto max-w-4xl">
      <Link href="/content">
        <Button variant="ghost" className="mb-6 pl-0 hover:bg-transparent hover:text-primary">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Library
        </Button>
      </Link>

      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 mb-2">
          <Badge>{item.category}</Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Tag className="h-3 w-3" /> {item.type}
          </Badge>
          {item.isPrime && (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
              <Lock className="mr-1 h-3 w-3" /> Prime Content
            </Badge>
          )}
        </div>

        <h1 className="text-3xl md:text-4xl font-bold">{item.title}</h1>
        {item.titleGu && <h2 className="text-xl md:text-2xl text-muted-foreground">{item.titleGu}</h2>}

        <div className="flex items-center gap-2 text-sm text-muted-foreground pb-4 border-b">
          <Calendar className="h-4 w-4" /> 
          Published on {format(new Date(item.createdAt), "MMMM dd, yyyy")}
        </div>

        <div className="aspect-video bg-black rounded-lg overflow-hidden relative shadow-lg">
          {isLocked ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-6 text-center">
              <div className="h-16 w-16 bg-yellow-500/20 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-yellow-500" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Premium Content</h3>
              <p className="text-gray-400 mb-6 max-w-md">
                This tutorial is exclusively available for Prime members. Upgrade your account to unlock this and all other premium videos.
              </p>
              <Link href="/membership">
                <Button size="lg" className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold">
                  Unlock with Prime
                </Button>
              </Link>
            </div>
          ) : isChannelLink ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a2e] text-white p-6 text-center">
              <div className="h-20 w-20 bg-red-600 rounded-full flex items-center justify-center mb-5">
                <Youtube className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Watch on YouTube</h3>
              <p className="text-gray-400 mb-6 max-w-md">
                This video is available on the Smit CSC Info YouTube channel. Click below to watch it directly.
              </p>
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white font-semibold">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Watch on YouTube
                </Button>
              </a>
            </div>
          ) : (
            <iframe
              className="w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
              title={item.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            ></iframe>
          )}
        </div>

        {item.description && (
          <div className="bg-white p-6 rounded-lg shadow-sm border mt-8">
            <h3 className="text-lg font-semibold mb-4">Description</h3>
            <div className="prose max-w-none text-muted-foreground whitespace-pre-wrap">
              {item.description}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
