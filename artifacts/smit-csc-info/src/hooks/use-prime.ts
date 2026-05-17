import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

export function useIsPrime() {
  const { user } = useAuth();
  const { data } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: !!user,
    staleTime: 60_000,
  });
  return !!user && !!data?.is_prime;
}

/**
 * Like useIsPrime but also exposes whether the prime check is still resolving.
 * Use this when you must avoid treating "unknown" as "not prime" (e.g. routing
 * decisions on click handlers).
 */
export function usePrimeStatus() {
  const { user } = useAuth();
  const { data, isLoading, isFetching, isError } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const resolved = data !== undefined || !user || isError;
  const isPrime = !!user && !!data?.is_prime;
  return { isPrime, resolved, isLoading: isLoading || isFetching };
}
