export function loadWithRetry<T>(loader: () => Promise<T>, retries = 2): Promise<T> {
  return loader().catch((err: unknown) => {
    if (retries > 0) {
      return loadWithRetry(loader, retries - 1);
    }

    if (typeof window === 'undefined') {
      throw err;
    }

    const reloadKey = 'chunk-reload-' + window.location.pathname;
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1');
      window.location.reload();
      return new Promise(() => {});
    }

    sessionStorage.removeItem(reloadKey);
    throw err;
  });
}
