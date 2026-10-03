import { useState } from 'react';

/** Dismissal belongs to one view/error; new contexts are visible before commit. */
export function useErrorDismissal(scope: string, error: unknown, customError: string | null) {
  const [state, setState] = useState({ scope, error, customError, dismissed: false });
  const changed = scope !== state.scope || error !== state.error || customError !== state.customError;
  if (changed) setState({ scope, error, customError, dismissed: false });

  return {
    isDismissed: !changed && state.dismissed,
    dismiss: () => setState({ scope, error, customError, dismissed: true }),
    reset: () => setState({ scope, error, customError, dismissed: false }),
  };
}
