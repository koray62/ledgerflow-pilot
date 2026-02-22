import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const entries = [
  { id: "JE-1284", date: "2026-02-20", description: "Office Rent - February", debit: "$3,200.00", credit: "$3,200.00", status: "Posted" },
  { id: "JE-1283", date: "2026-02-19", description: "Invoice #1042 - Acme Corp", debit: "$8,500.00", credit: "$8,500.00", status: "Posted" },
  { id: "JE-1282", date: "2026-02-18", description: "Software Subscriptions", debit: "$299.00", credit: "$299.00", status: "Posted" },
  { id: "JE-1281", date: "2026-02-17", description: "Consulting Revenue - Q1", debit: "$12,000.00", credit: "$12,000.00", status: "Draft" },
  { id: "JE-1280", date: "2026-02-16", description: "Payroll - Feb 2026", debit: "$24,500.00", credit: "$24,500.00", status: "Posted" },
  { id: "JE-1279", date: "2026-02-15", description: "Equipment Purchase", debit: "$5,400.00", credit: "$5,400.00", status: "Pending" },
  { id: "JE-1278", date: "2026-02-14", description: "Utility Bill - Electric", debit: "$420.00", credit: "$420.00", status: "Posted" },
];

const statusColors: Record<string, string> = {
  Posted: "bg-success/10 text-success",
  Draft: "bg-muted text-muted-foreground",
  Pending: "bg-warning/10 text-warning",
};

const JournalEntries = () => {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Journal Entries</h1>
          <p className="text-sm text-muted-foreground">Double-entry bookkeeping records</p>
        </div>
        <Button variant="hero" size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Entry
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search journal entries..." className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
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
                {entries.map((entry, i) => (
                  <tr key={i} className="border-b border-border/50 transition-colors hover:bg-muted/50 cursor-pointer">
                    <td className="py-3 font-mono text-sm text-accent">{entry.id}</td>
                    <td className="py-3 font-mono text-sm text-muted-foreground">{entry.date}</td>
                    <td className="py-3 text-sm font-medium text-foreground">{entry.description}</td>
                    <td className="py-3 text-right font-mono text-sm text-foreground">{entry.debit}</td>
                    <td className="py-3 text-right font-mono text-sm text-foreground">{entry.credit}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[entry.status]}`}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JournalEntries;
