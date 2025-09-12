import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db, firestoreUtils } from '@/config/firebase';

// Gränssnitt för ägg-poster
export interface EggEntry {
  id: string;
  date: Date;
  count: number;
  userId: string;
  userName: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Gränssnitt för inkommande ägg-data
export interface EggEntryInput {
  date: Date;
  count: number;
  userId: string;
  userName: string;
}

// Samlingskonstanter
export const COLLECTIONS = {
  EGG_ENTRIES: 'eggEntries',
  USER_STATS: 'userStats',
  ADMINS: 'admins'
};

/**
 * Hämta ägg-poster för en specifik användare
 * @param userId Användar-ID
 * @returns Promise med array av ägg-poster
 */
export const fetchUserEggEntries = async (userId: string): Promise<EggEntry[]> => {
  try {
    const q = query(
      collection(db, COLLECTIONS.EGG_ENTRIES),
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        date: firestoreUtils.toDate(data.date) || new Date(),
        count: data.count || 0,
        userId: data.userId,
        userName: data.userName || 'Okänd användare',
        createdAt: firestoreUtils.toDate(data.createdAt),
        updatedAt: firestoreUtils.toDate(data.updatedAt)
      };
    });
  } catch (error) {
    console.error('Fel vid hämtning av ägg-poster:', error);
    throw error;
  }
};

/**
 * Prenumerera på ägg-poster för alla användare
 * @param callback Funktion som anropas när data uppdateras
 * @returns Funktion för att avsluta prenumerationen
 */
export const subscribeToAllEggEntries = (
  callback: (entries: EggEntry[]) => void
): (() => void) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.EGG_ENTRIES),
      orderBy('date', 'desc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          date: firestoreUtils.toDate(data.date) || new Date(),
          count: data.count || 0,
          userId: data.userId,
          userName: data.userName || 'Okänd användare',
          createdAt: firestoreUtils.toDate(data.createdAt),
          updatedAt: firestoreUtils.toDate(data.updatedAt)
        };
      });
      
      callback(entries);
    });
  } catch (error) {
    console.error('Fel vid prenumeration på ägg-poster:', error);
    throw error;
  }
};

/**
 * Spara en ny ägg-post
 * @param eggEntry Ägg-post att spara
 * @returns Promise med det nya dokumentets ID
 */
export const saveEggEntry = async (eggEntry: EggEntryInput): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, COLLECTIONS.EGG_ENTRIES), {
      ...eggEntry,
      createdAt: serverTimestamp()
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Fel vid sparande av ägg-post:', error);
    throw error;
  }
};

/**
 * Uppdatera en befintlig ägg-post
 * @param id Dokument-ID
 * @param updates Ändringar att applicera
 * @returns Promise som löses när uppdateringen är klar
 */
export const updateEggEntry = async (
  id: string, 
  updates: Partial<Omit<EggEntryInput, 'userId' | 'userName'>>
): Promise<void> => {
  try {
    await updateDoc(doc(db, COLLECTIONS.EGG_ENTRIES, id), {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Fel vid uppdatering av ägg-post:', error);
    throw error;
  }
};

/**
 * Ta bort en ägg-post
 * @param id Dokument-ID att ta bort
 * @returns Promise som löses när borttagningen är klar
 */
export const deleteEggEntry = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, COLLECTIONS.EGG_ENTRIES, id));
  } catch (error) {
    console.error('Fel vid borttagning av ägg-post:', error);
    throw error;
  }
};

/**
 * Kontrollera om det redan finns en ägg-post för en specifik dag och användare
 * @param userId Användar-ID
 * @param date Datum att kontrollera
 * @returns Promise som löses till true om det finns en post, annars false
 */
export const hasExistingEntryForDate = async (
  userId: string, 
  date: Date
): Promise<boolean> => {
  try {
    const startOfDay = firestoreUtils.startOfDay(date);
    const endOfDay = firestoreUtils.endOfDay(date);
    
    if (!startOfDay || !endOfDay) return false;
    
    const q = query(
      collection(db, COLLECTIONS.EGG_ENTRIES),
      where('userId', '==', userId),
      where('date', '>=', startOfDay),
      where('date', '<=', endOfDay)
    );
    
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Fel vid kontroll av befintlig ägg-post:', error);
    throw error;
  }
};
