# Admin System för Nyponbackens Äggtracker

## Översikt
Administratörssystemet gör det möjligt att begränsa åtkomst till äggtrackern till endast godkända användare. Detta säkerställer att endast personer du tillåter kan registrera och redigera äggdata.

## Så här fungerar det

### 1. Admin-roller
- Administratörer definieras genom hårdkodade e-postadresser i koden
- Endast admins kan lägga till/ta bort tillåtna användare
- Admins har alltid åtkomst till systemet

### 2. Tillåtna användare
- Vanliga användare måste läggas till av en admin för att få åtkomst
- Användare som inte är tillåtna kan inte använda äggtrackern
- Systemet kontrollerar automatiskt åtkomst vid inloggning

### 3. Admin Panel
- Tillgänglig via knappen "⚙️ Admin" i footern
- Kräver inloggning med Google
- Endast admins kan komma åt panelen

## Konfiguration

### Lägga till admin-användare
1. Öppna `src/utils/adminHelpers.ts`
2. Lägg till din e-postadress i `ADMIN_EMAILS`-arrayen:
```typescript
export const ADMIN_EMAILS = [
  'madeleineenberg@gmail.com',
  'din-email@gmail.com', // Lägg till här
];
```

3. Uppdatera också `src/components/AdminPanel.tsx` på samma sätt

4. Uppdatera Firestore-reglerna i `firestore.rules`:
```plaintext
function isAdmin() {
  return request.auth != null && 
         request.auth.token.email in [
           'madeleine.enberg@gmail.com',
           'din-email@gmail.com'  // Lägg till här
         ];
}
```

### Deploying reglerna
Efter att ha uppdaterat `firestore.rules`, kör:
```bash
firebase deploy --only firestore:rules
```

## Användning

### Som admin:
1. Klicka på "⚙️ Admin" i footern
2. Logga in med ditt Google-konto
3. Lägg till tillåtna användares e-postadresser
4. Hantera befintliga användare

### Som vanlig användare:
1. Logga in med Google
2. Om du inte har åtkomst, kontakta administratören
3. När du fått åtkomst kan du använda äggtrackern normalt

## Säkerhet

### Firestore-regler
- Endast admins kan läsa/skriva i `allowedUsers`-kollektionen
- Endast tillåtna användare kan skapa/redigera äggposter
- Statistik är fortfarande publik (kan läsas av alla)

### Frontend-kontroller
- Åtkomstkontroll sker både i frontend och backend
- Känslig data skyddas genom Firestore-regler
- Admin-emails är hårdkodade för säkerhet

## Framtida funktioner
Admin-systemet är utformat för att enkelt kunna utökas med:
- Rollbaserad åtkomst (olika behörighetsnivåer)
- Temporär åtkomst med utgångsdatum
- Audit logs för admin-aktiviteter
- Bulk-import av användare
- E-postnotifieringar

## Felsökning

### "Åtkomst nekad" trots att jag är admin
- Kontrollera att din e-postadress är korrekt stavad i koden
- Se till att du loggat in med rätt Google-konto
- Kontrollera att Firestore-reglerna är deployade

### Användare kan inte komma åt äggtrackern
- Kontrollera att användaren finns i allowedUsers-kollektionen
- Se till att e-postadressen är korrekt (case-sensitive)
- Kontrollera Firestore-reglerna

### Admin Panel öppnas inte
- Kontrollera konsolen för JavaScript-fel
- Se till att Firebase-konfigurationen är korrekt
- Kontrollera nätverksanslutningen till Firebase
