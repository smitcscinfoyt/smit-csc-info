import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface AuthImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallbackIcon?: React.ReactNode;
}

export function AuthImage({ src, fallbackIcon, className, ...props }: AuthImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const token = sessionStorage.getItem("auth_token");
    
    // If we're strictly enforcing no-login = no-preview, we still fetch
    // If it 401s, we'll hit error.

    fetch(src, {
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch image");
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        setObjectUrl(url);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (loading) {
    return <div className={cn("animate-pulse bg-muted rounded-md", className)} />;
  }

  if (error || !objectUrl) {
    return (
      <div className={cn("flex items-center justify-center bg-muted rounded-md", className)}>
        {fallbackIcon || <span className="text-muted-foreground text-xs">Error</span>}
      </div>
    );
  }

  return <img src={objectUrl} className={cn("object-cover", className)} {...props} />;
}
