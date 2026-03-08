import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TenantContextType {
  tenantId: string | null;
  tenantName: string | null;
  role: string | null;
  defaultCurrency: string;
  loading: boolean;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  tenantName: null,
  role: null,
  defaultCurrency: "USD",
  loading: true,
});

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTenantId(null);
      setTenantName(null);
      setRole(null);
      setDefaultCurrency("USD");
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
          .select("name, default_currency" as any)
          .eq("id", utr.tenant_id)
          .maybeSingle();

        setTenantName(tenant?.name ?? null);
        setDefaultCurrency((tenant as any)?.default_currency ?? "USD");
      }
      setLoading(false);
    };

    fetchTenant();
  }, [user]);

  return (
    <TenantContext.Provider value={{ tenantId, tenantName, role, defaultCurrency, loading }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);
