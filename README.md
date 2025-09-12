# Nyponbacken Egg Tracker

A React application with Firebase integration for tracking egg collection from your farm's chickens. This app allows users to:

- Sign in with Google authentication
- Record daily egg collections
- View personal egg collection history
- Edit or delete their own records
- See statistics about their egg collection
- View a leaderboard of all users' total egg counts
- Admin features for user management and data export

## Setup Instructions

### 1. Environment Configuration

Before running the application, you need to set up your Firebase configuration:

1. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your Firebase configuration values in `.env.local`:
   - Get these values from your Firebase project console
   - Replace each placeholder with your actual Firebase config values

3. **IMPORTANT**: Never commit `.env.local` to version control - it contains sensitive information

### 2. Install Dependencies

```bash
npm install
# or
bun install
```

### 3. Run Development Server

```bash
npm run dev
# or
bun run dev
```

### 4. Build for Production

```bash
npm run build
# or
bun run build
```

## Deployment

The app is configured for Firebase Hosting. To deploy:

```bash
firebase deploy
```

## Environment Variables

The following environment variables are required:

- `VITE_FIREBASE_API_KEY`: Your Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN`: Your Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID`: Your Firebase project ID
- `VITE_FIREBASE_STORAGE_BUCKET`: Your Firebase storage bucket
- `VITE_FIREBASE_MESSAGING_SENDER_ID`: Your Firebase messaging sender ID
- `VITE_FIREBASE_APP_ID`: Your Firebase app ID
- `VITE_FIREBASE_MEASUREMENT_ID`: Your Firebase measurement ID
- `VITE_ADMIN_EMAILS`: Comma-separated list of admin email addresses (e.g., "admin1@example.com,admin2@example.com")

**Important**: You also need to manually update the admin email(s) in `firestore.rules` file to match your admin email(s), as Firestore Security Rules cannot read environment variables.

## Recent Updates

- **Excel Export**: Added ability to export egg statistics to Excel files with date filtering
- **Public Statistics**: Farm statistics are now visible to all users without requiring login
- **Improved Error Handling**: Added robust error handling for Firestore operations
- **Performance Optimization**: Enhanced Firestore data fetching and offline persistence
- **Bug Fixes**: Fixed issue where statistics wouldn't display properly at initial load

## Features

- **Google Authentication**: Secure user login with Google
- **Daily Egg Tracking**: Record the number of eggs collected per day
- **Data Visualization**: View statistics of total eggs, collection days, and average eggs per day
- **Data Export**: Export egg collection data to Excel files with date range filtering
- **Leaderboard**: See who has collected the most eggs among all users
- **Record Management**: Edit or delete your own egg collection records
- **Validation**: Prevents invalid data entry (future dates, unreasonable counts)
- **Real-time Updates**: Data changes are reflected instantly across all devices

## Usage Guide

### Excel Export Functionality

To export your egg collection data to Excel:

1. **Log in** to your account using the Google authentication
2. Navigate to your egg collection history section
3. Use the date filters to select a specific date range (optional):
   - Enter a "From" date to set the start of the period
   - Enter a "To" date to set the end of the period
4. Click the "Exportera till Excel" button
5. The Excel file will be automatically downloaded to your device
6. The filename will reflect your selected date range:
   - `aggdata_YYYY-MM-DD.xlsx` (for all data, using today's date)
   - `aggdata_YYYY-MM-DD_till_YYYY-MM-DD.xlsx` (for a specific date range)
   - `aggdata_fran_YYYY-MM-DD.xlsx` (from a specific date onwards)
   - `aggdata_till_YYYY-MM-DD.xlsx` (up to a specific date)

The Excel file contains the following columns:
- Datum (Date)
- Antal ägg (Number of eggs)
- Registrerad av (Registered by)

## Deployment

### Updating Firestore Rules

To update the Firestore security rules, run:

```bash
firebase deploy --only firestore:rules
```

### Full Deployment

To build and deploy the entire application, run:

```bash
./deploy.sh
```

This script will:
1. Build the React application
2. Deploy Firestore rules first
3. Deploy the rest of the application

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
