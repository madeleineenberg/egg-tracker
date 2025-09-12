# Kom igång med Firebase Firestore i Nyponbacken

Detta dokument förklarar hur du använder Firebase Firestore i Nyponbacken-projektet.

## Översikt

Firebase Firestore är en NoSQL-databas som används för att lagra och synkronisera data i realtid mellan alla dina användare. I Nyponbacken-projektet används Firestore för att:

1. Lagra ägg-inmatningar från användare
2. Synkronisera data i realtid så att användare ser uppdateringar utan att behöva uppdatera sidan
3. Stödja offline-användning, så att appen fungerar även utan internetanslutning

## Konfiguration

Firestore är redan konfigurerat i projektet. Konfigurationen finns i:
- `/src/config/firebase.ts` - Grundläggande konfiguration och initialisering
- `/src/utils/firestoreHelpers.ts` - Hjälpfunktioner för att interagera med Firestore
- `/firestore.rules` - Säkerhetsregler för databasen

## Datamodell

### Samlingar (Collections)

Databasen använder följande samlingar:

1. **eggEntries** - Lagrar alla ägginmatningar från användare
   - Struktur: `{ date: Timestamp, count: number, userId: string, userName: string, createdAt: Timestamp, updatedAt: Timestamp }`

2. **userStats** (planerad) - Kan användas för att lagra aggregerad statistik per användare
   - Struktur: `{ totalEggs: number, lastUpdated: Timestamp, ... }`

3. **admins** (planerad) - Kan användas för att hantera administratörsrättigheter
   - Struktur: `{ email: string, role: string, ... }`

## Hur du använder hjälpfunktionerna

### Importera hjälpfunktioner

```typescript
import { 
  fetchUserEggEntries, 
  subscribeToAllEggEntries,
  saveEggEntry, 
  updateEggEntry, 
  deleteEggEntry,
  hasExistingEntryForDate
} from '@/utils';
```

### Exempel på användning

#### Lyssna på ägg-poster i realtid

```typescript
useEffect(() => {
  // Prenumerera på uppdateringar
  const unsubscribe = subscribeToAllEggEntries((entries) => {
    // Uppdatera din komponents state med nya data
    setEggEntries(entries);
  });
  
  // Avsluta prenumerationen när komponenten avmonteras
  return () => unsubscribe();
}, []);
```

#### Spara en ny ägg-inmatning

```typescript
const handleSaveEgg = async () => {
  try {
    // Kontrollera om det redan finns en inmatning för detta datum
    const alreadyExists = await hasExistingEntryForDate(user.uid, selectedDate);
    if (alreadyExists) {
      setErrorMessage('Du har redan registrerat ägg för detta datum');
      return;
    }
    
    // Spara ny inmatning
    await saveEggEntry({
      date: selectedDate,
      count: eggCount,
      userId: user.uid,
      userName: user.displayName || 'Anonym användare'
    });
    
    setSuccessMessage(`${eggCount} ägg har registrerats för ${formatDate(selectedDate)}`);
  } catch (error) {
    console.error('Fel vid sparande av ägg:', error);
    setErrorMessage('Ett fel uppstod. Försök igen senare.');
  }
};
```

#### Uppdatera en befintlig ägg-inmatning

```typescript
const handleUpdate = async (entryId) => {
  try {
    await updateEggEntry(entryId, {
      count: newCount,
      date: newDate
    });
    
    setSuccessMessage('Ägginmatningen har uppdaterats');
  } catch (error) {
    console.error('Fel vid uppdatering:', error);
    setErrorMessage('Ett fel uppstod. Försök igen senare.');
  }
};
```

#### Ta bort en ägg-inmatning

```typescript
const handleDelete = async (entryId) => {
  if (!confirm('Är du säker på att du vill ta bort denna ägginmatning?')) {
    return;
  }
  
  try {
    await deleteEggEntry(entryId);
    setSuccessMessage('Ägginmatningen har tagits bort');
  } catch (error) {
    console.error('Fel vid borttagning:', error);
    setErrorMessage('Ett fel uppstod. Försök igen senare.');
  }
};
```

## Offline-funktionalitet

Firestore stöder offline-användning, vilket betyder att:

1. Användare kan fortsätta använda appen även utan internetanslutning
2. Ändringar lagras lokalt och synkroniseras automatiskt när användaren är online igen
3. En status-indikator visas när användaren är offline

För att se aktuell online/offline-status, använd `FirestoreStatus`-komponenten som visas i botten av appen.

## Säkerhetsregler

Firestore använder säkerhetsregler för att kontrollera vilka användare som kan läsa och skriva data. Reglerna finns i `firestore.rules` och säkerställer att:

1. Endast autentiserade användare kan läsa och skriva data
2. Användare kan bara redigera och ta bort sina egna ägg-inmatningar
3. Data valideras innan den sparas i databasen

## Felsökning

Om du stöter på problem med Firestore:

1. Kontrollera webbläsarens konsol för felmeddelanden
2. Verifiera att du har en fungerande internetanslutning
3. Säkerställ att dina Firestore-regler tillåter den operation du försöker utföra

## Lär dig mer

För att lära dig mer om Firebase Firestore:

- [Firebase Firestore dokumentation](https://firebase.google.com/docs/firestore)
- [Säkerhetsregler för Firestore](https://firebase.google.com/docs/firestore/security/get-started)
- [Offline-datapersistens i Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
