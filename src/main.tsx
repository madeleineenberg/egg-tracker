import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@styles/index.scss'
import App from '@/App.tsx'
// Importera Firebase-konfigurationen
import '@/config/firebase'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
