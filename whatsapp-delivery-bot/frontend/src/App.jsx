import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import useAuthStore from './hooks/useAuthStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Deliveries from './pages/Deliveries'
import DeliveryForm from './pages/DeliveryForm'
import Couriers from './pages/Couriers'
import CourierDetail from './pages/CourierDetail'
import Payments from './pages/Payments'
import Settings from './pages/Settings'

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="deliveries/new" element={<DeliveryForm />} />
        <Route path="deliveries/:id" element={<DeliveryForm />} />
        <Route path="couriers" element={<Couriers />} />
        <Route path="couriers/:id" element={<CourierDetail />} />
        <Route path="payments" element={<Payments />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
