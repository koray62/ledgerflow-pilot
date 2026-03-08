import { useState } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import {
  BookOpen, LayoutDashboard, BookText, Receipt, TrendingUp,
  Building2, Users, CreditCard, FileText, Settings, LogOut,
  ChevronLeft, Menu, Scale, BarChart3, Activity, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import HelpChatbot from "@/components/dashboard/HelpChatbot";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const navItems = [
  { title: "Overview", icon: LayoutDashboard, path: "/dashboard" },
  { title: "Chart of Accounts", icon: BookText, path: "/dashboard/accounts" },
  { title: "Journal Entries", icon: FileText, path: "/dashboard/journal" },
  { title: "Bank Accounts", icon: CreditCard, path: "/dashboard/banks" },
];

const financialStatements = [
  { title: "Balance Sheet", icon: Scale, path: "/dashboard/balance-sheet" },
  { title: "Income Statement", icon: BarChart3, path: "/dashboard/income-statement" },
  { title: "Cash Flow", icon: TrendingUp, path: "/dashboard/cashflow" },
];

const navItemsBottom = [
  { title: "Performance", icon: Activity, path: "/dashboard/performance" },
  { title: "Vendors & Customers", icon: Building2, path: "/dashboard/contacts" },
  { title: "Invoices", icon: Receipt, path: "/dashboard/invoices" },
  { title: "Team", icon: Users, path: "/dashboard/team" },
  { title: "Settings", icon: Settings, path: "/dashboard/settings" },
];

const DashboardLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <TenantProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
            collapsed ? "w-16" : "w-60"
          )}
        >
          {/* Logo */}
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md gradient-accent">
              <BookOpen className="h-3.5 w-3.5 text-accent-foreground" />
            </div>
            {!collapsed && (
              <span className="text-sm font-bold text-sidebar-accent-foreground">LedgerPilot</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className="ml-auto h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              {collapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              );
            })}

            {/* Financial Statements accordion */}
            <Collapsible defaultOpen={financialStatements.some(i => location.pathname === i.path)}>
              <CollapsibleTrigger className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                financialStatements.some(i => location.pathname === i.path) && "text-sidebar-primary font-medium"
              )}>
                <FileText className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">Financial Statements</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  </>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 space-y-1 border-l border-sidebar-border pl-2 mt-1">
                  {financialStatements.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-primary font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {navItemsBottom.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Upgrade banner */}
          {!collapsed && (
            <div className="m-3 rounded-lg border border-accent/20 bg-accent/5 p-3">
              <p className="text-xs font-semibold text-sidebar-accent-foreground">Free Trial</p>
              <p className="mt-1 text-xs text-sidebar-foreground">12 days remaining</p>
              <Button variant="hero" size="sm" className="mt-2 w-full text-xs">
                Upgrade Plan
              </Button>
            </div>
          )}

          {/* Sign out */}
          <div className="border-t border-sidebar-border p-2">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <HelpChatbot />
      </div>
    </TenantProvider>
  );
};

export default DashboardLayout;
