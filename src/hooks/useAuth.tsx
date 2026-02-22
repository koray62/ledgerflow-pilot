import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, firstName: string, lastName: string, companyName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, firstName: string, lastName: string, companyName: string) => {
    try {
      // Store signup metadata in localStorage so we can create tenant after OTP verification
      localStorage.setItem("pending_signup", JSON.stringify({ firstName, lastName, companyName }));

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: { first_name: firstName, last_name: lastName },
        },
      });
      if (error) return { error };
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  const signIn = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      return { error: error as Error | null };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (error) return { error };

      // Check if there's pending signup data (first-time user)
      const pendingRaw = localStorage.getItem("pending_signup");
      if (pendingRaw && data.user) {
        const pending = JSON.parse(pendingRaw);
        const { error: tenantError } = await supabase.functions.invoke("create-tenant", {
          body: { companyName: pending.companyName, userId: data.user.id },
        });
        if (tenantError) console.error("Tenant creation error:", tenantError);
        localStorage.removeItem("pending_signup");
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, verifyOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
