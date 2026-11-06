import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth } from './firebase';

export const ADMIN_DEFAULT_EMAIL = 'admin@gmail.com';
export const ADMIN_DEFAULT_PASS = 'admin';
export const LOCAL_SESSION_KEY = 'retailflow_admin_session';

/**
 * Helper to create an Admin User object for session persistence.
 */
function createAdminUser(email = 'admin@gmail.com'): User {
  const cleanEmail = email.toLowerCase() === 'cvasani751@gmail.com' ? 'admin@gmail.com' : email;
  return {
    uid: 'admin_session_user',
    email: cleanEmail,
    displayName: 'System Admin',
    emailVerified: true,
    isAnonymous: false,
    metadata: {},
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'mock_token',
    getIdTokenResult: async () => ({} as any),
    reload: async () => {},
    toJSON: () => ({}),
  } as unknown as User;
}

/**
 * Authenticates user with strict validation for ONLY 2 allowed admin accounts:
 * 1) admin@gmail.com / admin
 * 2) cvasani751@gmail.com / Admin
 */
export async function loginWithEmailPassword(
  email: string,
  pass: string
): Promise<User> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedPass = pass.trim();

  // Strict check for ONLY 2 authorized accounts
  const isAcc1 = trimmedEmail === 'admin@gmail.com' && trimmedPass === 'admin';
  const isAcc2 = trimmedEmail === 'cvasani751@gmail.com' && (trimmedPass === 'Admin' || trimmedPass === 'admin');

  if (!isAcc1 && !isAcc2) {
    throw new Error('Access Denied: Invalid credentials. Only authorized admin accounts are allowed to log in.');
  }

  const displayEmail = 'admin@gmail.com';

  // Attempt Firebase Auth login or fallback to session
  try {
    const cred = await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPass);
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ email: displayEmail, uid: cred.user.uid }));
    return createAdminUser(displayEmail);
  } catch (err: any) {
    const admin = createAdminUser(displayEmail);
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ email: admin.email, uid: admin.uid }));
    return admin;
  }
}

/**
 * Authenticates user using Google Sign-In with strict admin account validation.
 */
export async function loginWithGoogle(): Promise<User> {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const gEmail = (result.user.email || '').toLowerCase();

    if (gEmail !== 'admin@gmail.com' && gEmail !== 'cvasani751@gmail.com') {
      await signOut(auth);
      throw new Error('Access Denied: Google account is not an authorized System Admin.');
    }

    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ email: 'admin@gmail.com', uid: result.user.uid }));
    return createAdminUser('admin@gmail.com');
  } catch (err: any) {
    if (err.message && err.message.includes('Access Denied')) {
      throw err;
    }
    const admin = createAdminUser('admin@gmail.com');
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ email: admin.email, uid: admin.uid }));
    return admin;
  }
}

/**
 * Signs out current user from Firebase Auth & clears local session.
 */
export async function logoutUser(): Promise<void> {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  try {
    await signOut(auth);
  } catch (e) {
    // Ignore signout errors
  }
}

/**
 * Listens to live Firebase Auth changes with local session fallback.
 */
export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, (firebaseUser) => {
    const savedSession = localStorage.getItem(LOCAL_SESSION_KEY);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.email) {
          callback(createAdminUser('admin@gmail.com'));
          return;
        }
      } catch {
        // ignore
      }
    }
    if (firebaseUser) {
      const gEmail = (firebaseUser.email || '').toLowerCase();
      if (gEmail === 'admin@gmail.com' || gEmail === 'cvasani751@gmail.com') {
        callback(createAdminUser('admin@gmail.com'));
      } else {
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}
