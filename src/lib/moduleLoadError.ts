// Browsers use different messages for rejected dynamic imports. React.lazy
// caches that rejection, so resetting an error boundary cannot retry it.
export function isModuleLoadError(error: Error | null): boolean {
  if (!error) return false;
  return error.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(error.message);
}

export function reloadPage(): void {
  window.location.reload();
}
