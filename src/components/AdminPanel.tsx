import { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup,
  signOut 
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import * as XLSX from 'xlsx';
import { 
  collection, 
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db, googleProvider } from '@/config/firebase';

// Interface för tillåtna användare
interface AllowedUser {
  id: string;
  email: string;
  displayName: string;
  addedAt: Date;
  addedBy: string;
}

// Interface för användare med äggdata
interface UserWithEggData {
  userId: string;
  userName: string;
  totalEggs: number;
  entryCount: number;
  lastEntry: Date;
}

// Lista över admin-emails (från miljövariabler för säkerhet)
const ADMIN_EMAILS = import.meta.env.VITE_ADMIN_EMAILS 
  ? import.meta.env.VITE_ADMIN_EMAILS.split(',').map((email: string) => email.trim())
  : [];

const AdminPanel = ({ onClose }: { onClose: () => void }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowedUsers, setAllowedUsers] = useState<AllowedUser[]>([]);
  const [usersWithEggData, setUsersWithEggData] = useState<UserWithEggData[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Kontrollera om användaren är admin
  const isAdmin = (user: User | null): boolean => {
    if (!user?.email) return false;
    return ADMIN_EMAILS.includes(user.email);
  };

  // Lyssna på autentisering
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Lyssna på tillåtna användare
  useEffect(() => {
    if (!user || !isAdmin(user)) {
      setAllowedUsers([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'allowedUsers'),
      (snapshot) => {
        const users: AllowedUser[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id, // Detta är nu e-postadressen
            email: data.email || doc.id, // Fallback till dokument-ID som är e-posten
            displayName: data.displayName || '',
            addedAt: data.addedAt?.toDate() || new Date(),
            addedBy: data.addedBy || ''
          };
        });
        
        setAllowedUsers(users.sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime()));
      },
      (error: unknown) => {
        console.error('Fel vid hämtning av tillåtna användare:', error);
        const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
        console.error('Error details:', errorMessage);
        setMessage({ type: 'error', text: `Kunde inte hämta användarlista: ${errorMessage}` });
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Lyssna på användare med äggdata
  useEffect(() => {
    if (!user || !isAdmin(user)) {
      setUsersWithEggData([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'eggEntries'),
      (snapshot) => {
        const userDataMap = new Map<string, UserWithEggData>();
        
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const userId = data.userId;
          const userName = data.userName || 'Okänd användare';
          const count = data.count || 0;
          
          // Konvertera datum säkert
          let entryDate: Date;
          try {
            if (data.date && typeof data.date.toDate === 'function') {
              entryDate = data.date.toDate();
            } else if (data.date instanceof Date) {
              entryDate = data.date;
            } else {
              entryDate = new Date();
            }
          } catch (error) {
            entryDate = new Date();
          }
          
          const existing = userDataMap.get(userId);
          if (existing) {
            existing.totalEggs += count;
            existing.entryCount += 1;
            if (entryDate > existing.lastEntry) {
              existing.lastEntry = entryDate;
            }
          } else {
            userDataMap.set(userId, {
              userId,
              userName,
              totalEggs: count,
              entryCount: 1,
              lastEntry: entryDate
            });
          }
        });
        
        const users = Array.from(userDataMap.values())
          .sort((a, b) => b.totalEggs - a.totalEggs);
        
        setUsersWithEggData(users);
      },
      (error: unknown) => {
        console.error('Fel vid hämtning av användardata:', error);
        const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
        setMessage({ type: 'error', text: `Kunde inte hämta användardata: ${errorMessage}` });
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Logga in med Google
  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      console.error('Fel vid Google-inloggning:', error);
      const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
      setMessage({ type: 'error', text: `Kunde inte logga in: ${errorMessage}` });
      setLoading(false);
    }
  };

  // Logga ut
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onClose();
    } catch (error: unknown) {
      console.error('Fel vid utloggning:', error);
      const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
      setMessage({ type: 'error', text: `Kunde inte logga ut: ${errorMessage}` });
    }
  };

  // Lägg till användare
  const addUser = async () => {
    console.log('🔵 addUser function called');
    if (!user || !isAdmin(user)) {
      console.log('🔴 User is not admin or not logged in');
      return;
    }
    
    if (!newUserEmail.trim()) {
      setMessage({ type: 'error', text: 'E-postadress krävs' });
      return;
    }

    // Validera e-postformat
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail.trim())) {
      setMessage({ type: 'error', text: 'Ogiltig e-postadress' });
      return;
    }

    // Kontrollera om användaren redan finns
    const existingUser = allowedUsers.find(u => u.email.toLowerCase() === newUserEmail.trim().toLowerCase());
    if (existingUser) {
      setMessage({ type: 'error', text: 'Användaren är redan tillåten' });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Använd e-postadressen som dokument-ID för enklare Firestore-regler
      const emailId = newUserEmail.trim().toLowerCase();
      console.log('Försöker lägga till användare med email ID:', emailId);
      console.log('Admin-status:', isAdmin(user));
      console.log('Användarens email:', user.email);
      
      const userData = {
        email: emailId,
        displayName: newUserEmail.trim().split('@')[0], // Använd delen före @ som display name
        addedAt: serverTimestamp(),
        addedBy: user.email
      };
      
      console.log('Användardata som ska sparas:', userData);
      
      await setDoc(doc(db, 'allowedUsers', emailId), userData);
      
      console.log('Användare tillagd framgångsrikt i Firestore');
      setNewUserEmail('');
      setMessage({ type: 'success', text: 'Användare tillagd framgångsrikt' });
      
      // Rensa meddelandet efter 3 sekunder
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      console.error('Fel vid tillägg av användare:', error);
      const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
      console.error('Error details:', errorMessage);
      setMessage({ type: 'error', text: `Kunde inte lägga till användare: ${errorMessage}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ta bort användare
  const removeUser = async (userEmail: string) => {
    console.log('🔵 removeUser function called with email:', userEmail);
    if (!user || !isAdmin(user)) {
      console.error('🔴 Användare är inte admin eller inte inloggad');
      return;
    }

    if (!confirm(`Är du säker på att du vill ta bort ${userEmail} från tillåtna användare?`)) {
      return;
    }

    try {
      setIsSubmitting(true);
      const docId = userEmail.toLowerCase();
      console.log('Försöker ta bort dokument med ID:', docId);
      console.log('Användarens admin-status:', isAdmin(user));
      console.log('Användarens email:', user.email);
      
      // Istället för att använda email som document ID, sök efter dokumentet med email-fältet
      console.log('🔍 Söker efter dokument med email-fält:', userEmail);
      const q = query(collection(db, 'allowedUsers'), where('email', '==', userEmail.toLowerCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log('❌ Inget dokument hittat med email:', userEmail);
        setMessage({ type: 'error', text: 'Användaren finns inte i databasen' });
        return;
      }
      
      // Ta bort alla dokument som matchar (borde bara vara ett)
      const deletePromises = querySnapshot.docs.map(doc => {
        console.log('🗑️ Tar bort dokument:', doc.id, 'med data:', doc.data());
        return deleteDoc(doc.ref);
      });
      
      await Promise.all(deletePromises);
      console.log('✅ Dokument borttaget framgångsrikt');
      setMessage({ type: 'success', text: 'Användare borttagen' });
      
      // Rensa meddelandet efter 3 sekunder
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      console.error('Fel vid borttagning av användare:', error);
      const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
      console.error('Error details:', errorMessage);
      if (error instanceof Error && error.message.includes('permission-denied')) {
        setMessage({ type: 'error', text: 'Åtkomst nekad - kontrollera admin-behörigheter' });
      } else {
        setMessage({ type: 'error', text: `Kunde inte ta bort användare: ${errorMessage}` });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tömma all data för en användare
  const clearUserData = async (userId: string, userName: string) => {
    if (!user || !isAdmin(user)) {
      console.error('🔴 Användare är inte admin eller inte inloggad');
      return;
    }

    if (!confirm(`Är du säker på att du vill ta bort ALL äggdata för ${userName}? Detta kan inte ångras!`)) {
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('🔄 Söker efter all data för användare:', userId);
      
      // Hämta alla poster för användaren
      const userEntriesQuery = query(
        collection(db, 'eggEntries'),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(userEntriesQuery);
      console.log(`📊 Hittade ${querySnapshot.size} poster för användare ${userName}`);
      
      if (querySnapshot.empty) {
        setMessage({ type: 'error', text: 'Inga äggdata hittades för denna användare' });
        return;
      }
      
      // Använd batch för att ta bort alla poster samtidigt
      const batch = writeBatch(db);
      querySnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log('✅ All användardata borttagen framgångsrikt');
      setMessage({ 
        type: 'success', 
        text: `All äggdata för ${userName} har tagits bort (${querySnapshot.size} poster)` 
      });
      
      // Rensa meddelandet efter 5 sekunder
      setTimeout(() => setMessage(null), 5000);
    } catch (error: unknown) {
      console.error('Fel vid borttagning av användardata:', error);
      const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
      console.error('Error details:', errorMessage);
      setMessage({ type: 'error', text: `Kunde inte ta bort användardata: ${errorMessage}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Exportera användardata till Excel
  const exportUserDataToExcel = async (userId: string, userName: string) => {
    if (!user || !isAdmin(user)) {
      console.error('🔴 Användare är inte admin eller inte inloggad');
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('📊 Exporterar data för användare:', userName);
      
      // Hämta alla poster för användaren
      const userEntriesQuery = query(
        collection(db, 'eggEntries'),
        where('userId', '==', userId),
        orderBy('date', 'desc')
      );
      
      const querySnapshot = await getDocs(userEntriesQuery);
      console.log(`📋 Hittade ${querySnapshot.size} poster för användare ${userName}`);
      
      if (querySnapshot.empty) {
        setMessage({ type: 'error', text: 'Inga äggdata hittades för denna användare' });
        return;
      }
      
      // Konvertera data för Excel
      const excelData = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        
        // Konvertera datum säkert
        let dateString = 'Okänt datum';
        try {
          if (data.date && typeof data.date.toDate === 'function') {
            const date = data.date.toDate();
            dateString = date.toLocaleDateString('sv-SE');
          } else if (data.date instanceof Date) {
            dateString = data.date.toLocaleDateString('sv-SE');
          }
        } catch (error) {
          console.error('Fel vid konvertering av datum:', error);
        }
        
        return {
          'Datum': dateString,
          'Antal ägg': data.count || 0,
          'Registrerad av': data.userName || 'Okänd användare',
          'Användar-ID': data.userId || 'Okänt ID'
        };
      });
      
      // Skapa Excel-fil
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Äggdata');
      
      // Generera filnamn med användarnamn och datum
      const today = new Date().toISOString().split('T')[0];
      const sanitizedUserName = userName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `aggdata_${sanitizedUserName}_${today}.xlsx`;
      
      // Ladda ner filen
      XLSX.writeFile(workbook, filename);
      
      console.log(`✅ Excel-fil skapad: ${filename}`);
      setMessage({ 
        type: 'success', 
        text: `Excel-fil för ${userName} har laddats ner (${querySnapshot.size} poster)` 
      });
      
      // Rensa meddelandet efter 3 sekunder
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      console.error('Fel vid export av användardata:', error);
      const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
      console.error('Error details:', errorMessage);
      setMessage({ type: 'error', text: `Kunde inte exportera användardata: ${errorMessage}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-overlay">
        <div className="admin-modal">
          <div className="admin-loading">Laddar...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="admin-overlay">
        <div className="admin-modal">
          <div className="admin-header">
            <h2>Admin-inloggning</h2>
            <button onClick={onClose} className="close-button">×</button>
          </div>
          <div className="admin-content">
            <p>Logga in med ditt Google-konto för att komma åt admin-panelen.</p>
            <button onClick={signInWithGoogle} className="firebase-button google">
              Logga in med Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin(user)) {
    return (
      <div className="admin-overlay">
        <div className="admin-modal">
          <div className="admin-header">
            <h2>Åtkomst nekad</h2>
            <button onClick={onClose} className="close-button">×</button>
          </div>
          <div className="admin-content">
            <p>Du har inte behörighet att komma åt admin-panelen.</p>
            <div className="admin-actions">
              <button onClick={handleSignOut} className="firebase-button logout">
                Logga ut
              </button>
              <button onClick={onClose} className="firebase-button cancel">
                Stäng
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-overlay">
      <div className="admin-modal">
        <div className="admin-header">
          <h2>Admin Panel</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        <div className="admin-content">
          <div className="admin-user-info">
            <p>Inloggad som: <strong>{user.displayName || user.email}</strong></p>
          </div>

          {message && (
            <div className={`admin-message ${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="admin-section">
            <h3>Lägg till tillåten användare (OBS, endast gmail)</h3>
            <div className="add-user-form">
              <input
                type="email"
                placeholder="E-postadress (t.ex. user@gmail.com)"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                disabled={isSubmitting}
                className="email-input"
                onKeyPress={(e) => e.key === 'Enter' && addUser()}
              />
              <button
                onClick={() => {
                  console.log('🔵 Add user button clicked');
                  addUser();
                }}
                disabled={isSubmitting || !newUserEmail.trim()}
                className="firebase-button add-user"
              >
                {isSubmitting ? 'Lägger till...' : 'Lägg till'}
              </button>
            </div>
          </div>

          <div className="admin-section">
            <h3>Tillåtna användare ({allowedUsers.length})</h3>
            {allowedUsers.length === 0 ? (
              <p className="no-users">Inga tillåtna användare än.</p>
            ) : (
              <div className="users-list">
                {allowedUsers.map((allowedUser) => (
                  <div key={allowedUser.id} className="user-item">
                    <div className="user-info">
                      <div className="user-email">{allowedUser.email}</div>
                      <div className="user-meta">
                        Tillagd {allowedUser.addedAt.toLocaleDateString('sv-SE')} av {allowedUser.addedBy}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        console.log('🔵 Remove user button clicked for:', allowedUser.email);
                        removeUser(allowedUser.email);
                      }}
                      disabled={isSubmitting}
                      className="remove-button"
                      title="Ta bort användare"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-section">
            <h3>Användare med äggdata ({usersWithEggData.length})</h3>
            {usersWithEggData.length === 0 ? (
              <p className="no-users">Inga användare med äggdata än.</p>
            ) : (
              <div className="users-list">
                {usersWithEggData.map((userData) => (
                  <div key={userData.userId} className="user-data-item">
                    <div className="user-info">
                      <div className="user-name">{userData.userName}</div>
                      <div className="user-stats">
                        <span className="stat">🥚 {userData.totalEggs} ägg</span>
                        <span className="stat">📝 {userData.entryCount} registreringar</span>
                        <span className="stat">📅 Senast: {userData.lastEntry.toLocaleDateString('sv-SE')}</span>
                      </div>
                    </div>
                    <div className="user-actions">
                      <button
                        onClick={() => {
                          console.log('🔵 Export user data button clicked for:', userData.userName);
                          exportUserDataToExcel(userData.userId, userData.userName);
                        }}
                        disabled={isSubmitting}
                        className="export-button"
                        title="Exportera användarens äggdata till Excel"
                      >
                        📊 Exportera
                      </button>
                      <button
                        onClick={() => {
                          console.log('🔵 Clear user data button clicked for:', userData.userName);
                          clearUserData(userData.userId, userData.userName);
                        }}
                        disabled={isSubmitting}
                        className="clear-data-button"
                        title="Tömma all äggdata för denna användare"
                      >
                        🧹 Rensa data
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-actions">
            <button onClick={handleSignOut} className="firebase-button logout">
              Logga ut
            </button>
            <button onClick={onClose} className="firebase-button cancel">
              Stäng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
