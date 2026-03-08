import { Check, X } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Permission = boolean;

interface PermissionRow {
  category: string;
  action: string;
  owner: Permission;
  admin: Permission;
  accountant: Permission;
  viewer: Permission;
}

const PERMISSIONS: PermissionRow[] = [
  // Dashboard
  { category: "Dashboard", action: "View dashboard overview", owner: true, admin: true, accountant: true, viewer: true },

  // Chart of Accounts
  { category: "Chart of Accounts", action: "View accounts", owner: true, admin: true, accountant: true, viewer: true },
  { category: "Chart of Accounts", action: "Create / edit accounts", owner: true, admin: true, accountant: true, viewer: false },
  { category: "Chart of Accounts", action: "Delete accounts", owner: true, admin: false, accountant: false, viewer: false },

  // Journal Entries
  { category: "Journal Entries", action: "View entries", owner: true, admin: true, accountant: true, viewer: true },
  { category: "Journal Entries", action: "Create / edit entries", owner: true, admin: true, accountant: true, viewer: false },
  { category: "Journal Entries", action: "Delete entries", owner: true, admin: false, accountant: false, viewer: false },

  // Invoices
  { category: "Invoices", action: "View invoices", owner: true, admin: true, accountant: true, viewer: true },
  { category: "Invoices", action: "Create / edit invoices", owner: true, admin: true, accountant: true, viewer: false },
  { category: "Invoices", action: "Delete invoices", owner: true, admin: false, accountant: false, viewer: false },

  // Bank Accounts & Transactions
  { category: "Banking", action: "View bank accounts & transactions", owner: true, admin: true, accountant: true, viewer: true },
  { category: "Banking", action: "Create / edit bank accounts", owner: true, admin: true, accountant: true, viewer: false },
  { category: "Banking", action: "Delete bank accounts", owner: true, admin: false, accountant: false, viewer: false },

  // Contacts (Customers & Vendors)
  { category: "Contacts", action: "View customers & vendors", owner: true, admin: true, accountant: true, viewer: true },
  { category: "Contacts", action: "Create / edit contacts", owner: true, admin: true, accountant: true, viewer: false },
  { category: "Contacts", action: "Delete contacts", owner: true, admin: false, accountant: false, viewer: false },

  // Documents / OCR
  { category: "Documents", action: "View documents", owner: true, admin: true, accountant: true, viewer: true },
  { category: "Documents", action: "Upload / process documents", owner: true, admin: true, accountant: true, viewer: false },
  { category: "Documents", action: "Delete documents", owner: true, admin: false, accountant: false, viewer: false },

  // Reports
  { category: "Reports", action: "View financial reports", owner: true, admin: true, accountant: true, viewer: true },

  // Team Management
  { category: "Team", action: "View team members", owner: true, admin: true, accountant: true, viewer: true },
  { category: "Team", action: "Invite / remove members", owner: true, admin: false, accountant: false, viewer: false },
  { category: "Team", action: "Change member roles", owner: true, admin: false, accountant: false, viewer: false },

  // Settings
  { category: "Settings", action: "View organization settings", owner: true, admin: true, accountant: true, viewer: true },
  { category: "Settings", action: "Edit organization settings", owner: true, admin: false, accountant: false, viewer: false },
  { category: "Settings", action: "Close fiscal year", owner: true, admin: false, accountant: false, viewer: false },
  { category: "Settings", action: "Manage subscription", owner: true, admin: false, accountant: false, viewer: false },
];

const PermIcon = ({ allowed }: { allowed: boolean }) =>
  allowed ? (
    <Check className="h-4 w-4 text-primary mx-auto" />
  ) : (
    <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
  );

const ROLE_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  Owner: "default",
  Admin: "secondary",
  Accountant: "outline",
  Viewer: "outline",
};

export default function AccessRightsTable() {
  let lastCategory = "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Access Rights by Role</CardTitle>
        <CardDescription>Overview of permissions for each role in the organization.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-md border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Permission</TableHead>
                {["Owner", "Admin", "Accountant", "Viewer"].map((role) => (
                  <TableHead key={role} className="text-center w-[100px]">
                    <Badge variant={ROLE_COLORS[role]} className="capitalize">
                      {role}
                    </Badge>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSIONS.map((p, i) => {
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
                    <TableRow key={i}>
                      <TableCell className="text-sm">{p.action}</TableCell>
                      <TableCell className="text-center"><PermIcon allowed={p.owner} /></TableCell>
                      <TableCell className="text-center"><PermIcon allowed={p.admin} /></TableCell>
                      <TableCell className="text-center"><PermIcon allowed={p.accountant} /></TableCell>
                      <TableCell className="text-center"><PermIcon allowed={p.viewer} /></TableCell>
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
