export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function friendlyMessage(status: number, serverMsg?: string): string {
  // Prefer the server-provided message when it's already user-friendly
  // (i.e. doesn't look like a raw status code or stack trace).
  if (
    serverMsg &&
    serverMsg.length < 200 &&
    !/^HTTP\s*\d+/i.test(serverMsg) &&
    !/\bFetch\b/i.test(serverMsg) &&
    !/\bError\b.*at\s+\w/i.test(serverMsg)
  ) {
    return serverMsg;
  }
  if (status === 0) return "No internet connection. Please check your network and try again.";
  if (status >= 500) return "Something went wrong on our end. Please try again later.";
  if (status === 429) return "Too many requests. Please slow down and try again in a moment.";
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 401) return "Please sign in to continue.";
  if (status === 400) return "Some details look incorrect. Please check and try again.";
  return "Unable to process your request. Please check your connection.";
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError("Unable to process your request. Please check your connection.", 0, null);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      sessionStorage.removeItem("auth_token");
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    const serverMsg = (data as any)?.error || (data as any)?.message;
    throw new ApiError(friendlyMessage(res.status, serverMsg), res.status, data);
  }
  return res.json() as Promise<T>;
}
