import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout.jsx";
import ScrollToTop from "./components/routing/ScrollToTop.jsx";
import ProtectedRoute from "./components/routing/ProtectedRoute.jsx";
import RouteFallback from "./components/routing/RouteFallback.jsx";
import { ThemeProvider } from "./providers/ThemeProvider.jsx";
import { AuthProvider } from "./providers/AuthProvider.jsx";
import { LiveStatusProvider } from "./providers/LiveStatusProvider.jsx";

// Rotas com lazy loading: cada página vira um chunk isolado.
const Live          = lazy(() => import("./pages/Live.jsx"));
const Catalog       = lazy(() => import("./pages/Catalog.jsx"));
const MatchPage     = lazy(() => import("./pages/MatchPage.jsx"));
const AdminLogin    = lazy(() => import("./pages/AdminLogin.jsx"));
const AdminLayout   = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const Dashboard     = lazy(() => import("./pages/admin/Dashboard.jsx"));
const Streams       = lazy(() => import("./pages/admin/Streams.jsx"));
const StreamDetail  = lazy(() => import("./pages/admin/StreamDetail.jsx"));
const StreamCamera  = lazy(() => import("./pages/admin/StreamCamera.jsx"));
const Recordings    = lazy(() => import("./pages/admin/Recordings.jsx"));
const Modalities    = lazy(() => import("./pages/admin/Modalities.jsx"));
const SystemPage    = lazy(() => import("./pages/admin/System.jsx"));
const StoragePage   = lazy(() => import("./pages/admin/Storage.jsx"));
const Athletes      = lazy(() => import("./pages/AthleteShowcase.jsx"));
const AthleteNew    = lazy(() => import("./pages/AthleteSubmit.jsx"));
const Athlete       = lazy(() => import("./pages/AthletePage.jsx"));
const Scout         = lazy(() => import("./pages/ScoutPage.jsx"));
const AdminAthletes = lazy(() => import("./pages/admin/Athletes.jsx"));
const AdminClasses  = lazy(() => import("./pages/admin/Classes.jsx"));
const NotFound      = lazy(() => import("./pages/NotFound.jsx"));

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LiveStatusProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Navigate to="/live" replace />} />
                  <Route path="/live" element={<Live />} />
                  <Route path="/live/:slug" element={<Live />} />
                  <Route path="/catalogo" element={<Catalog />} />
                  <Route path="/partidas/:id" element={<MatchPage />} />
                  <Route path="/atletas" element={<Athletes />} />
                  <Route path="/atletas/novo" element={<AthleteNew />} />
                  <Route path="/atletas/:id" element={<Athlete />} />

                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <AdminLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="transmissoes" element={<Streams />} />
                    <Route path="transmissoes/:id" element={<StreamDetail />} />
                    <Route path="transmissoes/:id/camera" element={<StreamCamera />} />
                    <Route path="gravacoes" element={<Recordings />} />
                    <Route path="atletas" element={<AdminAthletes />} />
                    <Route path="modalidades" element={<Modalities />} />
                    <Route path="turmas" element={<AdminClasses />} />
                    <Route path="armazenamento" element={<StoragePage />} />
                    <Route path="sistema" element={<SystemPage />} />
                  </Route>

                  <Route
                    path="/scout/:vodId"
                    element={
                      <ProtectedRoute>
                        <Scout />
                      </ProtectedRoute>
                    }
                  />

                  {/* Legado: redireciona /catalogo/:id para /partidas/:id. */}
                  <Route path="/catalogo/:id" element={<LegacyMatchRedirect />} />

                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </LiveStatusProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function LegacyMatchRedirect() {
  const url = new URL(window.location.href);
  const id = url.pathname.split("/").pop();
  return <Navigate to={`/partidas/${id}`} replace />;
}
