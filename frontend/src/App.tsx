import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const Admin = lazy(() => import('./pages/Admin'));
const AdminCatalog = lazy(() => import('./pages/AdminCatalog'));
const AdminLiveChat = lazy(() => import('./pages/AdminLiveChat'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'));
const AdminTeam = lazy(() => import('./pages/AdminTeam'));
const AdminAudit = lazy(() => import('./pages/AdminAudit'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#fefcf8]">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function EmptyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <ErrorBoundary>
                <Layout>
                  <Suspense fallback={
                    <div className="min-h-[50vh] flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-10 h-10 mx-auto rounded-xl bg-brand-100 flex items-center justify-center animate-pulse">
                          <div className="w-5 h-5 rounded-lg bg-brand-400" />
                        </div>
                        <p className="text-sm text-zinc-500 mt-3">Loading…</p>
                      </div>
                    </div>
                  }>
                    <Routes>
                    <Route path="/" element={<EmptyLayout><Landing /></EmptyLayout>} />
                    <Route path="/r" element={<Layout><Home /></Layout>} />
                    <Route path="/r/menu" element={<Layout><Menu /></Layout>} />
                    <Route path="/r/menu/item/:id" element={<Layout><Product /></Layout>} />
                    <Route path="/r/cart" element={<Layout><Cart /></Layout>} />
                    <Route path="/r/checkout" element={<Layout><Checkout /></Layout>} />
                    <Route path="/r/order/:id" element={<Layout><Order /></Layout>} />
                    <Route path="/r/offers" element={<Layout><Offers /></Layout>} />
                    <Route path="/r/locations" element={<Layout><Locations /></Layout>} />
                    <Route path="/r/about" element={<Layout><About /></Layout>} />
                    <Route path="/r/faq" element={<Layout><FAQ /></Layout>} />
                    <Route path="/r/contact" element={<Layout><Contact /></Layout>} />
                    <Route path="/r/privacy" element={<Layout><Privacy /></Layout>} />
                    <Route path="/r/terms" element={<Layout><Terms /></Layout>} />
                    <Route path="/r/login" element={<Layout><Login /></Layout>} />
                    <Route path="/r/account" element={<Layout><Account /></Layout>} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin/catalog" element={<AdminCatalog />} />
                    <Route path="/admin/chats" element={<AdminLiveChat />} />
                    <Route path="/admin/settings" element={<AdminSettings />} />
                    <Route path="/admin/analytics" element={<AdminAnalytics />} />
                  <Route path="/admin/team" element={<AdminTeam />} />
                  <Route path="/admin/logs" element={<AdminAudit />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </Layout>
            </ErrorBoundary>
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
