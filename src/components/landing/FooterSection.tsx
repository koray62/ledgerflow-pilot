import { BookOpen } from "lucide-react";

const FooterSection = () => {
  return (
    <footer id="security" className="border-t border-border bg-card py-16">
      <div className="container mx-auto px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-accent">
                <BookOpen className="h-4 w-4 text-accent-foreground" />
              </div>
              <span className="text-lg font-bold text-foreground">LedgerPilot</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              AI-powered bookkeeping for modern businesses. Secure, scalable, and simple.
            </p>
          </div>

          {[
            { title: "Product", links: ["Features", "Pricing", "Security", "API Docs"] },
            { title: "Company", links: ["About", "Blog", "Careers", "Contact"] },
            { title: "Legal", links: ["Privacy", "Terms", "GDPR", "SOC 2"] },
          ].map((col, i) => (
            <div key={i}>
              <h4 className="font-semibold text-foreground">{col.title}</h4>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6 text-center text-sm text-muted-foreground">
          © 2026 LedgerPilot Cloud. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
