import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// Din Firebase-konfiguration (använder miljövariabler)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialisera Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Aktivera offline-persistens för Firestore med förbättrad felhantering
// Detta gör att appen fungerar även när användaren inte har internetanslutning
try {
  // Konfigurera Firestore för bättre prestanda och ökad tillförlitlighet
  const enablePersistence = async () => {
    try {
      await enableIndexedDbPersistence(db);
      console.log('Firestore offline-persistens har aktiverats');
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err) {
        const firestoreError = err as { code: string };
        if (firestoreError.code === 'failed-precondition') {
          // Flera flikar öppna samtidigt, persistens kan bara aktiveras i en flik
          console.warn('Firestore persistens kunde inte aktiveras eftersom flera flikar är öppna');
        } else if (firestoreError.code === 'unimplemented') {
          // Webbläsaren stöder inte IndexedDB
          console.warn('Webbläsaren stöder inte IndexedDB - offline-funktionalitet ej tillgänglig');
        } else {
          console.error('Fel vid aktivering av Firestore-persistens:', err);
        }
      } else {
        console.error('Okänt fel vid aktivering av Firestore-persistens:', err);
      }
    }
  };
  
  enablePersistence().catch(e => {
    console.error('Kunde inte aktivera Firestore offline-persistens:', e);
  });
} catch (e) {
  console.error('Kunde inte initiera Firestore offline-persistens:', e);
}

// Konfigurera Google Authentication provider
const googleProvider = new GoogleAuthProvider();
// Lägg till scope om du behöver specifik information (t.ex. email, profile)
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Hjälpfunktioner för att interagera med Firestore
export const firestoreUtils = {
  /**
   * Konvertera Firestore tidsstämpel till JavaScript Date
   * @param timestamp Firestore tidsstämpel eller null/undefined
   * @returns JavaScript Date-objekt eller null
   */
  toDate: (timestamp: unknown) => {
    if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    return null;
  },
  
  /**
   * Konvertera Firestore-dokument till ett objekt med id-egenskapen
   * @param doc Firestore-dokument
   * @returns Objekt med dokumentdata och id
   */
  toObject: <T>(doc: { id: string, data: () => T }): T & { id: string } => {
    return {
      id: doc.id,
      ...doc.data()
    } as T & { id: string };
  },
  
  /**
   * Formatera ett datum för användning i Firestore-frågor
   * @param date JavaScript Date eller null
   * @returns Datum med tiden satt till början av dagen (00:00:00)
   */
  startOfDay: (date: Date | null): Date | null => {
    if (!date) return null;
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
  },
  
  /**
   * Formatera ett datum för användning i Firestore-frågor
   * @param date JavaScript Date eller null
   * @returns Datum med tiden satt till slutet av dagen (23:59:59.999)
   */
  endOfDay: (date: Date | null): Date | null => {
    if (!date) return null;
    const newDate = new Date(date);
    newDate.setHours(23, 59, 59, 999);
    return newDate;
  }
};

// Exportera Firebase-instanser för användning i din app
export { app, auth, db, googleProvider };
