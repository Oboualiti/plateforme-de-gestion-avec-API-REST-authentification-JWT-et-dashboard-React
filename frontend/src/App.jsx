import { BrowserRouter } from 'react-router-dom'

import './App.css'
import { AuthProvider } from './context/AuthContext'
import AppRoutes from './routes/AppRoutes'

import { Toaster } from './components/ui/toaster-ui'

function App() {
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
