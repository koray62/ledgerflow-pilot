import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle, Upload, X, Lock } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { SUPPORTED_CURRENCIES } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DashboardSettings = () => {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [fiscalYearEnd, setFiscalYearEnd] = useState("12");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("name, industry, fiscal_year_end, logo_url, address, tax_id" as any)
        .eq("id", tenantId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (tenant) {
      setName(tenant.name ?? "");
      setIndustry(tenant.industry ?? "");
      setFiscalYearEnd(String(tenant.fiscal_year_end ?? 12));
      setDefaultCurrency((tenant as any).default_currency ?? "USD");
      setAddress(tenant.address ?? "");
      setTaxId(tenant.tax_id ?? "");
      // Generate signed URL from stored path
      const storedLogo = tenant.logo_url as string | null;
      if (storedLogo) {
        // If it's already a full URL (legacy), try to extract path; otherwise use as path
        const path = storedLogo.includes("/storage/v1/")
          ? storedLogo.split("/tenant-documents/").pop() ?? storedLogo
          : storedLogo;
        supabase.storage
          .from("tenant-documents")
          .createSignedUrl(path, 3600)
          .then(({ data }) => {
            if (data?.signedUrl) setLogoUrl(data.signedUrl);
            else setLogoUrl(null);
          });
      } else {
        setLogoUrl(null);
      }
    }
  }, [tenant]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 2 MB.", variant: "destructive" });
      return;
    }

    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${tenantId}/logo.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("tenant-documents")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      // Store the storage path, not a URL
      const storagePath = path;

      await supabase
        .from("tenants")
        .update({ logo_url: storagePath } as any)
        .eq("id", tenantId);

      // Generate a signed URL for display
      const { data: signedData } = await supabase.storage
        .from("tenant-documents")
        .createSignedUrl(storagePath, 3600);
      if (signedData?.signedUrl) setLogoUrl(signedData.signedUrl);

      toast({ title: "Logo uploaded" });
      queryClient.invalidateQueries({ queryKey: ["tenant-settings", tenantId] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    if (!tenantId) return;
    await supabase
      .from("tenants")
      .update({ logo_url: null } as any)
      .eq("id", tenantId);
    setLogoUrl(null);
    toast({ title: "Logo removed" });
    queryClient.invalidateQueries({ queryKey: ["tenant-settings", tenantId] });
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({
        name: name.trim(),
        industry: industry.trim() || null,
        fiscal_year_end: parseInt(fiscalYearEnd, 10),
        default_currency: defaultCurrency,
        address: address.trim() || null,
        tax_id: taxId.trim() || null,
      } as any)
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
              {/* Company Logo */}
              <div>
                <Label className="text-xs">Company Logo</Label>
                <div className="mt-1 flex items-center gap-4">
                  {logoUrl ? (
                    <div className="relative h-16 w-16 rounded-lg border border-border overflow-hidden bg-muted">
                      <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
                      <button
                        onClick={removeLogo}
                        className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow-sm hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border bg-muted/50">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {logoUrl ? "Change Logo" : "Upload Logo"}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">PNG, JPG up to 2 MB</p>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs">Company Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Industry</Label>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Tax ID</Label>
                <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="mt-1" placeholder="e.g. 12-3456789" />
              </div>
              <div>
                <Label className="text-xs">Address</Label>
                <Textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1"
                  rows={3}
                  placeholder="Street address, city, state, zip"
                />
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
              <div>
                <Label className="text-xs">Default Currency</Label>
                <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.label}
                      </SelectItem>
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
