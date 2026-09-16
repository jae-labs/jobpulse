import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isLocalDevelopmentAuthBypass, localDevelopmentCredentials } from '../lib/localDevAuth';
import { checkUserAuthorization } from '../components/auth/authConfig';
import { clearAppCache } from '../lib/queryClient';

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    const verifySession = async (currentSession: Session | null) => {
      setIsAuthChecking(true);
      setSession(currentSession);

      if (!currentSession?.user?.email) {
        if (isMounted) {
          setIsAuthorized(false);
          setIsAuthChecking(false);
        }
        return;
      }

      const { isAuthorized: authorized, error } = await checkUserAuthorization(currentSession.user.email);
      if (isMounted) {
        setIsAuthorized(authorized);
        setAuthError(error || null);
        setIsAuthChecking(false);
      }
    };

    if (isLocalDevelopmentAuthBypass) {
      void supabase.auth
        .signInWithPassword(localDevelopmentCredentials)
        .then(({ data: { session }, error }) => {
          if (error) {
            if (isMounted) {
              setAuthError(`Local development sign-in failed: ${error.message}`);
              setIsAuthChecking(false);
            }
            return;
          }
          void verifySession(session);
        });
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        void verifySession(session);
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        clearAppCache();
      }
      void verifySession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, isAuthorized, authError, isAuthChecking };
}
