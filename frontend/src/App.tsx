import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';
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
                    <Route path="/" element={<Home />} />
                    <Route path="/menu" element={<Menu />} />
                    <Route path="/menu/item/:id" element={<Product />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/order/:id" element={<Order />} />
                    <Route path="/offers" element={<Offers />} />
                    <Route path="/locations" element={<Locations />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/faq" element={<FAQ />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin/catalog" element={<AdminCatalog />} />
                    <Route path="/admin/chats" element={<AdminLiveChat />} />
                    <Route path="/admin/settings" element={<AdminSettings />} />
                    <Route path="/admin/analytics" element={<AdminAnalytics />} />
                  <Route path="/admin/team" element={<AdminTeam />} />
                  <Route path="/admin/logs" element={<AdminAudit />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/account" element={<Account />} />
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
