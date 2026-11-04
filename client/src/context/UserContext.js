import { createContext } from 'react';

/** localStorage key holding { userId, displayName } as JSON. */
export const USER_STORAGE_KEY = 'bha.user';

/** { user, persisted, setUser, clearUser, ensureUser }, provided by UserProvider. */
export const UserContext = createContext(null);
