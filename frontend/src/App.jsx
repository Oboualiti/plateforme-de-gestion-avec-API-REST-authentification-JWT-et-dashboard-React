import { BrowserRouter } from 'react-router-dom'
import { useEffect } from 'react'

import './App.css'
import { AuthProvider } from './context/AuthContext'
import AppRoutes from './routes/AppRoutes'

import { Toaster } from './components/ui/toaster-ui'

function App() {
  useEffect(() => {
    const stored = window.localStorage.getItem('theme')
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored ? stored === 'dark' : prefersDark
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
