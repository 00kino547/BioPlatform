import { lazy, Suspense, useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DomainProvider, useDomain } from "@/contexts/DomainContext";
import { branding } from "@/config/branding";
import { usePageMeta, useJsonLd } from "@/lib/seo";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Navbar } from "@/components/layout/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Showcase } from "@/components/landing/Showcase";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";

const Login = lazy(() => import("@/pages/Login").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("@/pages/Register").then((m) => ({ default: m.Register })));
const Unlock = lazy(() => import("@/pages/Unlock").then((m) => ({ default: m.Unlock })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const PublicProfilePage = lazy(() => import("@/pages/PublicProfile").then((m) => ({ default: m.PublicProfilePage })));
const Privacy = lazy(() => import("@/pages/Privacy").then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import("@/pages/Terms").then((m) => ({ default: m.Terms })));
const ApiDocs = lazy(() => import("@/pages/ApiDocs").then((m) => ({ default: m.ApiDocs })));

function Landing() {
  usePageMeta({
    title: `${branding.name} — ${branding.tagline}`,
    description: branding.description,
    url: "/",
  });
  const origin = useMemo(() => window.location.origin.replace(/\/+$/, ""), []);
  const softwareJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: branding.name,
      description: branding.description,
      url: origin,
      applicationCategory: "WebApplication",
      operatingSystem: "Web",
    }),
    [origin]
  );
  const websiteJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: branding.name,
      description: branding.description,
      url: origin,
    }),
    [origin]
  );
  useJsonLd("software-app", softwareJsonLd);
  useJsonLd("website", websiteJsonLd);
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}

function CustomDomainRoot() {
  const { info, loading } = useDomain();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </div>
    );
  }

  if (info?.active && info.slug) {
    return <Navigate to={`/${info.slug}`} replace />;
  }

  return <Landing />;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function PageFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DomainProvider>
          <div className="min-h-screen bg-background text-foreground">
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<CustomDomainRoot />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/unlock" element={<Unlock />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminGuard>
                        <AdminDashboard />
                      </AdminGuard>
                    </ProtectedRoute>
                  }
                />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/api-docs" element={<ApiDocs />} />
                <Route path="/:username" element={<PublicProfilePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </DomainProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
