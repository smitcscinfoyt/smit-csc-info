import admin from "firebase-admin";

let initialized = false;

/**
 * Lazily initialises Firebase Admin SDK using the project ID.
 * No private key required — we only verify ID tokens via the public JWKS.
 */
function getApp(): admin.app.App {
  if (!initialized) {
    admin.initializeApp({
      projectId: "smit-csc-info-7f9c5",
    });
    initialized = true;
  }
  return admin.app();
}

/**
 * Verify a Firebase ID token and return the decoded claims.
 */
export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  const app = getApp();
  return app.auth().verifyIdToken(idToken);
}
