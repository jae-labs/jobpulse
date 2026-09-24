import { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isLocalDevelopmentAuthBypass, localDevelopmentCredentials } from '../lib/localDevAuth';
import { checkUserAuthorization } from '../components/auth/authConfig';
import { clearAppCache } from '../lib/queryClient';
import { setSentryUser } from '../lib/sentry';

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(Boolean(supabase));
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    const verifySession = async (currentSession: Session | null, isInitial = false) => {
      const newUserId = currentSession?.user?.id ?? null;
      const userChanged = newUserId !== activeUserIdRef.current;

      if (userChanged) {
        clearAppCache();
        activeUserIdRef.current = newUserId;
        setSentryUser(newUserId);
      }

      if (isInitial || userChanged) {
        setIsAuthChecking(true);
      }

      if (!currentSession?.user?.email) {
        if (isMounted) {
          setSession(null);
          setIsAuthorized(false);
          setAuthError(null);
          setIsAuthChecking(false);
        }
        return;
      }

      const { isAuthorized: authorized, error } = await checkUserAuthorization(currentSession.user.email);
      if (isMounted) {
        if (!authorized) {
          clearAppCache();
        }
        setSession(currentSession);
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
          void verifySession(session, true);
        });
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        void verifySession(session, true);
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        clearAppCache();
        activeUserIdRef.current = null;
        setSentryUser(null);
      }
      void verifySession(session, false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, isAuthorized, authError, isAuthChecking };
}
