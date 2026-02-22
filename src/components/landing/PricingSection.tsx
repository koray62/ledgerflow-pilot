import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Free Trial",
    price: "$0",
    period: "14 days",
    description: "Try LedgerPilot with limited features",
    features: [
      "50 journal entries",
      "5 OCR scans/month",
      "1 user",
      "Basic reports",
      "1 company",
    ],
    cta: "Start Free",
    featured: false,
  },
  {
    name: "Starter",
    price: "$29",
    period: "/month",
    description: "Perfect for small businesses",
    features: [
      "1,000 journal entries/mo",
      "50 OCR scans/month",
      "3 users",
      "Full financial reports",
      "2 companies",
      "Bank reconciliation",
    ],
    cta: "Get Started",
    featured: false,
  },
  {
    name: "Pro",
    price: "$79",
    period: "/month",
    description: "For growing teams and complex books",
    features: [
      "Unlimited transactions",
      "200 OCR scans/month",
      "10 users",
      "Cash flow forecasting",
      "5 companies",
      "Priority support",
      "API access",
    ],
    cta: "Start Pro Trial",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For organizations at scale",
    features: [
      "Everything in Pro",
      "Unlimited users & companies",
      "White-label option",
      "Dedicated support",
      "Custom integrations",
      "SLA guarantee",
      "SOC 2 compliance",
    ],
    cta: "Contact Sales",
    featured: false,
  },
];

const PricingSection = () => {
  return (
    <section id="pricing" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-foreground md:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free. Scale as you grow. No hidden fees.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={`relative flex flex-col rounded-xl border p-6 ${
                plan.featured
                  ? "border-accent bg-card shadow-glow"
                  : "border-border bg-card"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                  Most Popular
                </div>
              )}

              <h3 className="text-lg font-semibold text-card-foreground">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-card-foreground">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm text-card-foreground">
                    <Check className="h-4 w-4 shrink-0 text-accent" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link to="/dashboard" className="mt-6">
                <Button
                  variant={plan.featured ? "hero" : "outline"}
                  className="w-full"
                >
                  {plan.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
