import { useState } from 'react';

/** Dismissal belongs to one view/error; new contexts are visible before commit. */
export function useErrorDismissal(scope: string, error: unknown) {
  const [state, setState] = useState({ scope, error, dismissed: false });
  const changed = scope !== state.scope || error !== state.error;
  if (changed) setState({ scope, error, dismissed: false });

  return {
    isDismissed: !changed && state.dismissed,
    dismiss: () => setState({ scope, error, dismissed: true }),
    reset: () => setState({ scope, error, dismissed: false }),
  };
}
