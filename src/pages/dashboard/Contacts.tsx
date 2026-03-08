import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Search, Pencil, Trash2, Building2, Users, Loader2, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

/* ------------------------------------------------------------------ */
/* Shared form fields                                                  */
/* ------------------------------------------------------------------ */
interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  contact_person: string;
  tax_id: string;
  payment_terms: string;
  notes: string;
}

const emptyForm: ContactFormData = {
  name: "", email: "", phone: "", address: "",
  contact_person: "", tax_id: "", payment_terms: "30", notes: "",
};

/* ------------------------------------------------------------------ */
/* Contact Form Dialog                                                 */
/* ------------------------------------------------------------------ */
interface FormDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: "vendor" | "customer";
  editId?: string | null;
  initialData?: ContactFormData;
}

const ContactFormDialog = ({ open, onOpenChange, type, editId, initialData }: FormDialogProps) => {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ContactFormData>(initialData ?? emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const isEdit = !!editId;
  const table = type === "vendor" ? "vendors" : "customers";
  const label = type === "vendor" ? "Vendor" : "Customer";

  const set = (field: keyof ContactFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = () => {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push("Name is required.");
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.push("Invalid email.");
    if (form.payment_terms && isNaN(Number(form.payment_terms))) errs.push("Payment terms must be a number.");
    return errs;
  };

  const handleSave = async () => {
    const v = validate();
    setErrors(v);
    if (v.length > 0) return;
    if (!tenantId || !user) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        contact_person: form.contact_person.trim() || null,
        tax_id: form.tax_id.trim() || null,
        payment_terms: form.payment_terms ? Number(form.payment_terms) : 30,
        notes: form.notes.trim() || null,
      };

      if (isEdit) {
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq("id", editId!)
          .eq("tenant_id", tenantId);
        if (error) throw error;
        toast({ title: `${label} updated` });
      } else {
        const { error } = await supabase
          .from(table)
          .insert({ ...payload, tenant_id: tenantId, created_by: user.id });
        if (error) throw error;
        toast({ title: `${label} created` });
      }

      queryClient.invalidateQueries({ queryKey: [table, tenantId] });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${label}` : `New ${label}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={`${label} name`} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@example.com" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555-0100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Contact Person</Label>
              <Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tax ID</Label>
              <Input value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="XX-XXXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Payment Terms (days)</Label>
              <Input value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} type="number" min="0" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, City, State" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="resize-none h-16" placeholder="Optional notes..." />
            </div>
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save Changes" : `Add ${label}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ */
/* Contact List                                                        */
/* ------------------------------------------------------------------ */
interface ContactListProps {
  type: "vendor" | "customer";
}

const ContactList = ({ type }: ContactListProps) => {
  const { tenantId } = useTenant();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const table = type === "vendor" ? "vendors" : "customers";
  const label = type === "vendor" ? "Vendor" : "Customer";

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<ContactFormData | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: [table, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from(table)
        .select("*")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const openNew = () => {
    setEditId(null);
    setEditData(undefined);
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditId(item.id);
    setEditData({
      name: item.name ?? "",
      email: item.email ?? "",
      phone: item.phone ?? "",
      address: item.address ?? "",
      contact_person: item.contact_person ?? "",
      tax_id: item.tax_id ?? "",
      payment_terms: String(item.payment_terms ?? 30),
      notes: item.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!tenantId) return;
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: [table, tenantId] });
      toast({ title: `${label} deleted` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = items.filter(
    (it: any) =>
      it.name?.toLowerCase().includes(search.toLowerCase()) ||
      it.email?.toLowerCase().includes(search.toLowerCase()) ||
      it.contact_person?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${type}s...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {can("contacts.edit") && (
          <Button size="sm" className="gap-1.5" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Add {label}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No {type}s found. Click "Add {label}" to get started.
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 pb-3 pt-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 pb-3 pt-3 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                <th className="px-4 pb-3 pt-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Phone</th>
                <th className="px-4 pb-3 pt-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Contact Person</th>
                <th className="px-4 pb-3 pt-3 text-right text-xs font-medium text-muted-foreground hidden lg:table-cell">Terms</th>
                <th className="px-4 pb-3 pt-3 text-right text-xs font-medium text-muted-foreground w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any) => (
                <tr key={item.id} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{item.email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{item.phone || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{item.contact_person || "—"}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">{item.payment_terms ?? 30}d</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {can("contacts.edit") && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      {can("contacts.delete") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            : <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          }
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ContactFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={type}
        editId={editId}
        initialData={editData}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main Page                                                           */
/* ------------------------------------------------------------------ */
const Contacts = () => {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Vendors & Customers</h1>
        <p className="text-sm text-muted-foreground">Manage your business contacts</p>
      </div>

      <Tabs defaultValue="vendors">
        <TabsList>
          <TabsTrigger value="vendors" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Vendors
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Customers
          </TabsTrigger>
        </TabsList>
        <TabsContent value="vendors" className="mt-4">
          <ContactList type="vendor" />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <ContactList type="customer" />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Contacts;
