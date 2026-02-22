import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const accounts = [
  { code: "1000", name: "Cash", type: "Asset", balance: "$124,580" },
  { code: "1100", name: "Accounts Receivable", type: "Asset", balance: "$34,200" },
  { code: "1200", name: "Inventory", type: "Asset", balance: "$18,900" },
  { code: "1500", name: "Equipment", type: "Asset", balance: "$45,000" },
  { code: "2000", name: "Accounts Payable", type: "Liability", balance: "$18,750" },
  { code: "2100", name: "Accrued Expenses", type: "Liability", balance: "$5,200" },
  { code: "3000", name: "Retained Earnings", type: "Equity", balance: "$198,730" },
  { code: "4000", name: "Revenue", type: "Revenue", balance: "$312,000" },
  { code: "5000", name: "Cost of Goods Sold", type: "Expense", balance: "$142,000" },
  { code: "5100", name: "Salaries & Wages", type: "Expense", balance: "$96,000" },
  { code: "5200", name: "Rent Expense", type: "Expense", balance: "$38,400" },
  { code: "5300", name: "Utilities", type: "Expense", balance: "$4,800" },
];

const typeColors: Record<string, string> = {
  Asset: "bg-info/10 text-info",
  Liability: "bg-warning/10 text-warning",
  Equity: "bg-accent/10 text-accent",
  Revenue: "bg-success/10 text-success",
  Expense: "bg-destructive/10 text-destructive",
};

const ChartOfAccounts = () => {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">Manage your account structure</p>
        </div>
        <Button variant="hero" size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Add Account
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search accounts..." className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Code</th>
                  <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Account Name</th>
                  <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                  <th className="pb-3 text-right text-xs font-medium text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc, i) => (
                  <tr key={i} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                    <td className="py-3 font-mono text-sm text-muted-foreground">{acc.code}</td>
                    <td className="py-3 text-sm font-medium text-foreground">{acc.name}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[acc.type]}`}>
                        {acc.type}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-sm text-foreground">{acc.balance}</td>
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

export default ChartOfAccounts;
