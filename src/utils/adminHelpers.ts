import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { User } from 'firebase/auth';

// Lista över admin-emails (från miljövariabler för säkerhet)
export const ADMIN_EMAILS = import.meta.env.VITE_ADMIN_EMAILS 
  ? import.meta.env.VITE_ADMIN_EMAILS.split(',').map((email: string) => email.trim())
  : [];

// Kontrollera om användaren är admin
export const isAdmin = (user: User | null): boolean => {
  if (!user?.email) return false;
  return ADMIN_EMAILS.includes(user.email);
};

// Kontrollera om användaren är tillåten att använda egg trackern
export const isUserAllowed = async (user: User | null): Promise<boolean> => {
  if (!user?.email) return false;
  
  // Admins är alltid tillåtna
  if (isAdmin(user)) return true;
  
  try {
    const userEmail = user.email.toLowerCase();
    
    // Metod 1: Kontrollera om dokumentet med e-postadressen som ID finns (nya användare)
    const userDocRef = doc(db, 'allowedUsers', userEmail);
    const userDocSnap = await getDoc(userDocRef);
    
    if (userDocSnap.exists()) {
      console.log('Användare hittad med email som dokument-ID');
      return true;
    }
    
    // Metod 2: Sök efter dokument där email-fältet matchar (gamla användare)
    console.log('Söker efter användare med email-fält:', userEmail);
    const q = query(collection(db, 'allowedUsers'), where('email', '==', userEmail));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      console.log('Användare hittad med email-fält');
      return true;
    }
    
    console.log('Användare inte hittad i allowedUsers');
    return false;
  } catch (error) {
    console.error('Fel vid kontroll av användarrättigheter:', error);
    return false;
  }
};

// Hook för att lyssna på användarrättigheter i realtid
export const checkUserAccess = (
  user: User | null,
  onAccessChange: (hasAccess: boolean) => void
) => {
  if (!user?.email) {
    onAccessChange(false);
    return;
  }
  
  // Admins har alltid åtkomst
  if (isAdmin(user)) {
    onAccessChange(true);
    return;
  }
  
  // För vanliga användare, kontrollera med Firestore
  isUserAllowed(user).then(onAccessChange);
};
