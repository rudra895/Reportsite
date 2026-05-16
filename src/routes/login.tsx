import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Lock, Mail, Eye, EyeOff, TrendingUp, BarChart3, PieChart } from "lucide-react";

import { AUTH_CREDENTIALS, AUTH_STORAGE_KEY, OWNER_NAME } from "@/constants";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Check hardcoded credentials first
      if (email === AUTH_CREDENTIALS.EMAIL && password === AUTH_CREDENTIALS.PASSWORD) {
        // Try Supabase sign-in first
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // If Supabase fails (user doesn't exist), auto-create the account
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          });
          if (signUpError) {
            // If sign-up also fails, try sign-in again (might be email confirmation issue)
            const { error: retryError } = await supabase.auth.signInWithPassword({ email, password });
            if (retryError) {
              // Last resort: set a mock session marker and proceed
              localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ email, name: OWNER_NAME, authed: true }));
              toast.success(`Welcome, ${OWNER_NAME}!`);
              navigate({ to: "/" });
              return;
            }
          } else {
            // Sign up succeeded, try immediate sign-in
            const { error: postSignUpError } = await supabase.auth.signInWithPassword({ email, password });
            if (postSignUpError) {
              localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ email, name: OWNER_NAME, authed: true }));
              toast.success(`Welcome, ${OWNER_NAME}!`);
              navigate({ to: "/" });
              return;
            }
          }
        }
        toast.success(`Welcome back, ${OWNER_NAME}!`);
        navigate({ to: "/" });
        return;
      }

      // Non-default credentials: normal Supabase auth
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950">
        {/* Floating gradient orbs */}
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl animate-float-medium" />
        <div className="absolute top-1/2 right-1/3 h-64 w-64 rounded-full bg-cyan-500/8 blur-3xl animate-float-fast" />
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* Floating stats icons */}
      <div className={`absolute top-20 left-10 transition-all duration-1000 delay-300 ${mounted ? "opacity-20 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <TrendingUp className="h-16 w-16 text-blue-400 animate-float-slow" />
      </div>
      <div className={`absolute bottom-20 right-10 transition-all duration-1000 delay-500 ${mounted ? "opacity-15 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <BarChart3 className="h-20 w-20 text-indigo-400 animate-float-medium" />
      </div>
      <div className={`absolute top-32 right-20 transition-all duration-1000 delay-700 ${mounted ? "opacity-10 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <PieChart className="h-14 w-14 text-cyan-400 animate-float-fast" />
      </div>

      <div className={`w-full max-w-md transition-all duration-700 ${mounted ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-6 scale-95"}`}>
        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl shadow-black/20">
          <CardHeader className="text-center pb-2">
            {/* Logo */}
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25 animate-pulse-subtle">
              <BarChart3 className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-white">
              SSJ Brokerage PA
            </CardTitle>
            <CardDescription className="text-white/50">
              Sign in to access your brokerage analytics dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                  Email Address
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ganpat.b@ssjfinance.com"
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                  Password
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all h-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
                disabled={busy}
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing in…
                  </span>
                ) : (
                  "Sign in"
                )}
              </Button>

              <div className="pt-2 text-center">
                <p className="text-[11px] text-white/25 font-medium">
                  SSJ Finance · Internal Use Only
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
