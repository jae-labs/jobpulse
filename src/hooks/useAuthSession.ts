import { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isLocalDevelopmentAuthBypass, localDevelopmentCredentials } from '../lib/localDevAuth';
import { checkUserAuthorization } from '../components/auth/authConfig';
import { clearAppCache } from '../lib/queryClient';

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(Boolean(supabase));
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    let sessionRevision = 0;

    const verifySession = async (currentSession: Session | null, isInitial = false) => {
      const revision = ++sessionRevision;
      const newUserId = currentSession?.user?.id ?? null;
      const userChanged = newUserId !== activeUserIdRef.current;

      if (userChanged) {
        clearAppCache();
        activeUserIdRef.current = newUserId;
      }

      if (isInitial || userChanged) {
        setIsAuthChecking(true);
      }

      if (!currentSession?.user?.email) {
        if (isMounted) {
          setSession(null);
          setIsAuthorized(false);
          setUserRole(null);
          setAuthError(null);
          setIsAuthChecking(false);
        }
        return;
      }

      const { isAuthorized: authorized, role, error } = await checkUserAuthorization(currentSession.user.email);
      if (isMounted && revision === sessionRevision) {
        if (!authorized) {
          clearAppCache();
        }
        setSession(currentSession);
        setIsAuthorized(authorized);
        setUserRole(role || null);
        setAuthError(error || null);
        setIsAuthChecking(false);
      }
    };

    if (isLocalDevelopmentAuthBypass) {
      void supabase.auth
        .signInWithPassword(localDevelopmentCredentials)
        .then(({ data: { session }, error }) => {
          if (!isMounted || sessionRevision !== 0) return;
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
        if (isMounted && sessionRevision === 0) void verifySession(session, true);
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        clearAppCache();
        activeUserIdRef.current = null;
      }
      void verifySession(session, false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, isAuthorized, userRole, authError, isAuthChecking };
}
