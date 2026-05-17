import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useLocation } from "wouter";
import { User, setAuthTokenGetter, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useIdleTimer } from "@/hooks/use-idle-timer";

const IDLE_TIMEOUT_MS  = 20 * 60 * 1000;
const IDLE_WARNING_MS  = 19 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken]   = useState<string | null>(() => sessionStorage.getItem("auth_token"));
  const queryClient         = useQueryClient();
  const [, navigate]        = useLocation();
  const hasLoggedOutRef     = useRef(false);

  useEffect(() => {
    setAuthTokenGetter(() => sessionStorage.getItem("auth_token"));
  }, []);

  const { data: user, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: !!token,
      retry: false,
    },
  });

  const logout = useCallback(() => {
    if (hasLoggedOutRef.current) return;
    hasLoggedOutRef.current = true;
    sessionStorage.removeItem("auth_token");
    setToken(null);
    queryClient.setQueryData(getGetMeQueryKey(), null);
    queryClient.clear();
    setTimeout(() => { hasLoggedOutRef.current = false; }, 500);
    navigate("/login");
  }, [queryClient, navigate]);

  const login = useCallback((newToken: string, newUser: User) => {
    sessionStorage.setItem("auth_token", newToken);
    setToken(newToken);
    queryClient.setQueryData(getGetMeQueryKey(), newUser);
    hasLoggedOutRef.current = false;
  }, [queryClient]);

  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [logout]);

  const handleIdleTimeout = useCallback(() => {
    logout();
  }, [logout]);

  const { isWarning, remainingSeconds, reset } = useIdleTimer({
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout: handleIdleTimeout,
  });

  const isLoggedIn = !!token && !!user;

  return (
    <AuthContext.Provider
      value={{ user: user || null, isLoading: !!token && isLoading, login, logout }}
    >
      {children}

      {isLoggedIn && isWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 mx-4 max-w-sm w-full text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Still there?
            </h2>
            <p className="text-gray-500 text-sm mb-1">
              You've been inactive for a while.
            </p>
            <p className="text-gray-800 font-semibold text-lg mb-6">
              Logging out in{" "}
              <span className="text-amber-600 tabular-nums">{remainingSeconds}s</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={logout}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                Logout now
              </button>
              <button
                onClick={reset}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold text-sm hover:from-indigo-700 hover:to-violet-800 transition-colors shadow-md shadow-indigo-200"
              >
                Stay logged in
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
