import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LandingPage } from './components/LandingPage';
import { SubscriptionForm } from './components/SubscriptionForm';
import { SubscriptionPending } from './components/SubscriptionPending';
import { Login } from './components/Login';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import { ReaderDashboard } from './components/ReaderDashboard';
import { ReaderRouter } from './components/ReaderRouter';
import { PaymentStatus } from './components/PaymentStatus';

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mb-4"></div>
          <p className="text-gray-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin-login" replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/my-account" replace />;
  }

  return <>{children}</>;
}

function ProtectedReaderRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mb-4"></div>
          <p className="text-gray-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/subscribe" element={<SubscriptionForm />} />
      <Route path="/subscription-pending" element={<SubscriptionPending />} />
      <Route path="/payment-status" element={<PaymentStatus />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin-login" element={<AdminLogin />} />

      <Route
        path="/admin"
        element={
          <ProtectedAdminRoute>
            <AdminDashboard />
          </ProtectedAdminRoute>
        }
      />

      <Route
        path="/my-account"
        element={
          <ProtectedReaderRoute>
            <ReaderDashboard />
          </ProtectedReaderRoute>
        }
      />

      <Route path="/read/:token" element={<ReaderRouterWrapper />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function ReaderRouterWrapper() {
  const params = window.location.pathname.match(/^\/read\/(.+)$/);
  const token = params ? params[1] : '';

  if (!token) {
    return <Navigate to="/" replace />;
  }

  return <ReaderRouter token={token} />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
