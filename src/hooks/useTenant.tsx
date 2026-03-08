import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TenantContextType {
  tenantId: string | null;
  tenantName: string | null;
  role: string | null;
  defaultCurrency: string;
  accountingBasis: string;
  loading: boolean;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  tenantName: null,
  role: null,
  defaultCurrency: "USD",
  accountingBasis: "accrual",
  loading: true,
});

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [accountingBasis, setAccountingBasis] = useState("accrual");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTenantId(null);
      setTenantName(null);
      setRole(null);
      setDefaultCurrency("USD");
      setAccountingBasis("accrual");
      setLoading(false);
      return;
    }

    const fetchTenant = async () => {
      setLoading(true);
      const { data: utr } = await supabase
        .from("user_tenant_roles")
        .select("tenant_id, role")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (utr) {
        setTenantId(utr.tenant_id);
        setRole(utr.role);

        const { data: tenant } = await supabase
          .from("tenants")
          .select("name, default_currency, accounting_basis")
          .eq("id", utr.tenant_id)
          .maybeSingle() as any;

        setTenantName(tenant?.name ?? null);
        setDefaultCurrency(tenant?.default_currency ?? "USD");
        setAccountingBasis(tenant?.accounting_basis ?? "accrual");
      }
      setLoading(false);
    };

    fetchTenant();
  }, [user]);

  return (
    <TenantContext.Provider value={{ tenantId, tenantName, role, defaultCurrency, accountingBasis, loading }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);
