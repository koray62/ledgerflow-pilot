import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DashboardSettings = () => {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [fiscalYearEnd, setFiscalYearEnd] = useState("12");
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("name, industry, fiscal_year_end")
        .eq("id", tenantId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (tenant) {
      setName(tenant.name ?? "");
      setIndustry(tenant.industry ?? "");
      setFiscalYearEnd(String(tenant.fiscal_year_end ?? 12));
    }
  }, [tenant]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({
        name: name.trim(),
        industry: industry.trim() || null,
        fiscal_year_end: parseInt(fiscalYearEnd, 10),
      })
      .eq("id", tenantId);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["tenant-settings", tenantId] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your organization and preferences</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-foreground">Organization</h3>
            <Separator className="my-4" />
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Company Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Industry</Label>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Fiscal Year End</Label>
                <Select value={fiscalYearEnd} onValueChange={setFiscalYearEnd}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="hero" size="sm" className="mt-4" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-foreground">Subscription</h3>
            <Separator className="my-4" />
            <div className="flex items-center justify-between rounded-lg border border-accent/20 bg-accent/5 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Free Trial</p>
                <p className="text-xs text-muted-foreground">12 days remaining · 5/50 OCR scans used</p>
              </div>
              <Button variant="hero" size="sm">Upgrade</Button>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Journal Entries</span>
                <span className="font-mono text-foreground">38 / 50</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active Users</span>
                <span className="font-mono text-foreground">1 / 1</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Storage Used</span>
                <span className="font-mono text-foreground">2.4 MB / 100 MB</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Danger Zone
            </h3>
            <Separator className="my-4" />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Seed Test Data</p>
                <p className="text-xs text-muted-foreground">
                  Delete all journal entries, bank transactions, and documents, then seed 4 years of dummy data for testing.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={seeding}>
                    {seeding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {seeding ? "Seeding…" : "Seed Test Data"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all existing journal entries, journal lines, bank transactions, and documents for this organization, then create ~700+ dummy entries spanning 2022–2025.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        if (!tenantId) return;
                        setSeeding(true);
                        try {
                          const { data, error } = await supabase.functions.invoke("seed-test-data", {
                            body: { tenantId },
                          });
                          if (error) throw error;
                          if (data?.error) throw new Error(data.error);
                          toast({
                            title: "Test data seeded",
                            description: `Created ${data.entries} journal entries, ${data.lines} lines, and ${data.bankTransactions} bank transactions.`,
                          });
                          queryClient.invalidateQueries();
                        } catch (err: any) {
                          toast({ title: "Error", description: err.message, variant: "destructive" });
                        } finally {
                          setSeeding(false);
                        }
                      }}
                    >
                      Yes, delete & seed
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardSettings;
