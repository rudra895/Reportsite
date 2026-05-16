import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    try {
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
        if (!active) return;
        setSession(s);
        setLoading(false);
      });

      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
      });

      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    } catch (err) {
      if (!active) return;
      setError(err instanceof Error ? err.message : "Auth unavailable");
      setSession(null);
      setLoading(false);
    }
  }, []);

  return { session, user: session?.user ?? null, loading, error };
}
