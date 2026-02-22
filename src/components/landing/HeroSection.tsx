import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen overflow-hidden gradient-hero pt-16">
      {/* Background image overlay */}
      <div
        className="absolute inset-0 opacity-30"
        style={{ backgroundImage: `url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

      <div className="container relative mx-auto flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5"
        >
          <Zap className="h-3.5 w-3.5 text-accent" />
          <span className="text-sm text-accent">AI-Powered Bookkeeping for Modern Teams</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-4xl text-5xl font-bold leading-tight text-primary-foreground md:text-7xl"
        >
          Your finances on{" "}
          <span className="text-gradient">autopilot</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 max-w-2xl text-lg text-primary-foreground/60"
        >
          Double-entry accounting, AI receipt scanning, real-time cash flow forecasting, and multi-tenant collaboration — all in one platform built for scale.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
        >
          <Link to="/dashboard">
            <Button variant="hero" size="lg" className="gap-2 text-base">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#features">
            <Button variant="hero-outline" size="lg" className="text-base">
              See How It Works
            </Button>
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3"
        >
          {[
            { icon: Shield, label: "SOC 2 Ready", desc: "Enterprise-grade security" },
            { icon: BarChart3, label: "Real-time", desc: "Live cash flow forecasting" },
            { icon: Zap, label: "AI-Powered", desc: "Smart OCR & categorization" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-accent/10 bg-accent/5 px-5 py-3 backdrop-blur-sm">
              <item.icon className="h-5 w-5 text-accent" />
              <div className="text-left">
                <p className="text-sm font-semibold text-primary-foreground">{item.label}</p>
                <p className="text-xs text-primary-foreground/50">{item.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
