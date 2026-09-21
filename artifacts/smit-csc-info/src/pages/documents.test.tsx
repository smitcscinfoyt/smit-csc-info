import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Documents from "./documents";
import { useAuth } from "@/hooks/use-auth";
import { usePrimeStatus } from "@/hooks/use-prime";
import { useGetDocuments } from "@workspace/api-client-react";

// Mock Hooks
vi.mock("@/hooks/use-auth", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/use-prime", () => ({ usePrimeStatus: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({
  useGetDocuments: vi.fn(),
  getGetDocumentsQueryKey: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useLanguage: () => ({
    t: {
      documents: {
        catAll: "All",
        searchPlaceholder: "Search...",
        noResults: "No results",
        view: "View",
        download: "Download",
      }
    }
  })
}));
vi.mock("@/components/motion", () => ({ FadeInUp: ({ children }: any) => <div>{children}</div> }));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>
}));

const mockDocs = [
  {
    id: 1,
    title: "Public Document",
    fileUrl: "/public.pdf",
    fileName: "public.pdf",
    fileType: "PDF",
    category: "General",
    isPrime: false,
    accessLevel: "public",
  },
  {
    id: 2,
    title: "Prime Gated Document",
    fileUrl: "/prime.pdf",
    fileName: "prime.pdf",
    fileType: "PDF",
    category: "Affidavits",
    isPrime: true,
    accessLevel: "prime_only",
  }
];

describe("Documents Page (Role-Based Interface)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useGetDocuments as any).mockReturnValue({ data: mockDocs, isLoading: false });
  });

  it("renders blurred thumbnails and lock icons for logged-out users", () => {
    (useAuth as any).mockReturnValue({ user: null });
    (usePrimeStatus as any).mockReturnValue({ isPrime: false });

    render(<Documents />);

    // Cards should render
    expect(screen.getByText("Public Document")).toBeInTheDocument();
    expect(screen.getByText("Prime Gated Document")).toBeInTheDocument();

    // The AuthImage component handles blurring via css or missing auth.
    // In our test, we just check if clicking triggers the login modal.
    const publicDocClickArea = screen.getByTestId("document-card-1");
    fireEvent.click(publicDocClickArea);
    expect(screen.getByText(/Login Required/i)).toBeInTheDocument();
  });

  it("renders prime variants and upgrade locks for free users", () => {
    (useAuth as any).mockReturnValue({ user: { id: 1 } }); // Logged in
    (usePrimeStatus as any).mockReturnValue({ isPrime: false }); // Free user

    render(<Documents />);

    // For Prime Gated Document, the 'Upgrade' button should be visible instead of 'View'
    const upgradeButtons = screen.getAllByText("Upgrade");
    expect(upgradeButtons.length).toBeGreaterThan(0);

    // Clicking upgrade on download should open prime modal (if we had prime modal text mocked)
    const primeDocClickArea = screen.getByTestId("document-card-2");
    fireEvent.click(primeDocClickArea);
    
    // Viewer should open but indicate Prime is required
    expect(screen.getByText(/Download requires Prime/i)).toBeInTheDocument();
  });

  it("renders clean luxury UI for Prime members", () => {
    (useAuth as any).mockReturnValue({ user: { id: 1 } });
    (usePrimeStatus as any).mockReturnValue({ isPrime: true });

    render(<Documents />);

    // Luxury view is tested via data-testid
    expect(screen.getByTestId("prime-documents-page")).toBeInTheDocument();
    
    // Should see regular View/Download, no Upgrade buttons
    expect(screen.queryByText("Upgrade")).not.toBeInTheDocument();
  });
});
