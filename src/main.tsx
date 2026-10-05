import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { initGlobalErrorLogging, warn } from './lib/logger'
import { consumeInvitationParameters } from './lib/invitationContext'
import './index.css'
import './lib/i18n'
import App from './App.tsx'

consumeInvitationParameters()
if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  void import('./lib/sentry').then(({ initSentry }) => initSentry()).catch(() => {
    warn('Optional error reporting could not initialize')
  })
}
initGlobalErrorLogging()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
