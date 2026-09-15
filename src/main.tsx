import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import { ErrorBoundary } from '@/components/error-boundary'
import { SessionProvider } from '@/lib/session'
import './index.css'

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
})
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <ErrorBoundary>
          <SessionProvider>
            <App />
            <Toaster position="bottom-right" richColors closeButton />
          </SessionProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
