import '@styles/App.scss'
import EggTracker from '@components/EggTracker'
import AdminPanel from '@components/AdminPanel'
import { useState, useEffect, useCallback } from 'react'
import { collection, query, onSnapshot, orderBy, where, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';

// Gränssnitt för användartotaler
interface UserTotal {
  userId: string;
  userName: string;
  totalCount: number;
}

function App() {
  const [totalEggs, setTotalEggs] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userTotals, setUserTotals] = useState<UserTotal[]>([]);
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  
  // Hämta totalt antal ägg för alla användare för aktuellt kalenderår
  useEffect(() => {
    console.log('Laddar äggstatistik för aktuellt år...');
    setIsLoading(true);
    
    try {
      // Skapa datum för start och slut av aktuellt kalenderår
      const currentYear = new Date().getFullYear();
      const startOfYear = new Date(currentYear, 0, 1); // 1 januari
      const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59); // 31 december
      
      // Lyssna på äggposter för aktuellt kalenderår
      const eggEntriesQuery = query(
        collection(db, 'eggEntries'),
        where('date', '>=', Timestamp.fromDate(startOfYear)),
        where('date', '<=', Timestamp.fromDate(endOfYear)),
        orderBy('date', 'desc')
      );
      
      console.log('Sätter upp Firestore-lyssnare för äggstatistik för år:', currentYear);
      const unsubscribe = onSnapshot(eggEntriesQuery, (snapshot) => {
        console.log('Firestore snapshot mottagen för aktuellt år:', snapshot.size, 'dokument');
        let total = 0;
        const totals: {[key: string]: UserTotal} = {};
        
        if (snapshot.empty) {
          console.log('Inga äggdata hittades för aktuellt år');
          setTotalEggs(0);
          setUserTotals([]);
          setIsLoading(false);
          return;
        }
        
        console.log('Data hittad för aktuellt år, antal dokument:', snapshot.size);
        
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          console.log('Dokumentdata:', doc.id, data);
          const count = data.count || 0;
          total += count;
          
          // Samla användarstatistik
          if (data.userId) {
            if (!totals[data.userId]) {
              totals[data.userId] = {
                userId: data.userId,
                userName: data.userName || 'Okänd användare',
                totalCount: 0
              };
            }
            totals[data.userId].totalCount += count;
          }
        });
        
        console.log('Beräknad statistik för aktuellt år:', { totalEggs: total, userCount: Object.keys(totals).length });
        setTotalEggs(total);
        setUserTotals(Object.values(totals).sort((a, b) => b.totalCount - a.totalCount));
        setIsLoading(false);
      }, (error) => {
        console.error('Fel vid hämtning av äggdata för aktuellt år:', error);
        setIsLoading(false);
      });
      
      return () => unsubscribe();
    } catch (error) {
      console.error('Fel vid uppsättning av äggdata-lyssnare för aktuellt år:', error);
      setIsLoading(false);
    }
  }, []);
  
  // Diagnostisk funktion för att hjälpa till med felsökning
  const logDebugInfo = useCallback(() => {
    console.group('Äggtracker diagnostik');
    console.log('Inläsningsstatus:', isLoading);
    console.log('Totalt antal ägg:', totalEggs);
    console.log('Antal användare med registrerade ägg:', userTotals.length);
    console.log('Användarstatistik:', userTotals);
    console.groupEnd();
  }, [isLoading, totalEggs, userTotals]);

  // Kör diagnostik när statistik laddas
  useEffect(() => {
    if (!isLoading) {
      logDebugInfo();
    }
  }, [isLoading, logDebugInfo]);
  
  return (
    <>
      <div className='app-container'>
        <header className='app-header'>
          <div className='header-container'>
            <h1>Nyponbackens Äggtracker</h1>
            <p className='app-description'>
              Håll koll på gårdens äggproduktion
            </p>
            {isLoading ? (
              <div className='total-eggs-counter loading'>
                <span className='loading-indicator'>Laddar statistik...</span>
              </div>
            ) : (
              <div className='total-eggs-counter'>
                <span className='total-eggs-number'>{totalEggs}</span>
                <span className='total-eggs-label'>ägg plockade {new Date().getFullYear()}</span>
              </div>
            )}
          </div>
        </header>

        <main>
          <section className='app-statistics'>
            <div className='container'>
              <h2>Gårdsstatistik {new Date().getFullYear()}</h2>
              <p className='stats-description'>
                Visar statistik för hela gården från 1 januari till 31 december {new Date().getFullYear()}
              </p>

              {isLoading ? (
                <div className='loading-stats'>
                  <p>Laddar statistik...</p>
                </div>
              ) : (
                <div className='stats-container'>
                  {userTotals.length === 0 ? (
                    <div className='empty-state'>
                      <p>Inga ägg har registrerats för {new Date().getFullYear()} ännu.</p>
                    </div>
                  ) : (
                    <>
                      <div className='farm-overview'>
                        <div className='overview-stats'>
                          <div className='stat-card'>
                            <div className='stat-number'>{totalEggs}</div>
                            <div className='stat-label'>Totalt antal ägg {new Date().getFullYear()}</div>
                          </div>
                          <div className='stat-card'>
                            <div className='stat-number'>{userTotals.length}</div>
                            <div className='stat-label'>Aktiva användare</div>
                          </div>
                          <div className='stat-card'>
                            <div className='stat-number'>
                              {userTotals.length > 0 ? Math.round(totalEggs / userTotals.length) : 0}
                            </div>
                            <div className='stat-label'>Genomsnitt per användare</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className='users-overview'>
                        <h3>Användaröversikt {new Date().getFullYear()}</h3>
                        <table className='egg-table'>
                          <thead>
                            <tr>
                              <th>Användare</th>
                              <th>Antal ägg</th>
                              <th>Andel av totalt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {userTotals.map((userTotal) => (
                              <tr key={userTotal.userId}>
                                <td>{userTotal.userName}</td>
                                <td>{userTotal.totalCount} st</td>
                                <td>{totalEggs > 0 ? Math.round((userTotal.totalCount / totalEggs) * 100) : 0}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
          <EggTracker />
        </main>
      </div>

      <footer className='app-footer'>
        <div className="footer-content">
          <p>
            © {new Date().getFullYear()} Nyponbacken - Powered by React & Firebase - developed by <a href='https://www.madeleineenberg.com' target="_blank">www.madeleineenberg.com</a>
          </p>
          <button 
            onClick={() => setShowAdminPanel(true)}
            className="admin-button"
            title="Admin Panel"
          >
            Logga in som Admin
          </button>
        </div>
      </footer>

      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}
    </>
  );
}

export default App;