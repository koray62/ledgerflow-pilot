import { useState } from "react";
import { formatDisplayDate } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, MoreHorizontal, UserPlus, Shield, Trash2, Check } from "lucide-react";
import AccessRightsTable from "@/components/dashboard/AccessRightsTable";
import { usePermissions } from "@/hooks/usePermissions";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLES = Constants.public.Enums.app_role;

const roleBadgeVariant = (role: AppRole) => {
  switch (role) {
    case "owner": return "default";
    case "admin": return "secondary";
    case "accountant": return "outline";
    case "viewer": return "outline";
    default: return "outline";
  }
};

interface TeamMember {
  user_id: string;
  role: AppRole;
  created_at: string;
  profile: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

export default function Team() {
  const { tenantId, role: currentUserRole, defaultCurrency } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Invite form state
  const [invEmail, setInvEmail] = useState("");
  const [invFirst, setInvFirst] = useState("");
  const [invLast, setInvLast] = useState("");
  const [invPassword, setInvPassword] = useState("");
  const [invRole, setInvRole] = useState<AppRole>("viewer");

  // Edit role state
  const [editRole, setEditRole] = useState<AppRole>("viewer");

  const isOwner = currentUserRole === "owner";
  const canManageTeam = can("team.manage");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-members", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("user_tenant_roles")
        .select("user_id, role, created_at, profiles:user_id(first_name, last_name, email)")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);

      if (error) throw error;

      return (data || []).map((d: any) => ({
        user_id: d.user_id,
        role: d.role as AppRole,
        created_at: d.created_at,
        profile: d.profiles,
      })) as TeamMember[];
    },
    enabled: !!tenantId,
  });

  const filtered = members.filter((m) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const name = `${m.profile?.first_name || ""} ${m.profile?.last_name || ""}`.toLowerCase();
    const email = (m.profile?.email || "").toLowerCase();
    return name.includes(s) || email.includes(s);
  });

  const callEdgeFunction = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-team-member", {
      body: { ...body, tenantId },
    });
    if (error) throw new Error(error.message || "Request failed");
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleInvite = async () => {
    if (!invEmail || !invPassword || !invRole) return;
    setSubmitting(true);
    try {
      await callEdgeFunction({
        action: "invite",
        email: invEmail,
        firstName: invFirst,
        lastName: invLast,
        password: invPassword,
        role: invRole,
      });
      toast({ title: "Member invited", description: `${invEmail} has been added to the team.` });
      setInviteOpen(false);
      resetInviteForm();
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingMember) return;
    setSubmitting(true);
    try {
      await callEdgeFunction({
        action: "update-role",
        userId: editingMember.user_id,
        role: editRole,
      });
      toast({ title: "Role updated" });
      setEditingMember(null);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!removingMember) return;
    setSubmitting(true);
    try {
      await callEdgeFunction({
        action: "remove",
        userId: removingMember.user_id,
      });
      toast({ title: "Member removed" });
      setRemovingMember(null);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const resetInviteForm = () => {
    setInvEmail("");
    setInvFirst("");
    setInvLast("");
    setInvPassword("");
    setInvRole("viewer");
  };

  const openEditRole = (m: TeamMember) => {
    setEditRole(m.role);
    setEditingMember(m);
  };

  const memberName = (m: TeamMember) => {
    const f = m.profile?.first_name || "";
    const l = m.profile?.last_name || "";
    return (f + " " + l).trim() || m.profile?.email || "Unknown";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team</h1>
          <p className="text-muted-foreground">Manage team members and roles</p>
        </div>
        {canManageTeam && (
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Invite Member
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {canManageTeam && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={canManageTeam ? 5 : 4} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManageTeam ? 5 : 4} className="text-center py-8 text-muted-foreground">
                  No team members found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const isSelf = m.user_id === user?.id;
                return (
                  <TableRow key={m.user_id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      {memberName(m)}
                      {isSelf && <Check className="h-4 w-4 text-primary" />}
                    </TableCell>
                    <TableCell>{m.profile?.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(m.role)} className="capitalize">
                        {m.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDisplayDate(m.created_at, defaultCurrency)}</TableCell>
                    {canManageTeam && (
                      <TableCell>
                        {!isSelf && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditRole(m)}>
                                <Shield className="mr-2 h-4 w-4" /> Change Role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setRemovingMember(m)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) resetInviteForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>Add a new member to your organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={invFirst} onChange={(e) => setInvFirst(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={invLast} onChange={(e) => setInvLast(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Temporary Password *</Label>
              <Input type="password" value={invPassword} onChange={(e) => setInvPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={invRole} onValueChange={(v) => setInvRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r !== "owner").map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={submitting || !invEmail || !invPassword}>
              <UserPlus className="mr-2 h-4 w-4" /> {submitting ? "Inviting..." : "Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingMember} onOpenChange={(o) => { if (!o) setEditingMember(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for {editingMember ? memberName(editingMember) : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
            <Button onClick={handleUpdateRole} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Access Rights Table */}
      <AccessRightsTable />

      {/* Remove Confirmation */}
      <AlertDialog open={!!removingMember} onOpenChange={(o) => { if (!o) setRemovingMember(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {removingMember ? memberName(removingMember) : ""}? They will lose access to this organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={submitting}>
              {submitting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
