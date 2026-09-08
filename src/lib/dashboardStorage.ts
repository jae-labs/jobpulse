const DATABASE_NAME = 'nextgig';
const DATABASE_VERSION = 1;
const STORE_NAME = 'dashboard';
const DASHBOARD_LAYOUT_KEY = 'overview-layout';
const DASHBOARD_THEME_KEY = 'theme';

export type DashboardTheme = 'dark' | 'light';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Storage is blocked by another tab.'));
  });
}

async function readValue<T>(key: string): Promise<T | undefined> {
  try {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      return await requestResult(transaction.objectStore(STORE_NAME).get(key));
    } finally {
      database.close();
    }
  } catch {
    return undefined;
  }
}

async function writeValue(key: string, value: unknown): Promise<void> {
  try {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(value, key);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  } catch (error) {
    console.error('Failed to write value to IndexedDB:', error);
  }
}

export async function loadDashboardLayout(): Promise<string[] | null> {
  return (await readValue<string[]>(DASHBOARD_LAYOUT_KEY)) ?? null;
}

export function saveDashboardLayout(layout: string[]): Promise<void> {
  return writeValue(DASHBOARD_LAYOUT_KEY, layout);
}

export async function loadDashboardTheme(): Promise<DashboardTheme | null> {
  const theme = await readValue<DashboardTheme>(DASHBOARD_THEME_KEY);
  return theme === 'dark' || theme === 'light' ? theme : null;
}

export function saveDashboardTheme(theme: DashboardTheme): Promise<void> {
  return writeValue(DASHBOARD_THEME_KEY, theme);
}
