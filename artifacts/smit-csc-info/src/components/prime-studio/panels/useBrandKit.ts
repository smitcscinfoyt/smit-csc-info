/**
 * Brand Kit hook — tiny standalone store backed by `localStorage`.
 *
 * Lives outside the main `useStudio` zustand store on purpose: brand kit
 * data is *user-scoped* (persists across all projects) while studio state
 * is *project-scoped*. Keeping them separate also means the Brand Kit
 * load/save side-effects don't pollute the studio's history snapshots.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "prime-studio-brand-kit";

export interface BrandKitLogo {
  src: string;
  width: number;
  height: number;
}

export interface BrandKit {
  name: string;
  logo: BrandKitLogo | null;
  colors: string[];
  fonts: { heading: string; body: string };
}

/** Royal-purple + gold seed palette to match the studio's brand chrome. */
const DEFAULT_COLORS: string[] = [
  "#4c1d95", // deep purple
  "#7c3aed", // royal purple
  "#a855f7", // bright violet
  "#f59e0b", // gold
  "#fbbf24", // light gold
  "#0f172a", // slate ink
];

const DEFAULT_BRAND: BrandKit = {
  name: "My CSC Centre",
  logo: null,
  colors: DEFAULT_COLORS,
  fonts: { heading: "Poppins", body: "Inter" },
};

function readFromStorage(): BrandKit {
  if (typeof window === "undefined") return DEFAULT_BRAND;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRAND;
    const parsed = JSON.parse(raw) as Partial<BrandKit>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : DEFAULT_BRAND.name,
      logo:
        parsed.logo && typeof parsed.logo === "object" && parsed.logo.src
          ? {
              src: String(parsed.logo.src),
              width: Number(parsed.logo.width) || 0,
              height: Number(parsed.logo.height) || 0,
            }
          : null,
      colors:
        Array.isArray(parsed.colors) && parsed.colors.length
          ? parsed.colors.filter((c) => typeof c === "string")
          : DEFAULT_BRAND.colors,
      fonts: {
        heading:
          parsed.fonts && typeof parsed.fonts.heading === "string"
            ? parsed.fonts.heading
            : DEFAULT_BRAND.fonts.heading,
        body:
          parsed.fonts && typeof parsed.fonts.body === "string"
            ? parsed.fonts.body
            : DEFAULT_BRAND.fonts.body,
      },
    };
  } catch {
    return DEFAULT_BRAND;
  }
}

function writeToStorage(b: BrandKit) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // Quota exceeded — most likely the logo data-URL pushed us over.
    // Persist a logo-less copy so colours / fonts / name still survive.
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...b, logo: null }),
      );
    } catch {
      /* swallow */
    }
  }
}

/**
 * Reactive accessor + mutators for the brand kit. Returns a stable shape
 * (the inner setters are wrapped in `useCallback`) so consumers can
 * destructure freely.
 */
export function useBrandKit() {
  const [brand, setBrand] = useState<BrandKit>(() => readFromStorage());

  // Persist on every change.
  useEffect(() => {
    writeToStorage(brand);
  }, [brand]);

  const setName = useCallback((name: string) => {
    setBrand((b) => ({ ...b, name }));
  }, []);

  const setLogo = useCallback((logo: BrandKitLogo | null) => {
    setBrand((b) => ({ ...b, logo }));
  }, []);

  const addColor = useCallback((color: string) => {
    setBrand((b) =>
      b.colors.includes(color) ? b : { ...b, colors: [...b.colors, color] },
    );
  }, []);

  const removeColor = useCallback((color: string) => {
    setBrand((b) => ({ ...b, colors: b.colors.filter((c) => c !== color) }));
  }, []);

  const setHeadingFont = useCallback((heading: string) => {
    setBrand((b) => ({ ...b, fonts: { ...b.fonts, heading } }));
  }, []);

  const setBodyFont = useCallback((body: string) => {
    setBrand((b) => ({ ...b, fonts: { ...b.fonts, body } }));
  }, []);

  return {
    brand,
    setName,
    setLogo,
    addColor,
    removeColor,
    setHeadingFont,
    setBodyFont,
  };
}
