import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import './index.css';
import { ToastProvider } from './lib/toast';
import { AppProvider, useSettingsQuery } from './lib/app';
import { ApiError, api, getToken } from './lib/api';
import { Layout } from './components/Layout';
import { ErrorState, Loading } from './components/ui';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Animals } from './pages/Animals';
import { AnimalDetail } from './pages/AnimalDetail';
import { Milk } from './pages/Milk';
import { Feed } from './pages/Feed';
import { Sales } from './pages/Sales';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500 && e.status !== 0) && n < 2, refetchOnWindowFocus: true, staleTime: 15_000 } },
});

function Shell() {
  const settings = useSettingsQuery();
  if (settings.isLoading) return <div className="grid min-h-dvh place-items-center"><Loading label="Ferma yuklanmoqda…" /></div>;
  if (settings.error || !settings.data) return <div className="grid min-h-dvh place-items-center"><ErrorState error={settings.error} onRetry={() => settings.refetch()} /></div>;
  return (
    <AppProvider settings={settings.data}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mollar" element={<Animals />} />
          <Route path="/mollar/:id" element={<AnimalDetail />} />
          <Route path="/sut" element={<Milk />} />
          <Route path="/yemish" element={<Feed />} />
          <Route path="/sotuvlar" element={<Sales />} />
          <Route path="/hisobotlar" element={<Reports />} />
          <Route path="/sozlamalar" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AppProvider>
  );
}

function AuthGate() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.get<{ authRequired: boolean; db: string }>('/health'), staleTime: Infinity });
  useEffect(() => {
    const onAuth = () => { setAuthed(false); queryClient.clear(); };
    window.addEventListener('ferma:auth-required', onAuth);
    return () => window.removeEventListener('ferma:auth-required', onAuth);
  }, []);
  if (health.isLoading) return <div className="grid min-h-dvh place-items-center"><Loading label="Ulanmoqda…" /></div>;
  if (health.error) return <div className="grid min-h-dvh place-items-center"><ErrorState error={health.error} onRetry={() => health.refetch()} /></div>;
  if (health.data?.authRequired && !authed) return <Login onSuccess={() => setAuthed(true)} />;
  return <Shell />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthGate />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
