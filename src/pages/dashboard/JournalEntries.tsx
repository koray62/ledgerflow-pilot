import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDisplayDate } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/usePermissions";
import JournalEntryForm from "@/components/dashboard/JournalEntryForm";
import OCRUpload from "./OCRUpload";

const statusColors: Record<string, string> = {
  posted: "bg-success/10 text-success",
  draft: "bg-muted text-muted-foreground",
  pending: "bg-warning/10 text-warning",
  voided: "bg-destructive/10 text-destructive",
};

const JournalEntries = () => {
  const { tenantId, defaultCurrency } = useTenant();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const returnTo = useRef<string | null>(null);

  // Auto-open journal entry from URL param (e.g. from CoA ledger link)
  useEffect(() => {
    const editId = searchParams.get("edit");
    const from = searchParams.get("from");
    if (editId) {
      setEditEntryId(editId);
      setFormOpen(true);
      if (from === "coa") returnTo.current = "/dashboard/accounts";
      if (from === "invoices") returnTo.current = "/dashboard/invoices";
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["journal-entries", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, entry_number, entry_date, description, status")
        .eq("tenant_id", tenantId!)
        .order("entry_date", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // Get line totals for displayed entries
  const entryIds = entries.map((e) => e.id);
  const { data: lineTotals = [] } = useQuery({
    queryKey: ["journal-line-totals", tenantId, entryIds],
    enabled: !!tenantId && entryIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select("journal_entry_id, debit, credit")
        .eq("tenant_id", tenantId!)
        .in("journal_entry_id", entryIds);
      return data ?? [];
    },
  });

  // Aggregate debits/credits per entry
  const entryTotals = entryIds.reduce<Record<string, { debit: number; credit: number }>>((acc, id) => {
    const lines = lineTotals.filter((l) => l.journal_entry_id === id);
    acc[id] = {
      debit: lines.reduce((s, l) => s + Number(l.debit), 0),
      credit: lines.reduce((s, l) => s + Number(l.credit), 0),
    };
    return acc;
  }, {});

  const filtered = entries.filter(
    (e) =>
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.entry_number.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (n: number) => formatCurrency(n, defaultCurrency);
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Journal Entries</h1>
          <p className="text-sm text-muted-foreground">Double-entry bookkeeping records</p>
        </div>
      </div>

      <JournalEntryForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            const dest = returnTo.current;
            returnTo.current = null;
            setEditEntryId(null);
            if (dest) navigate(dest);
          }
        }}
        editEntryId={editEntryId}
        onCreateNew={(newId) => setEditEntryId(newId)}
        canDelete={can("journal_entries.delete")}
        onDelete={async (entryId) => {
          try {
            // Delete lines first, then the entry
            await supabase.from("journal_lines").delete().eq("journal_entry_id", entryId).eq("tenant_id", tenantId!);
            const { error } = await supabase.from("journal_entries").delete().eq("id", entryId).eq("tenant_id", tenantId!);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["journal-entries", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["journal-line-totals", tenantId] });
            toast({ title: "Entry deleted", description: "Journal entry has been permanently deleted." });
            setEditEntryId(null);
            setFormOpen(false);
          } catch (err: any) {
            toast({ title: "Delete failed", description: err.message || "Something went wrong.", variant: "destructive" });
          }
        }}
      />

      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="ocr">OCR Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <div className="mb-4 flex justify-end">
            {can("journal_entries.edit") && (
              <Button variant="hero" size="sm" className="gap-2" onClick={() => { setEditEntryId(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" /> New Entry
              </Button>
            )}
          </div>
          <Card>
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search journal entries..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {search ? "No entries match your search." : "No journal entries yet. Create your first entry to get started."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-3 text-left text-xs font-medium text-muted-foreground">ID</th>
                        <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                        <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Description</th>
                        <th className="pb-3 text-right text-xs font-medium text-muted-foreground">Debit</th>
                        <th className="pb-3 text-right text-xs font-medium text-muted-foreground">Credit</th>
                        <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((entry) => {
                        const totals = entryTotals[entry.id] ?? { debit: 0, credit: 0 };
                        return (
                          <tr key={entry.id} className="border-b border-border/50 transition-colors hover:bg-muted/50 cursor-pointer" onClick={() => { setEditEntryId(entry.id); setFormOpen(true); }}>
                            <td className="py-3 font-mono text-sm text-accent">{entry.entry_number}</td>
                            <td className="py-3 font-mono text-sm text-muted-foreground">{formatDisplayDate(entry.entry_date, defaultCurrency)}</td>
                            <td className="py-3 text-sm font-medium text-foreground">{entry.description}</td>
                            <td className="py-3 text-right font-mono text-sm text-foreground">{fmt(totals.debit)}</td>
                            <td className="py-3 text-right font-mono text-sm text-foreground">{fmt(totals.credit)}</td>
                            <td className="py-3">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[entry.status] ?? ""}`}>
                                {entry.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ocr">
          <OCRUpload onEditEntry={(id) => { setEditEntryId(id); setFormOpen(true); }} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default JournalEntries;
