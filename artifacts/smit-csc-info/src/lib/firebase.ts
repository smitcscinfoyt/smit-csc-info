import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBQ4pe8QuzgzD0B1pIux6morG6mevqVz6o",
  authDomain: "smit-csc-info-7f9c5.firebaseapp.com",
  projectId: "smit-csc-info-7f9c5",
  storageBucket: "smit-csc-info-7f9c5.firebasestorage.app",
  messagingSenderId: "300501194613",
  appId: "1:300501194613:web:4e8919fb2f4182fef1e53c",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");

export const facebookProvider = new FacebookAuthProvider();
facebookProvider.setCustomParameters({ auth_type: "reauthenticate" });
facebookProvider.addScope("email");
facebookProvider.addScope("public_profile");

export {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
};
export type { FirebaseUser };

/**
 * Exchange a Firebase ID token for our app's JWT.
 * The backend verifies the Firebase token and returns a local session token.
 */
export async function exchangeFirebaseToken(firebaseToken: string): Promise<{
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    mobile?: string;
    isPrime?: boolean;
  };
}> {
  const base = import.meta.env.BASE_URL ?? "/smit-csc-info/";
  const res = await fetch(`${base}api/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: firebaseToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Auth failed" }));
    throw new Error(err.error ?? "Firebase authentication failed");
  }
  return res.json();
}
