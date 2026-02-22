import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const DashboardSettings = () => {
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
                <Input defaultValue="Acme Inc." className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Industry</Label>
                <Input defaultValue="Technology / SaaS" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Fiscal Year End</Label>
                <Input defaultValue="December" className="mt-1" />
              </div>
            </div>
            <Button variant="hero" size="sm" className="mt-4">Save Changes</Button>
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
      </div>
    </div>
  );
};

export default DashboardSettings;
