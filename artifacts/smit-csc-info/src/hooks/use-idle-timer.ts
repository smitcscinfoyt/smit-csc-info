import { useCallback, useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

interface UseIdleTimerOptions {
  timeoutMs: number;
  warningMs: number;
  onTimeout: () => void;
}

export function useIdleTimer({ timeoutMs, warningMs, onTimeout }: UseIdleTimerOptions) {
  const [isWarning, setIsWarning]           = useState(false);
  const [remainingSeconds, setRemaining]    = useState(0);

  const isWarningRef   = useRef(false);
  const logoutTimer    = useRef<ReturnType<typeof setTimeout>>();
  const warningTimer   = useRef<ReturnType<typeof setTimeout>>();
  const countdownTimer = useRef<ReturnType<typeof setInterval>>();
  const onTimeoutRef   = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const clearAll = useCallback(() => {
    clearTimeout(logoutTimer.current);
    clearTimeout(warningTimer.current);
    clearInterval(countdownTimer.current);
  }, []);

  const start = useCallback(() => {
    clearAll();
    isWarningRef.current = false;
    setIsWarning(false);

    const warnDurationMs = timeoutMs - warningMs;

    warningTimer.current = setTimeout(() => {
      isWarningRef.current = true;
      setIsWarning(true);
      let secs = Math.ceil(warnDurationMs / 1000);
      setRemaining(secs);
      countdownTimer.current = setInterval(() => {
        secs -= 1;
        setRemaining(Math.max(0, secs));
        if (secs <= 0) clearInterval(countdownTimer.current);
      }, 1000);
    }, warningMs);

    logoutTimer.current = setTimeout(() => {
      clearAll();
      onTimeoutRef.current();
    }, timeoutMs);
  }, [clearAll, timeoutMs, warningMs]);

  const reset = useCallback(() => start(), [start]);

  useEffect(() => {
    start();

    const onActivity = () => {
      if (!isWarningRef.current) start();
    };

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    );

    return () => {
      clearAll();
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [start, clearAll]);

  return { isWarning, remainingSeconds, reset };
}
