import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLES: AppRole[] = ["owner", "admin", "accountant", "viewer"];

interface PermRow {
  id: string;
  role: AppRole;
  permission_key: string;
  allowed: boolean;
}

/** Human-readable labels for permission keys, grouped by category */
const PERMISSION_DISPLAY: { category: string; key: string; label: string }[] = [
  { category: "Dashboard", key: "dashboard.view", label: "View dashboard overview" },
  { category: "Chart of Accounts", key: "accounts.view", label: "View accounts" },
  { category: "Chart of Accounts", key: "accounts.edit", label: "Create / edit accounts" },
  { category: "Chart of Accounts", key: "accounts.delete", label: "Delete accounts" },
  { category: "Journal Entries", key: "journal_entries.view", label: "View entries" },
  { category: "Journal Entries", key: "journal_entries.edit", label: "Create / edit entries" },
  { category: "Journal Entries", key: "journal_entries.delete", label: "Delete entries" },
  { category: "Invoices", key: "invoices.view", label: "View invoices" },
  { category: "Invoices", key: "invoices.edit", label: "Create / edit invoices" },
  { category: "Invoices", key: "invoices.delete", label: "Delete invoices" },
  { category: "Banking", key: "banking.view", label: "View bank accounts & transactions" },
  { category: "Banking", key: "banking.edit", label: "Create / edit bank accounts" },
  { category: "Banking", key: "banking.delete", label: "Delete bank accounts" },
  { category: "Contacts", key: "contacts.view", label: "View customers & vendors" },
  { category: "Contacts", key: "contacts.edit", label: "Create / edit contacts" },
  { category: "Contacts", key: "contacts.delete", label: "Delete contacts" },
  { category: "Documents", key: "documents.view", label: "View documents" },
  { category: "Documents", key: "documents.edit", label: "Upload / process documents" },
  { category: "Documents", key: "documents.delete", label: "Delete documents" },
  { category: "Reports", key: "reports.view", label: "View financial reports" },
  { category: "AI Assistant", key: "chatbot.use", label: "Use accounting chatbot" },
  { category: "Team", key: "team.view", label: "View team members" },
  { category: "Team", key: "team.manage", label: "Invite / remove members" },
  { category: "Settings", key: "settings.view", label: "View organization settings" },
  { category: "Settings", key: "settings.edit", label: "Edit organization settings" },
  { category: "Settings", key: "settings.close_fiscal_year", label: "Close fiscal year" },
  { category: "Settings", key: "settings.manage_subscription", label: "Manage subscription" },
];

const ROLE_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  accountant: "outline",
  viewer: "outline",
};

export default function AccessRightsTable() {
  const { tenantId, role: currentUserRole } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOwner = currentUserRole === "owner";
  const [updating, setUpdating] = useState<string | null>(null);

  const { data: allPerms = [], isLoading } = useQuery({
    queryKey: ["all-tenant-permissions", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_permissions")
        .select("id, role, permission_key, allowed")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });

  // Build lookup: role+key → { id, allowed }
  const permLookup = new Map<string, PermRow>();
  for (const p of allPerms) {
    permLookup.set(`${p.role}:${p.permission_key}`, p);
  }

  const getPermission = (role: AppRole, key: string): boolean => {
    return permLookup.get(`${role}:${key}`)?.allowed ?? false;
  };

  const handleToggle = async (role: AppRole, key: string, newValue: boolean) => {
    // Owner permissions are always true and can't be changed
    if (role === "owner") return;
    const perm = permLookup.get(`${role}:${key}`);
    if (!perm) return;

    const uid = `${role}:${key}`;
    setUpdating(uid);
    try {
      const { error } = await supabase
        .from("tenant_permissions")
        .update({ allowed: newValue })
        .eq("id", perm.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["all-tenant-permissions", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["tenant-permissions", tenantId] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Access Rights by Role</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  let lastCategory = "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Access Rights by Role</CardTitle>
        <CardDescription>
          {isOwner
            ? "Toggle switches to customize permissions for each role."
            : "Overview of permissions for each role in the organization."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-md border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">Permission</TableHead>
                {ROLES.map((role) => (
                  <TableHead key={role} className="text-center w-[110px]">
                    <Badge variant={ROLE_BADGE[role]} className="capitalize">
                      {role}
                    </Badge>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_DISPLAY.map((p, i) => {
                const showCategory = p.category !== lastCategory;
                lastCategory = p.category;
                return (
                  <>
                    {showCategory && (
                      <TableRow key={`cat-${p.category}`} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={5} className="font-semibold text-xs uppercase tracking-wide text-muted-foreground py-2">
                          {p.category}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow key={`perm-${i}`}>
                      <TableCell className="text-sm">{p.label}</TableCell>
                      {ROLES.map((role) => {
                        const allowed = role === "owner" ? true : getPermission(role, p.key);
                        const isToggling = updating === `${role}:${p.key}`;

                        return (
                          <TableCell key={role} className="text-center">
                            {isOwner && role !== "owner" ? (
                              <Switch
                                checked={allowed}
                                onCheckedChange={(v) => handleToggle(role, p.key, v)}
                                disabled={isToggling}
                                className="mx-auto"
                              />
                            ) : allowed ? (
                              <Check className="h-4 w-4 text-primary mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
