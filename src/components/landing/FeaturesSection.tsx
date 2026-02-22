import { motion } from "framer-motion";
import {
  BookOpen, Receipt, TrendingUp, Users, Shield, Building2,
  CreditCard, FileText, Globe
} from "lucide-react";

const features = [
  {
    icon: BookOpen,
    title: "Double-Entry Accounting",
    description: "Full general ledger with chart of accounts, trial balance, income statement, and balance sheet.",
  },
  {
    icon: Receipt,
    title: "AI-OCR Scanning",
    description: "Upload invoices and receipts. AI extracts data, suggests accounts, and creates journal entries.",
  },
  {
    icon: TrendingUp,
    title: "Cash Flow Forecasting",
    description: "Historical and projected cash flows with burn rate, runway, and liquidity alerts.",
  },
  {
    icon: Users,
    title: "Multi-User Collaboration",
    description: "Invite your team with role-based access: Owner, Admin, Accountant, or Viewer.",
  },
  {
    icon: Building2,
    title: "Multi-Tenant Architecture",
    description: "Each company is fully isolated. Manage multiple businesses from one account.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Row-level security, audit logging, encrypted storage, and SOC 2 readiness.",
  },
  {
    icon: CreditCard,
    title: "Bank Reconciliation",
    description: "Connect bank accounts, import transactions, and reconcile with your ledger.",
  },
  {
    icon: FileText,
    title: "AR & AP Management",
    description: "Track invoices, bills, vendors, and customers with aging reports.",
  },
  {
    icon: Globe,
    title: "API & Integrations",
    description: "RESTful API for custom integrations. Ready for open banking and ERP connections.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24">
      <div className="container mx-auto px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-foreground md:text-4xl">
            Everything you need to manage your books
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A complete financial operating system designed for growing businesses.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-accent/30 hover:shadow-lg"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <feature.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-card-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
