import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Scrolls the window to the top whenever the route changes.
 * Mounted once globally inside the Router so every navigation
 * (footer links, navbar links, programmatic setLocation, etc.)
 * always lands the user at the top of the new page.
 */
export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    // Use instant scroll on first render, smooth on subsequent navigations
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [location]);

  return null;
}
