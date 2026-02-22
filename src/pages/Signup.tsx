import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const Signup = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [loading, setLoading] = useState(false);
  const { signUp, verifyOtp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !firstName.trim() || !companyName.trim()) return;

    setLoading(true);
    const { error } = await signUp(email.trim(), firstName.trim(), lastName.trim(), companyName.trim());
    setLoading(false);

    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else {
      setStep("otp");
      toast({ title: "Code sent", description: `We sent a 6-digit code to ${email}` });
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) return;

    setLoading(true);
    const { error } = await verifyOtp(email.trim(), otp);
    setLoading(false);

    if (error) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
      setOtp("");
    } else {
      navigate("/dashboard");
    }
  };

  if (step === "otp") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <BookOpen className="h-6 w-6 text-accent" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Enter verification code</h1>
            <p className="mt-1 text-sm text-muted-foreground text-center">
              We sent a 6-digit code to <strong className="text-foreground">{email}</strong>
            </p>
          </div>

          <Card>
            <CardContent className="p-6 flex flex-col items-center gap-6">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>

              <Button
                variant="hero"
                className="w-full"
                disabled={otp.length !== 6 || loading}
                onClick={handleVerify}
              >
                {loading ? "Verifying..." : "Verify & Create Account"}
              </Button>
            </CardContent>
          </Card>

          <button
            onClick={() => { setStep("form"); setOtp(""); }}
            className="mt-4 flex items-center gap-1 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Link to="/" className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-accent">
              <BookOpen className="h-4.5 w-4.5 text-accent-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">LedgerPilot</span>
          </Link>
          <h1 className="text-lg font-semibold text-foreground">Start your free trial</h1>
          <p className="text-sm text-muted-foreground">14 days free · No credit card required</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName" className="text-xs">First Name</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className="mt-1" required />
                </div>
                <div>
                  <Label htmlFor="lastName" className="text-xs">Last Name</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="company" className="text-xs">Company Name</Label>
                <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." className="mt-1" required />
              </div>
              <div>
                <Label htmlFor="email" className="text-xs">Work Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" className="mt-1" required autoComplete="email" />
              </div>
              <Button type="submit" variant="hero" className="w-full" disabled={loading}>
                {loading ? "Sending code..." : "Continue with Email"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                We'll send a 6-digit verification code to your email
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
