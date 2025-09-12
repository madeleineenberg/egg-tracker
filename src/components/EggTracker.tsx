import { useEffect, useState, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  getDocs,
  query, 
  orderBy,
  where, 
  onSnapshot, 
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { auth, db, googleProvider } from '@/config/firebase';
import { isUserAllowed } from '@/utils/adminHelpers';
import * as XLSX from 'xlsx';

// Gränssnitt för ägg-poster
interface EggEntry {
  id: string;
  date: Date;
  count: number;
  userId: string;
  userName: string;
}

// Gränssnitt för användartotaler
interface UserTotal {
  userId: string;
  userName: string;
  totalCount: number;
}

const EggTracker = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [checkingAccess, setCheckingAccess] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eggCount, setEggCount] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [eggEntries, setEggEntries] = useState<EggEntry[]>([]);
  const [userTotals, setUserTotals] = useState<UserTotal[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [editEntry, setEditEntry] = useState<EggEntry | null>(null);
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [itemsPerPage] = useState<number>(7);

  // Filtrera ägg-poster baserat på datum
  const getFilteredEntries = useCallback((entries: EggEntry[]) => {
    if (!user) return [];
    
    return entries.filter(entry => {
      // Filtrera efter användar-ID
      const userMatch = entry.userId === user.uid;
      
      // Filtrera efter startdatum om det finns
      const afterStartDate = filterStartDate 
        ? entry.date >= filterStartDate
        : true;
      
      // Filtrera efter slutdatum om det finns
      const beforeEndDate = filterEndDate
        ? entry.date <= filterEndDate
        : true;
      
      return userMatch && afterStartDate && beforeEndDate;
    });
  }, [user, filterStartDate, filterEndDate]);

  // Få paginerade poster för visning
  const getPaginatedEntries = (entries: EggEntry[]) => {
    const filtered = getFilteredEntries(entries);
    const startIndex = currentPage * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  };

  // Beräkna totala antalet sidor
  const getTotalPages = useCallback(() => {
    const filtered = getFilteredEntries(eggEntries);
    return Math.ceil(filtered.length / itemsPerPage);
  }, [eggEntries, itemsPerPage, getFilteredEntries]);

  // Kontrollera om det finns äldre poster att visa
  const hasOlderEntries = () => {
    const filtered = getFilteredEntries(eggEntries);
    return (currentPage + 1) * itemsPerPage < filtered.length;
  };

  // Kontrollera om det finns nyare poster att visa
  const hasNewerEntries = () => {
    return currentPage > 0;
  };

  // Begränsa till en månad bakåt
  const getMaxAllowedDate = () => {
    const today = new Date();
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(today.getMonth() - 1);
    return oneMonthAgo;
  };

  // Lyssna på autentiseringsstatus
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      // Återställ paginering när användare ändras
      setCurrentPage(0);
      
      // Kontrollera åtkomst
      setCheckingAccess(true);
      if (currentUser) {
        const access = await isUserAllowed(currentUser);
        setHasAccess(access);
      } else {
        setHasAccess(false);
      }
      setCheckingAccess(false);
    });

    return () => unsubscribe();
  }, []);

  // Återställ paginering när filter ändras
  useEffect(() => {
    setCurrentPage(0);
  }, [filterStartDate, filterEndDate]);

  // Kontrollera att nuvarande sida är giltig när data ändras
  useEffect(() => {
    const totalPages = getTotalPages();
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [eggEntries, currentPage, getTotalPages]);

  // Lyssna på gårdsstatistik (alla användares data för aktuellt år)
  useEffect(() => {
    try {
      // Skapa datum för start och slut av aktuellt kalenderår
      const currentYear = new Date().getFullYear();
      const startOfYear = new Date(currentYear, 0, 1); // 1 januari
      const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59); // 31 december
      
      // Hämta alla poster för aktuellt kalenderår för gårdsstatistik
      const farmStatsQuery = query(
        collection(db, 'eggEntries'),
        where('date', '>=', Timestamp.fromDate(startOfYear)),
        where('date', '<=', Timestamp.fromDate(endOfYear)),
        orderBy('date', 'desc')
      );

      const unsubscribe = onSnapshot(
        farmStatsQuery, 
        (snapshot) => {
          const allEntries: EggEntry[] = snapshot.docs.map((doc) => {
            const data = doc.data();
            
            // Säker konvertering av Firestore-datum till JavaScript Date
            let entryDate: Date;
            try {
              if (data.date && typeof data.date.toDate === 'function') {
                entryDate = data.date.toDate();
              } else if (data.date instanceof Date) {
                entryDate = data.date;
              } else {
                console.warn('Ogiltigt datum för post:', doc.id);
                entryDate = new Date(); // Fallback till aktuellt datum
              }
            } catch (error) {
              console.error('Fel vid konvertering av datum:', error);
              entryDate = new Date(); // Fallback till aktuellt datum
            }
            
            return {
              id: doc.id,
              date: entryDate,
              count: typeof data.count === 'number' ? data.count : 0,
              userId: data.userId || '',
              userName: data.userName || 'Okänd användare'
            };
          });
          
          // Beräkna användartotaler för aktuellt år
          const userTotalMap = new Map<string, UserTotal>();
          
          allEntries.forEach(entry => {
            const existing = userTotalMap.get(entry.userId);
            if (existing) {
              existing.totalCount += entry.count;
            } else {
              userTotalMap.set(entry.userId, {
                userId: entry.userId,
                userName: entry.userName,
                totalCount: entry.count
              });
            }
          });
          
          // Konvertera till array och sortera efter totalCount
          const sortedUserTotals = Array.from(userTotalMap.values())
            .sort((a, b) => b.totalCount - a.totalCount);
          
          setUserTotals(sortedUserTotals);
        }, 
        (error) => {
          console.error('Fel vid hämtning av gårdsstatistik:', error);
          const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
          setErrorMessage(`Ett fel uppstod vid hämtning av gårdsstatistik: ${errorMessage}`);
          
          // Automatiskt ta bort felmeddelandet efter 5 sekunder
          setTimeout(() => {
            setErrorMessage('');
          }, 5000);
        }
      );

      return () => unsubscribe();
    } catch (error: unknown) {
      console.error('Fel vid uppsättning av gårdsstatistik-lyssnare:', error);
      const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
      setErrorMessage(`Ett fel uppstod vid anslutning till databasen: ${errorMessage}`);
      
      // Automatiskt ta bort felmeddelandet efter 5 sekunder
      setTimeout(() => {
        setErrorMessage('');
      }, 5000);
    }
  }, []);

  // Lyssna på ägg-poster från Firestore - endast användarens egna poster
  useEffect(() => {
    if (!user) {
      // Om användaren inte är inloggad, rensa endast användarens egna poster
      setEggEntries([]);
      return;
    }

    try {
      // Hämta bara poster som tillhör den inloggade användaren
      const eggEntriesQuery = query(
        collection(db, 'eggEntries'),
        where('userId', '==', user.uid),
        orderBy('date', 'desc')
      );

      const unsubscribe = onSnapshot(
        eggEntriesQuery, 
        (snapshot) => {
          const entries: EggEntry[] = snapshot.docs.map((doc) => {
            const data = doc.data();
            
            // Säker konvertering av Firestore-datum till JavaScript Date
            let entryDate: Date;
            try {
              if (data.date && typeof data.date.toDate === 'function') {
                entryDate = data.date.toDate();
              } else if (data.date instanceof Date) {
                entryDate = data.date;
              } else {
                console.warn('Ogiltigt datum för post:', doc.id);
                entryDate = new Date(); // Fallback till aktuellt datum
              }
            } catch (error) {
              console.error('Fel vid konvertering av datum:', error);
              entryDate = new Date(); // Fallback till aktuellt datum
            }
            
            return {
              id: doc.id,
              date: entryDate,
              count: typeof data.count === 'number' ? data.count : 0,
              userId: data.userId || '',
              userName: data.userName || 'Okänd användare'
            };
          });
          
          setEggEntries(entries);
          
          // Användarens egna totaler beräknas redan i gårdsstatistiken ovan
          // så vi behöver inte duplicera den logiken här
        }, 
        (error) => {
          console.error('Fel vid hämtning av äggdata:', error);
          const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
          setErrorMessage(`Ett fel uppstod vid hämtning av äggdata: ${errorMessage}`);
          
          // Automatiskt ta bort felmeddelandet efter 5 sekunder
          setTimeout(() => {
            setErrorMessage('');
          }, 5000);
        }
      );

      return () => unsubscribe();
    } catch (error: unknown) {
      console.error('Fel vid uppsättning av äggdata-lyssnare:', error);
      const errorMessage = error instanceof Error ? error.message : 'Okänt fel';
      setErrorMessage(`Ett fel uppstod vid anslutning till databasen: ${errorMessage}`);
      
      // Automatiskt ta bort felmeddelandet efter 5 sekunder
      setTimeout(() => {
        setErrorMessage('');
      }, 5000);
    }
  }, [user]);

  // Logga in med Google
  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Fel vid Google-inloggning:', error);
      setLoading(false);
    }
  };

  // Spara ägginmatning
  const saveEggEntry = async () => {
    if (!user) return;
    
    // Validera inmatningen
    if (eggCount <= 0) {
      setErrorMessage('Antal ägg måste vara större än 0');
      return;
    }
    
    if (eggCount > 100) {
      setErrorMessage('Antal ägg kan inte vara fler än 100');
      return;
    }
    
    // Kontrollera att datumet är giltigt
    if (!selectedDate || !(selectedDate instanceof Date) || isNaN(selectedDate.getTime())) {
      setErrorMessage('Ogiltigt datum. Vänligen välj ett giltigt datum.');
      return;
    }
    
    // Kontrollera att datumet inte är i framtiden
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDay = new Date(selectedDate);
    selectedDay.setHours(0, 0, 0, 0);
    
    if (selectedDay > today) {
      setErrorMessage('Du kan inte registrera ägg för framtida datum');
      return;
    }

    try {
      // Återställ felmeddelanden och sätt laddningsstatus
      setErrorMessage('');
      setIsSubmitting(true);
      
      // Om vi redigerar en befintlig post
      if (editEntry) {
        // Kontrollera att datumet är ett JavaScript Date-objekt och konvertera det till Timestamp för Firestore
        const firestoreDate = selectedDate instanceof Date ? Timestamp.fromDate(selectedDate) : selectedDate;
        
        await updateDoc(doc(db, 'eggEntries', editEntry.id), {
          count: eggCount,
          date: firestoreDate,
          updatedAt: serverTimestamp()
        });
        
        // Visa bekräftelsemeddelande
        setSuccessMessage(`Ägginmatning för ${formatDate(selectedDate)} har uppdaterats`);
        
        // Återställ redigeringsläge
        setEditEntry(null);
      } else {
        // Kontrollera om det redan finns en post för denna dag och användare
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        // Konvertera till Firestore Timestamp för korrekt jämförelse
        const startTimestamp = Timestamp.fromDate(startOfDay);
        const endTimestamp = Timestamp.fromDate(endOfDay);
        
        try {
          const existingEntryQuery = query(
            collection(db, 'eggEntries'),
            where('userId', '==', user.uid),
            where('date', '>=', startTimestamp),
            where('date', '<=', endTimestamp)
          );
          
          const querySnapshot = await getDocs(existingEntryQuery);
          
          if (!querySnapshot.empty) {
            setErrorMessage('Du har redan registrerat ägg för detta datum. Vänligen välj ett annat datum.');
            setIsSubmitting(false);
            return;
          }
        } catch (queryError: unknown) {
          console.error('Fel vid kontroll av befintliga poster:', queryError);
          const errorMessage = queryError instanceof Error ? queryError.message : 'Okänt fel';
          setErrorMessage(`Kunde inte kontrollera befintliga poster: ${errorMessage}`);
          setIsSubmitting(false);
          return;
        }
        
        // Spara ny post
        try {
          console.log('Försöker spara ny äggpost:', {
            date: selectedDate,
            count: eggCount,
            userId: user.uid,
            userName: user.displayName || 'Anonym användare'
          });
          
          // Kontrollera att datumet är ett JavaScript Date-objekt och konvertera det till Timestamp för Firestore
          const firestoreDate = selectedDate instanceof Date ? Timestamp.fromDate(selectedDate) : selectedDate;
          
          await addDoc(collection(db, 'eggEntries'), {
            date: firestoreDate,
            count: eggCount,
            userId: user.uid,
            userName: user.displayName || 'Anonym användare',
            createdAt: serverTimestamp()
          });
          
          // Visa bekräftelsemeddelande
          setSuccessMessage(`${eggCount} ägg har registrerats för ${formatDate(selectedDate)}`);
        } catch (saveError: unknown) {
          console.error('Detaljerat fel vid sparande:', saveError);
          // Säkrare felhantering med typcheckning
          const errorMessage = saveError instanceof Error ? saveError.message : 'Okänt fel';
          setErrorMessage(`Kunde inte spara ägg: ${errorMessage}`);
          setIsSubmitting(false);
          return;
        }
      }
      
      // Återställ formuläret efter 3 sekunder
      setTimeout(() => {
        setSuccessMessage('');
        setEggCount(0);
        setSelectedDate(new Date());
      }, 3000);
      
    } catch (error: unknown) {
      console.error('Fel vid sparande av ägg:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ett oväntat fel inträffade';
      setErrorMessage(`Ett fel uppstod när äggen skulle sparas: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Hantera redigering av en befintlig post
  const handleEdit = (entry: EggEntry) => {
    // Kontrollera om posten är inom tillåten redigeringsperiod (1 månad)
    const maxAllowedDate = getMaxAllowedDate();
    if (entry.date < maxAllowedDate) {
      setErrorMessage('Du kan endast redigera poster från den senaste månaden.');
      setTimeout(() => {
        setErrorMessage('');
      }, 5000);
      return;
    }
    
    setEditEntry(entry);
    setEggCount(entry.count);
    setSelectedDate(entry.date);
    
    // Scrolla till formuläret
    document.querySelector('.egg-form')?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Hantera borttagning av en post
  const handleDelete = async (entryId: string) => {
    // Hitta posten för att kontrollera datumet
    const entry = eggEntries.find(e => e.id === entryId);
    if (entry && entry.date < getMaxAllowedDate()) {
      setErrorMessage('Du kan endast ta bort poster från den senaste månaden.');
      setTimeout(() => {
        setErrorMessage('');
      }, 5000);
      return;
    }
    
    if (!confirm('Är du säker på att du vill ta bort denna ägginmatning?')) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      await deleteDoc(doc(db, 'eggEntries', entryId));
      setSuccessMessage('Ägginmatningen har tagits bort');
      
      // Återställ eventuellt redigeringsläge
      if (editEntry && editEntry.id === entryId) {
        setEditEntry(null);
        setEggCount(0);
        setSelectedDate(new Date());
      }
      
      // Dölj bekräftelsemeddelande efter 3 sekunder
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error: unknown) {
      console.error('Fel vid borttagning av ägg:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ett oväntat fel inträffade';
      setErrorMessage(`Kunde inte ta bort ägginmatningen: ${errorMessage}`);
      setIsSubmitting(false);
      
      // Automatiskt ta bort felmeddelandet efter 5 sekunder
      setTimeout(() => {
        setErrorMessage('');
      }, 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Beräkna statistik för aktuell användare
  const calculateUserStats = () => {
    if (!user) return null;
    
    const filteredEntries = getFilteredEntries(eggEntries);
    const userTotal = filteredEntries.reduce((sum, entry) => sum + entry.count, 0);
    const daysCount = filteredEntries.length;
    const average = daysCount > 0 ? Math.round((userTotal / daysCount) * 10) / 10 : 0;
    
    return {
      totalEggs: userTotal,
      daysCount: daysCount,
      average: average
    };
  };

  // Skapa data för månadsöversikt över aktuellt kalenderår
  const prepareChartData = () => {
    if (!user) return null;
    
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1); // 1 januari
    const endOfYear = new Date(currentYear, 11, 31); // 31 december
    
    // Filtrera poster från aktuellt kalenderår, oberoende av andra filter
    const yearEntries = eggEntries.filter(entry => {
      return entry.userId === user.uid && 
             entry.date >= startOfYear && 
             entry.date <= endOfYear;
    });
    
    // Skapa månadsdata för aktuellt kalenderår (jan-dec)
    const monthlyData: { [key: string]: number } = {};
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
      'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'
    ];
    
    // Initiera alla månader för aktuellt år med 0
    for (let i = 0; i < 12; i++) {
      const monthKey = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = 0;
    }
    
    // Summera ägg per månad
    yearEntries.forEach(entry => {
      const entryDate = entry.date instanceof Date ? entry.date : (entry.date as Timestamp).toDate();
      const monthKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
      if (monthKey in monthlyData) {
        monthlyData[monthKey] += entry.count;
      }
    });
    
    // Konvertera till array och sortera efter datum (januari först)
    const chartData = Object.entries(monthlyData)
      .map(([monthKey, count]) => {
        const [, month] = monthKey.split('-');
        const monthIndex = parseInt(month) - 1;
        return {
          date: monthNames[monthIndex],
          count: count,
          sortKey: monthKey
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(({ date, count }) => ({ date, count }));
    
    return chartData;
  };

  // Formatera datum
  const formatDate = (date: Date | Timestamp | null | undefined): string => {
    if (!date) return 'Okänt datum';
    
    // Om det är en Timestamp, konvertera till Date
    const dateObject = date instanceof Timestamp ? date.toDate() : date;
    
    return dateObject.toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  // Formatera datum med veckodag
  const formatDateWithDay = (date: Date | Timestamp | null | undefined): string => {
    if (!date) return 'Okänt datum';
    
    // Om det är en Timestamp, konvertera till Date
    const dateObject = date instanceof Timestamp ? date.toDate() : date;
    
    const weekdays = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
    const weekday = weekdays[dateObject.getDay()];
    const formatted = formatDate(dateObject);
    
    return `${formatted} (${weekday})`;
  };

  // Exportera äggdata till Excel
  const exportToExcel = () => {
    if (!user || getFilteredEntries(eggEntries).length === 0) return;

    try {
      // Förbereda data för Excel
      const data = getFilteredEntries(eggEntries).map(entry => ({
        'Datum': formatDate(entry.date),
        'Antal ägg': entry.count,
        'Registrerad av': entry.userName
      }));

      // Skapa ett nytt arbetsblad
      const worksheet = XLSX.utils.json_to_sheet(data);

      // Skapa en ny arbetsbok och lägg till arbetsbladet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Äggdata');

      // Generera filnamn baserat på datumintervall
      const today = new Date().toISOString().split('T')[0];
      let fileName = `aggdata_${today}.xlsx`;
      
      if (filterStartDate && filterEndDate) {
        const start = filterStartDate.toISOString().split('T')[0];
        const end = filterEndDate.toISOString().split('T')[0];
        fileName = `aggdata_${start}_till_${end}.xlsx`;
      } else if (filterStartDate) {
        const start = filterStartDate.toISOString().split('T')[0];
        fileName = `aggdata_fran_${start}.xlsx`;
      } else if (filterEndDate) {
        const end = filterEndDate.toISOString().split('T')[0];
        fileName = `aggdata_till_${end}.xlsx`;
      }

      // Exportera arbetsboken till en fil
      XLSX.writeFile(workbook, fileName);
      
      // Visa bekräftelsemeddelande
      setSuccessMessage(`Excel-fil har exporterats: ${fileName}`);
      
      // Ta bort bekräftelsemeddelandet efter 3 sekunder
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error('Fel vid export till Excel:', error);
      setErrorMessage('Kunde inte exportera data till Excel. Försök igen.');
      
      // Ta bort felmeddelandet efter 5 sekunder
      setTimeout(() => {
        setErrorMessage('');
      }, 5000);
    }
  };

  if (loading || checkingAccess) {
    return <div className="egg-tracker">Laddar...</div>;
  }

  // Om användaren är inloggad men inte har åtkomst
  if (user && !hasAccess) {
    return (
      <div className="egg-tracker">
        <h2>Åtkomst begränsad</h2>
        <div className="access-denied">
          <p>Du är inloggad som: <strong>{user.displayName || user.email}</strong></p>
          <p>Din e-postadress har inte behörighet att använda äggtrackern.</p>
          <p>Kontakta administratören för att få åtkomst.</p>
          <div className="auth-buttons">
            <button onClick={() => auth.signOut()} className="firebase-button logout">
              Logga ut
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="egg-tracker">
      <h2>Äggregistrering</h2>
      
      {user ? (
        <div className="egg-tracker-authenticated">
          <div className="user-info">
            <div className="user-details">
              <p className="user-name">Inloggad som: {user.displayName || user.uid}</p>
              {userTotals.find(ut => ut.userId === user.uid) && (
                <p className="user-total">
                  Totalt antal ägg: <span className="highlight">{userTotals.find(ut => ut.userId === user.uid)?.totalCount || 0}</span>
                </p>
              )}
            </div>
            <button onClick={() => auth.signOut()} className="firebase-button logout">
              Logga ut
            </button>
          </div>
          
          <div className="egg-form">
            <h3>{editEntry ? 'Redigera ägginmatning' : 'Registrera äggskörd'}</h3>
            {errorMessage && (
              <div className="error-message">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="success-message">
                {successMessage}
              </div>
            )}
            <div className="egg-input-container">
              <div className="form-group">
                <label htmlFor="date-picker">Datum:</label>
                <input
                  type="date"
                  id="date-picker"
                  value={selectedDate instanceof Date ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    setErrorMessage(''); // Rensa felmeddelanden när datumet ändras
                    const newDate = new Date(e.target.value);
                    // Validera datumet
                    if (isNaN(newDate.getTime())) {
                      setErrorMessage('Ogiltigt datum. Vänligen välj ett giltigt datum.');
                    } else {
                      setSelectedDate(newDate);
                    }
                  }}
                  className="date-input"
                  max={new Date().toISOString().split('T')[0]} // Förhindra val av framtida datum
                  disabled={editEntry !== null} // Inaktivera datumfältet vid redigering
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="egg-count">Antal ägg:</label>
                <input
                  type="number"
                  id="egg-count"
                  min="1"
                  max="100"
                  value={eggCount}
                  onChange={(e) => {
                    setErrorMessage(''); // Rensa felmeddelanden när antal ändras
                    setEggCount(parseInt(e.target.value) || 0);
                  }}
                  className="egg-input"
                />
              </div>
              
              <div className="form-buttons">
                <button 
                  onClick={saveEggEntry} 
                  disabled={eggCount <= 0 || isSubmitting}
                  className={`firebase-button save ${isSubmitting ? 'loading' : ''}`}
                >
                  {isSubmitting 
                    ? 'Sparar...' 
                    : editEntry 
                      ? 'Uppdatera' 
                      : 'Spara'
                  }
                </button>
                
                {editEntry && (
                  <button 
                    onClick={() => {
                      setEditEntry(null);
                      setEggCount(0);
                      setSelectedDate(new Date());
                      setErrorMessage('');
                    }} 
                    className="firebase-button cancel"
                    disabled={isSubmitting}
                  >
                    Avbryt
                  </button>
                )}
              </div>
            </div>
          </div>
          
          <div className="egg-statistics">
            <div className="egg-history">
              <h3>Dina registrerade ägg</h3>
              
              <div className="date-filter">
                <div className="filter-container">
                  <div className="filter-inputs">
                    <div className="filter-item">
                      <label htmlFor="filter-start">Från:</label>
                      <input
                        type="date"
                        id="filter-start"
                        value={filterStartDate ? filterStartDate.toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            setFilterStartDate(new Date(e.target.value));
                          } else {
                            setFilterStartDate(null);
                          }
                        }}
                        className="date-input"
                      />
                    </div>
                    
                    <div className="filter-item">
                      <label htmlFor="filter-end">Till:</label>
                      <input
                        type="date"
                        id="filter-end"
                        value={filterEndDate ? filterEndDate.toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            setFilterEndDate(new Date(e.target.value));
                          } else {
                            setFilterEndDate(null);
                          }
                        }}
                        className="date-input"
                      />
                    </div>
                  </div>
                  
                  <div className="filter-actions">
                    <button 
                      onClick={() => {
                        setFilterStartDate(null);
                        setFilterEndDate(null);
                      }}
                      className="firebase-button filter-reset"
                      disabled={!filterStartDate && !filterEndDate}
                    >
                      Rensa filter
                    </button>
                    
                    <button 
                      onClick={exportToExcel}
                      className="firebase-button export-excel"
                      disabled={getFilteredEntries(eggEntries).length === 0}
                      title="Exportera filtrerad data till Excel"
                    >
                      Exportera till Excel
                    </button>
                  </div>
                </div>
              </div>
              
              {getFilteredEntries(eggEntries).length === 0 ? (
                <p>{filterStartDate || filterEndDate ? 'Inga ägg hittades för valda datum.' : 'Du har inte registrerat några ägg ännu.'}</p>
              ) : (
                <>
                  <div className="stats-summary">
                    {(() => {
                      const stats = calculateUserStats();
                      if (!stats) return null;
                      
                      return (
                        <>
                          <div className="stat-item">
                            <span className="stat-label">Totalt antal ägg:</span>
                            <span className="stat-value">{stats.totalEggs} st</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-label">Antal dagar:</span>
                            <span className="stat-value">{stats.daysCount} dagar</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-label">Genomsnitt:</span>
                            <span className="stat-value">{stats.average} ägg/dag</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {eggEntries.filter(e => e.userId === user?.uid).length > 0 && (
                    <div className="egg-chart">
                      <h3>Äggproduktion {new Date().getFullYear()} (per månad)</h3>
                      <div className="chart-container">
                        {(() => {
                          const chartData = prepareChartData();
                          if (!chartData || chartData.length === 0) return null;
                          
                          // Hitta max värde för att skala chartet
                          const maxCount = Math.max(...chartData.map(d => d.count));
                          const scaleFactor = maxCount > 0 ? 100 / maxCount : 0;
                          
                          return (
                            <>
                              <div className="chart-bars">
                                {chartData.map((dataPoint, index) => (
                                  <div key={index} className="chart-bar-container">
                                    <div 
                                      className="chart-bar" 
                                      style={{ 
                                        height: dataPoint.count > 0 ? `${dataPoint.count * scaleFactor}%` : '2px',
                                        opacity: dataPoint.count > 0 ? 1 : 0.3
                                      }}
                                      title={`${dataPoint.date}: ${dataPoint.count} ägg${dataPoint.count === 0 ? ' (ingen registrering)' : ''}`}
                                    >
                                      {dataPoint.count > 0 && (
                                        <span className="chart-value">{dataPoint.count}</span>
                                      )}
                                    </div>
                                    <div className="chart-label">
                                      {dataPoint.date}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="egg-data-container">
              {getFilteredEntries(eggEntries).length > 0 && (
                <>
                  <div className="egg-table-wrapper">
                    <h3>Registrerade tillfällen</h3>
                    <p>Du kan redigera upp till 30 dagar efter registreringen.</p>
                    <table className="egg-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Antal</th>
                          <th>Åtgärder</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getPaginatedEntries(eggEntries).map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDateWithDay(entry.date)}</td>
                            <td>{entry.count} st</td>
                            <td className="actions">
                              <button 
                                onClick={() => handleEdit(entry)} 
                                className="action-button edit"
                                title={entry.date < getMaxAllowedDate() ? "Kan endast redigera poster från senaste månaden" : "Redigera"}
                                disabled={isSubmitting || entry.date < getMaxAllowedDate()}
                              >
                                ✏️
                              </button>
                              <button 
                                onClick={() => handleDelete(entry.id)} 
                                className="action-button delete"
                                title={entry.date < getMaxAllowedDate() ? "Kan endast ta bort poster från senaste månaden" : "Ta bort"}
                                disabled={isSubmitting || entry.date < getMaxAllowedDate()}
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        ))}                        </tbody>
                    </table>
                    
                    {/* Paginering - visa endast om det finns fler än itemsPerPage poster */}
                    {getFilteredEntries(eggEntries).length > itemsPerPage && (
                      <div className="pagination-container">
                        <div className="pagination-info">
                          <p>
                            Visar {currentPage * itemsPerPage + 1}-{Math.min((currentPage + 1) * itemsPerPage, getFilteredEntries(eggEntries).length)} 
                            av {getFilteredEntries(eggEntries).length} tillfällen
                          </p>
                          <p className="page-info">
                            Sida {currentPage + 1} av {getTotalPages()}
                          </p>
                        </div>
                        
                        <div className="pagination-controls">
                          <button 
                            onClick={() => setCurrentPage(0)}
                            disabled={!hasNewerEntries()}
                            className="firebase-button pagination-button"
                            title="Första sidan (senaste tillfällena)"
                          >
                            Senaste
                          </button>
                          
                          <button 
                            onClick={() => setCurrentPage(currentPage - 1)}
                            disabled={!hasNewerEntries()}
                            className="firebase-button pagination-button"
                            title="Nyare tillfällen"
                          >
                            ← Nyare
                          </button>
                          
                          <button 
                            onClick={() => setCurrentPage(currentPage + 1)}
                            disabled={!hasOlderEntries()}
                            className="firebase-button pagination-button"
                            title="Äldre tillfällen"
                          >
                            Äldre →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="egg-tracker-auth">
          <p>Du behöver logga in för att registrera, redigera och se dina ägg.</p>
          <div className="auth-buttons">
            <button onClick={signInWithGoogle} className="firebase-button google">
              Logga in med Google
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EggTracker;
