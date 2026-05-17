import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";
import { ScrollToTop } from "@/components/scroll-to-top";
import { LanguageProvider } from "@/lib/i18n";
import { useEffect } from "react";

// Pages
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import ContentList from "@/pages/content-list";
import ContentDetail from "@/pages/content-detail";
import Membership from "@/pages/membership";
import PaymentSuccess from "@/pages/payment-success";
import PaymentPending from "@/pages/payment-pending";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminUsers from "@/pages/admin-users";
import AdminContent from "@/pages/admin-content";
import AdminPayments from "@/pages/admin-payments";
import AdminDocuments from "@/pages/admin-documents";
import AdminReviews from "@/pages/admin-reviews";
import AdminInquiries from "@/pages/admin-inquiries";
import MyQueries from "@/pages/my-queries";
import PremiumDashboard from "@/pages/premium-dashboard";
import Documents from "@/pages/documents";
import NewsReader from "@/pages/news-reader";
import Account from "@/pages/account";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import Contact from "@/pages/contact";
import ResetPassword from "@/pages/reset-password";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/error-boundary";
import ToolsPage from "@/pages/tools";
import PanPhotoResizer from "@/pages/tools/pan-photo-resizer";
import SignatureResizer from "@/pages/tools/signature-resizer";
import PassportPhotoMaker from "@/pages/tools/passport-photo-maker";
import AadhaarMerger from "@/pages/tools/aadhaar-merger";
import PdfCompressor from "@/pages/tools/pdf-compressor";
import MergePdf from "@/pages/tools/merge-pdf";
import JpgToPdf from "@/pages/tools/jpg-to-pdf";
import BackgroundRemover from "@/pages/tools/background-remover";
import DpiConverter from "@/pages/tools/dpi-converter";
import ImageCompressor from "@/pages/tools/image-compressor";
import ImageUpscaler from "@/pages/tools/image-upscaler";
import PassportEngine from "@/pages/tools/passport-engine";
import IdCardEngine from "@/pages/tools/id-card-engine";
import SplitPdf from "@/pages/tools/split-pdf";
import RotatePdf from "@/pages/tools/rotate-pdf";
import PdfToJpg from "@/pages/tools/pdf-to-jpg";
import EsignPdf from "@/pages/tools/esign-pdf";
import WatermarkPdf from "@/pages/tools/watermark-pdf";
import PdfEditorV2 from "@/pages/tools/pdf-editor-v2";
import PrimeStudioGate from "@/components/prime-gate/PrimeStudioGate";
import DeletePages from "@/pages/tools/delete-pages";
import PdfToText from "@/pages/tools/pdf-to-text";
import LockPdf from "@/pages/tools/lock-pdf";
import UnlockPdf from "@/pages/tools/unlock-pdf";
import ExcelToPdf from "@/pages/tools/excel-to-pdf";
import PdfToWord from "@/pages/tools/pdf-to-word";
import WordToPdf from "@/pages/tools/word-to-pdf";

// Recharge Portal pages
import WalletPage from "@/pages/wallet";
import WalletAdd from "@/pages/wallet-add";
import WalletReturn from "@/pages/wallet-return";
import RechargeHub from "@/pages/recharge";
import RechargeMobile from "@/pages/recharge/mobile";
import RechargeDth from "@/pages/recharge/dth";
import RechargeBill from "@/pages/recharge/bill";
import RechargeHistory from "@/pages/recharge-history";
import RechargeReceipt from "@/pages/recharge-receipt";
import RechargeDayBook from "@/pages/recharge/daybook";
import RechargeLedger from "@/pages/recharge/ledger";
import RechargeEarning from "@/pages/recharge/earning";
import RechargeSearch from "@/pages/recharge/search";
import KycPage from "@/pages/kyc";
import AdminRecharge from "@/pages/admin-recharge";
import AdminCommission from "@/pages/admin-commission";
import AdminWallets from "@/pages/admin-wallets";
import AdminKyc from "@/pages/admin-kyc";
import AdminRechargeSettings from "@/pages/admin-recharge-settings";
import AdminReports from "@/pages/admin-reports";
import AdminManualTopups from "@/pages/admin-manual-topups";
import AdminCoupons from "@/pages/admin-coupons";
import Checkout from "@/pages/checkout";
import { AdminBackBar } from "@/components/admin-back-bar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, adminOnly = false, primeOnly = false }: { component: any, adminOnly?: boolean, primeOnly?: boolean }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  // Lazy Prime check — only fired when this route requires Prime AND the user is logged in.
  const { data: primeStatus, isLoading: primeLoading } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: primeOnly && !!user,
    staleTime: 60000,
  });
  const isPrime = !!primeStatus?.is_prime;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (adminOnly && !isAdminOrManager) {
      setLocation("/");
      return;
    }
    // Admins/managers may also preview Prime areas. Free users are bounced to /membership.
    if (primeOnly && !isAdminOrManager && !primeLoading && !isPrime) {
      setLocation("/membership");
    }
  }, [user, isLoading, setLocation, adminOnly, isAdminOrManager, primeOnly, isPrime, primeLoading]);

  if (isLoading || (primeOnly && !!user && primeLoading)) {
    return <div className="flex-1 flex items-center justify-center p-8">Loading...</div>;
  }

  if (!user) return null;
  if (adminOnly && !isAdminOrManager) return null;
  if (primeOnly && !isAdminOrManager && !isPrime) return null;

  if (adminOnly) {
    return (
      <>
        <AdminBackBar />
        <Component />
      </>
    );
  }
  return <Component />;
}

function Router() {
  return (
    <Layout>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/content" component={ContentList} />
        <Route path="/content/:id" component={ContentDetail} />
        <Route path="/membership" component={Membership} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/contact" component={Contact} />
        <Route path="/help" component={Contact} />
        <Route path="/reset-password" component={ResetPassword} />

        {/* Digital Service Tools */}
        <Route path="/tools" component={ToolsPage} />
        <Route path="/tools/pan-photo-resizer" component={PanPhotoResizer} />
        <Route path="/tools/signature-resizer" component={SignatureResizer} />
        <Route path="/tools/passport-photo-maker" component={PassportPhotoMaker} />
        <Route path="/tools/aadhaar-merger" component={AadhaarMerger} />
        <Route path="/tools/pdf-compressor" component={PdfCompressor} />
        <Route path="/tools/merge-pdf" component={MergePdf} />
        <Route path="/tools/jpg-to-pdf" component={JpgToPdf} />
        <Route path="/tools/background-remover" component={BackgroundRemover} />
        <Route path="/tools/dpi-converter" component={DpiConverter} />
        <Route path="/tools/image-compressor" component={ImageCompressor} />
        {/* Prime tools — fully usable by everyone (anonymous, free,
            Prime). The download / export action itself is gated via
            usePrimeDownloadGate inside each tool, so non-Prime users
            see a paywall modal at the moment they try to save the
            output instead of being bounced from the route. */}
        <Route path="/tools/image-upscaler" component={ImageUpscaler} />
        <Route path="/tools/passport-engine" component={PassportEngine} />
        <Route path="/tools/id-card-engine" component={IdCardEngine} />
        <Route path="/tools/split-pdf" component={SplitPdf} />
        <Route path="/tools/rotate-pdf" component={RotatePdf} />
        <Route path="/tools/pdf-to-jpg" component={PdfToJpg} />
        <Route path="/tools/esign-pdf" component={EsignPdf} />
        <Route path="/tools/watermark-pdf" component={WatermarkPdf} />
        <Route path="/tools/pdf-editor-v2" component={PdfEditorV2} />
        <Route path="/tools/prime-studio" component={PrimeStudioGate} />
        <Route path="/tools/delete-pages" component={DeletePages} />
        <Route path="/tools/pdf-to-text" component={PdfToText} />
        <Route path="/tools/lock-pdf" component={LockPdf} />
        <Route path="/tools/unlock-pdf" component={UnlockPdf} />
        <Route path="/tools/excel-to-pdf" component={ExcelToPdf} />
        <Route path="/tools/pdf-to-word" component={PdfToWord} />
        <Route path="/tools/word-to-pdf" component={WordToPdf} />

        {/* Protected User Routes */}
        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} primeOnly />}
        </Route>
        <Route path="/my-queries">
          {() => <ProtectedRoute component={Account} />}
        </Route>
        <Route path="/queries">
          {() => <ProtectedRoute component={Account} />}
        </Route>
        <Route path="/premium-dashboard">
          {() => <ProtectedRoute component={PremiumDashboard} primeOnly />}
        </Route>
        <Route path="/premium-services">
          {() => <ProtectedRoute component={PremiumDashboard} primeOnly />}
        </Route>
        <Route path="/account">
          {() => <ProtectedRoute component={Account} />}
        </Route>
        <Route path="/profile">
          {() => <ProtectedRoute component={Account} />}
        </Route>
        <Route path="/security">
          {() => <ProtectedRoute component={Account} />}
        </Route>
        <Route path="/certificate">
          {() => <ProtectedRoute component={Account} />}
        </Route>
        <Route path="/library">
          {() => <ProtectedRoute component={Documents} />}
        </Route>
        <Route path="/payment/success">
          {() => <ProtectedRoute component={PaymentSuccess} />}
        </Route>
        <Route path="/payment/pending">
          {() => <ProtectedRoute component={PaymentPending} />}
        </Route>
        
        {/* Protected Admin/Manager Routes */}
        <Route path="/admin">
          {() => <ProtectedRoute component={AdminDashboard} adminOnly />}
        </Route>
        <Route path="/admin/users">
          {() => <ProtectedRoute component={AdminUsers} adminOnly />}
        </Route>
        <Route path="/admin/content">
          {() => <ProtectedRoute component={AdminContent} adminOnly />}
        </Route>
        <Route path="/admin/payments">
          {() => <ProtectedRoute component={AdminPayments} adminOnly />}
        </Route>
        <Route path="/admin/documents">
          {() => <ProtectedRoute component={AdminDocuments} adminOnly />}
        </Route>
        <Route path="/admin/reviews">
          {() => <ProtectedRoute component={AdminReviews} adminOnly />}
        </Route>
        <Route path="/admin/inquiries">
          {() => <ProtectedRoute component={AdminInquiries} adminOnly />}
        </Route>

        {/* Recharge Portal — User */}
        <Route path="/wallet">{() => <ProtectedRoute component={WalletPage} />}</Route>
        <Route path="/wallet/add">{() => <ProtectedRoute component={WalletAdd} />}</Route>
        <Route path="/wallet/return">{() => <ProtectedRoute component={WalletReturn} />}</Route>
        <Route path="/recharge">{() => <ProtectedRoute component={RechargeHub} />}</Route>
        <Route path="/recharge/mobile">{() => <ProtectedRoute component={RechargeMobile} />}</Route>
        <Route path="/recharge/dth">{() => <ProtectedRoute component={RechargeDth} />}</Route>
        <Route path="/recharge/bill">{() => <ProtectedRoute component={RechargeBill} />}</Route>
        <Route path="/recharge/history">{() => <ProtectedRoute component={RechargeHistory} />}</Route>
        <Route path="/recharge/receipt/:id">{() => <ProtectedRoute component={RechargeReceipt} />}</Route>
        <Route path="/recharge/daybook">{() => <ProtectedRoute component={RechargeDayBook} />}</Route>
        <Route path="/recharge/ledger">{() => <ProtectedRoute component={RechargeLedger} />}</Route>
        <Route path="/recharge/earning">{() => <ProtectedRoute component={RechargeEarning} />}</Route>
        <Route path="/recharge/search">{() => <ProtectedRoute component={RechargeSearch} />}</Route>
        <Route path="/kyc">{() => <ProtectedRoute component={KycPage} />}</Route>

        {/* Recharge Portal — Admin */}
        <Route path="/admin/recharge">{() => <ProtectedRoute component={AdminRecharge} adminOnly />}</Route>
        <Route path="/admin/commission">{() => <ProtectedRoute component={AdminCommission} adminOnly />}</Route>
        <Route path="/admin/wallets">{() => <ProtectedRoute component={AdminWallets} adminOnly />}</Route>
        <Route path="/admin/kyc">{() => <ProtectedRoute component={AdminKyc} adminOnly />}</Route>
        <Route path="/admin/recharge-settings">{() => <ProtectedRoute component={AdminRechargeSettings} adminOnly />}</Route>
        <Route path="/admin/reports">{() => <ProtectedRoute component={AdminReports} adminOnly />}</Route>
        <Route path="/admin/manual-topups">{() => <ProtectedRoute component={AdminManualTopups} adminOnly />}</Route>
        <Route path="/admin/coupons">{() => <ProtectedRoute component={AdminCoupons} adminOnly />}</Route>

        {/* Checkout — billing details + coupon before payment gateway */}
        <Route path="/checkout/:scope/:planId">{() => <ProtectedRoute component={Checkout} />}</Route>

        <Route path="/news/:id" component={NewsReader} />
        <Route path="/documents">
          {() => <Documents />}
        </Route>
        
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <LanguageProvider>
            <AuthProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </AuthProvider>
          </LanguageProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
