import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

export type PermissionKey =
  | "dashboard.view"
  | "accounts.view" | "accounts.edit" | "accounts.delete"
  | "journal_entries.view" | "journal_entries.edit" | "journal_entries.delete"
  | "invoices.view" | "invoices.edit" | "invoices.delete"
  | "banking.view" | "banking.edit" | "banking.delete"
  | "contacts.view" | "contacts.edit" | "contacts.delete"
  | "documents.view" | "documents.edit" | "documents.delete"
  | "reports.view"
  | "team.view" | "team.manage"
  | "settings.view" | "settings.edit" | "settings.close_fiscal_year" | "settings.manage_subscription";

interface PermissionRow {
  permission_key: string;
  allowed: boolean;
}

/**
 * Returns a `can(key)` function that checks if the current user
 * has the given permission based on tenant_permissions table.
 * Owner role always returns true as a safety net.
 */
export const usePermissions = () => {
  const { tenantId, role } = useTenant();

  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ["tenant-permissions", tenantId, role],
    enabled: !!tenantId && !!role,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_permissions")
        .select("permission_key, allowed")
        .eq("tenant_id", tenantId!)
        .eq("role", role! as any);
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
  });

  const permMap = new Map(permissions.map((p) => [p.permission_key, p.allowed]));

  const can = (key: PermissionKey): boolean => {
    // Owner always has full access as a safety net
    if (role === "owner") return true;
    return permMap.get(key) ?? false;
  };

  return { can, isLoading, permissions };
};
