import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import DashboardOverview from "./pages/dashboard/DashboardOverview";
import ChartOfAccounts from "./pages/dashboard/ChartOfAccounts";
import JournalEntries from "./pages/dashboard/JournalEntries";
import CashFlow from "./pages/dashboard/CashFlow";
import OCRUpload from "./pages/dashboard/OCRUpload";
import DashboardSettings from "./pages/dashboard/DashboardSettings";
import PlaceholderPage from "./components/dashboard/PlaceholderPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<DashboardOverview />} />
              <Route path="accounts" element={<ChartOfAccounts />} />
              <Route path="journal" element={<JournalEntries />} />
              <Route path="cashflow" element={<CashFlow />} />
              <Route path="ocr" element={<OCRUpload />} />
              <Route path="settings" element={<DashboardSettings />} />
              <Route path="banks" element={<PlaceholderPage title="Bank Accounts" description="Manage connected bank accounts and transactions" />} />
              <Route path="invoices" element={<PlaceholderPage title="Invoices & Bills" description="Track accounts receivable and payable" />} />
              <Route path="contacts" element={<PlaceholderPage title="Vendors & Customers" description="Manage your business contacts" />} />
              <Route path="team" element={<PlaceholderPage title="Team" description="Manage team members and roles" />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
