import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import { PlaceholderPage } from "./pages/Placeholder";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route
                path="/onboarding"
                element={<ProtectedRoute requireOnboarded={false}><Onboarding /></ProtectedRoute>}
              />
              <Route
                path="/dashboard"
                element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
              />
              <Route
                path="/recommendations"
                element={<ProtectedRoute><PlaceholderPage title="Recommendations" breadcrumb="Home / Recommendations" /></ProtectedRoute>}
              />
              <Route
                path="/schedule"
                element={<ProtectedRoute><PlaceholderPage title="Schedule" breadcrumb="Home / Schedule" /></ProtectedRoute>}
              />
              <Route
                path="/insights"
                element={<ProtectedRoute><PlaceholderPage title="Insights" breadcrumb="Home / Insights" /></ProtectedRoute>}
              />
              <Route
                path="/chat"
                element={<ProtectedRoute><PlaceholderPage title="Chat" breadcrumb="Home / Chat" /></ProtectedRoute>}
              />
              <Route
                path="/settings"
                element={<ProtectedRoute><PlaceholderPage title="Settings" breadcrumb="Home / Settings" /></ProtectedRoute>}
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
