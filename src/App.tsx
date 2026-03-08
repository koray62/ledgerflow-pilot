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
import Contacts from "./pages/dashboard/Contacts";
import DashboardSettings from "./pages/dashboard/DashboardSettings";
import PlaceholderPage from "./components/dashboard/PlaceholderPage";
import BankAccounts from "./pages/dashboard/BankAccounts";
import Invoices from "./pages/dashboard/Invoices";
import Team from "./pages/dashboard/Team";
import BalanceSheet from "./pages/dashboard/BalanceSheet";
import IncomeStatement from "./pages/dashboard/IncomeStatement";
import PerformanceAnalysis from "./pages/dashboard/PerformanceAnalysis";

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
              
              <Route path="settings" element={<DashboardSettings />} />
              <Route path="banks" element={<BankAccounts />} />
              <Route path="balance-sheet" element={<BalanceSheet />} />
              <Route path="income-statement" element={<IncomeStatement />} />
              <Route path="performance" element={<PerformanceAnalysis />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="team" element={<Team />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
