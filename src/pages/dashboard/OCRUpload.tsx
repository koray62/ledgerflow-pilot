import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle, Clock, AlertCircle } from "lucide-react";

const recentScans = [
  { name: "invoice_acme_feb2026.pdf", status: "Completed", confidence: "97%", date: "Feb 20", vendor: "Acme Corp", amount: "$8,500" },
  { name: "receipt_office_supplies.jpg", status: "Completed", confidence: "94%", date: "Feb 19", vendor: "Office Depot", amount: "$342" },
  { name: "bill_hosting_feb.pdf", status: "Review Required", confidence: "78%", date: "Feb 18", vendor: "AWS", amount: "$1,245" },
  { name: "invoice_consulting.pdf", status: "Processing", confidence: "—", date: "Feb 18", vendor: "—", amount: "—" },
];

const statusIcons: Record<string, typeof CheckCircle> = {
  Completed: CheckCircle,
  "Review Required": AlertCircle,
  Processing: Clock,
};

const statusColors: Record<string, string> = {
  Completed: "text-success",
  "Review Required": "text-warning",
  Processing: "text-info",
};

const OCRUpload = () => {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">OCR Document Scanner</h1>
        <p className="text-sm text-muted-foreground">Upload invoices and receipts for AI-powered data extraction</p>
      </div>

      {/* Upload area */}
      <Card className="mb-6">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-12 transition-colors hover:border-accent/50">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <Upload className="h-6 w-6 text-accent" />
            </div>
            <p className="text-sm font-medium text-foreground">Drop files here or click to upload</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG up to 10MB</p>
            <Button variant="hero" size="sm" className="mt-4">
              Select Files
            </Button>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>5 / 50 scans used this month</span>
            <span>Free Trial</span>
          </div>
        </CardContent>
      </Card>

      {/* Recent scans */}
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Scans</h3>
          <div className="space-y-3">
            {recentScans.map((scan, i) => {
              const StatusIcon = statusIcons[scan.status];
              return (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{scan.name}</p>
                      <p className="text-xs text-muted-foreground">{scan.vendor} · {scan.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm text-foreground">{scan.amount}</span>
                    <span className="font-mono text-xs text-muted-foreground">{scan.confidence}</span>
                    <div className={`flex items-center gap-1 ${statusColors[scan.status]}`}>
                      <StatusIcon className="h-4 w-4" />
                      <span className="text-xs">{scan.status}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OCRUpload;
