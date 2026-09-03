import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';
import Landing from './pages/Landing';
import Home from './pages/Home';
import Menu from './pages/Menu';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Order from './pages/Order';
import About from './pages/About';
import Offers from './pages/Offers';
import Locations from './pages/Locations';
import FAQ from './pages/FAQ';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Login from './pages/Login';
import Account from './pages/Account';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { RestaurantProvider } from './context/RestaurantContext';
import { SiteSettingsProvider } from './context/SiteSettingsContext';
import { CrustProvider } from './context/CrustContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const Admin = lazy(() => import('./pages/Admin'));
const AdminCatalog = lazy(() => import('./pages/AdminCatalog'));
const AdminLiveChat = lazy(() => import('./pages/AdminLiveChat'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'));
const AdminTeam = lazy(() => import('./pages/AdminTeam'));
const AdminAudit = lazy(() => import('./pages/AdminAudit'));
const AdminBrand = lazy(() => import('./pages/AdminBrand'));
const AdminPages = lazy(() => import('./pages/AdminPages'));
const AdminOffers = lazy(() => import('./pages/AdminOffers'));
const AdminBanners = lazy(() => import('./pages/AdminBanners'));
const AdminFamilyPacks = lazy(() => import('./pages/AdminFamilyPacks'));
const AdminReviews = lazy(() => import('./pages/AdminReviews'));
const AdminBotWorkflows = lazy(() => import('./pages/AdminBotWorkflows'));
const AdminBusinessConfig = lazy(() => import('./pages/AdminBusinessConfig'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function PageShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`page-enter ${className}`}>
      {children}
    </div>
  );
}

function AdminPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-enter">
      {children}
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#fefcf8]">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function AdminSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-900 flex items-center justify-center animate-pulse">
            <div className="w-6 h-6 rounded-lg bg-white/20" />
          </div>
          <p className="text-sm text-zinc-500 mt-3 font-medium">Loading…</p>
        </div>
      </div>
    }>
      {children}
    </Suspense>
  );
}

function AppRoutes() {
  const location = useLocation();

  return (
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={<PageShell><Landing /></PageShell>} />
      <Route path="/r" element={<PageShell><Layout><Home /></Layout></PageShell>} />
      <Route path="/r/menu" element={<PageShell><Layout><Menu /></Layout></PageShell>} />
      <Route path="/r/menu/item/:id" element={<PageShell><Layout><Product /></Layout></PageShell>} />
      <Route path="/r/cart" element={<PageShell><Layout><Cart /></Layout></PageShell>} />
      <Route path="/r/checkout" element={<PageShell><Layout><Checkout /></Layout></PageShell>} />
      <Route path="/r/order/:id" element={<PageShell><Layout><Order /></Layout></PageShell>} />
      <Route path="/r/offers" element={<PageShell><Layout><Offers /></Layout></PageShell>} />
      <Route path="/r/locations" element={<PageShell><Layout><Locations /></Layout></PageShell>} />
      <Route path="/r/about" element={<PageShell><Layout><About /></Layout></PageShell>} />
      <Route path="/r/faq" element={<PageShell><Layout><FAQ /></Layout></PageShell>} />
      <Route path="/r/contact" element={<PageShell><Layout><Contact /></Layout></PageShell>} />
      <Route path="/r/privacy" element={<PageShell><Layout><Privacy /></Layout></PageShell>} />
      <Route path="/r/terms" element={<PageShell><Layout><Terms /></Layout></PageShell>} />
      <Route path="/r/login" element={<PageShell><Layout><Login /></Layout></PageShell>} />
      <Route path="/r/account" element={<PageShell><Layout><Account /></Layout></PageShell>} />
      <Route path="/admin" element={<AdminSuspense><AdminPageShell><Admin /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/catalog" element={<AdminSuspense><AdminPageShell><AdminCatalog /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/chats" element={<AdminSuspense><AdminPageShell><AdminLiveChat /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/settings" element={<AdminSuspense><AdminPageShell><AdminSettings /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/analytics" element={<AdminSuspense><AdminPageShell><AdminAnalytics /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/team" element={<AdminSuspense><AdminPageShell><AdminTeam /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/logs" element={<AdminSuspense><AdminPageShell><AdminAudit /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/brand" element={<AdminSuspense><AdminPageShell><AdminBrand /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/pages" element={<AdminSuspense><AdminPageShell><AdminPages /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/offers" element={<AdminSuspense><AdminPageShell><AdminOffers /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/banners" element={<AdminSuspense><AdminPageShell><AdminBanners /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/family-packs" element={<AdminSuspense><AdminPageShell><AdminFamilyPacks /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/reviews" element={<AdminSuspense><AdminPageShell><AdminReviews /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/bot-workflows" element={<AdminSuspense><AdminPageShell><AdminBotWorkflows /></AdminPageShell></AdminSuspense>} />
      <Route path="/admin/business-config" element={<AdminSuspense><AdminPageShell><AdminBusinessConfig /></AdminPageShell></AdminSuspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <CrustProvider>
            <ToastProvider>
              <RestaurantProvider>
              <SiteSettingsProvider>
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
              </SiteSettingsProvider>
              </RestaurantProvider>
            </ToastProvider>
            </CrustProvider>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
