import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import {
  LayoutDashboard,
  Package,
  Users,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  MessageCircle,
} from 'lucide-react'
import useAuthStore from '../hooks/useAuthStore'
import { cn } from '../utils/helpers'
import toast from 'react-hot-toast'

const navigation = [
  { name: 'דשבורד', href: '/', icon: LayoutDashboard },
  { name: 'משלוחים', href: '/deliveries', icon: Package },
  { name: 'שליחים', href: '/couriers', icon: Users },
  { name: 'תשלומים', href: '/payments', icon: CreditCard },
  { name: 'הגדרות', href: '/settings', icon: Settings },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const { admin, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    // Connect to Socket.IO for real-time updates
    const socket = io('/', {
      path: '/socket.io',
    })

    socket.on('connect', () => {
      console.log('Connected to server')
      socket.emit('join-admin')
    })

    socket.on('delivery:created', (delivery) => {
      toast.success(`משלוח חדש נוצר: #${delivery.delivery_number}`)
    })

    socket.on('delivery:published', ({ id }) => {
      toast.success('משלוח פורסם בקבוצה')
    })

    socket.on('delivery:assigned', ({ deliveryNumber, courierName }) => {
      toast.success(`משלוח #${deliveryNumber} נלקח על ידי ${courierName}`)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-64 bg-white shadow-lg transform transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-6 border-b">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-8 w-8 text-whatsapp-light" />
              <span className="text-lg font-bold">מערכת משלוחים</span>
            </div>
            <button
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                    isActive
                      ? 'bg-whatsapp-light/10 text-whatsapp-dark font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  )
                }
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-whatsapp-light/20 flex items-center justify-center">
                <span className="text-whatsapp-dark font-medium">
                  {admin?.name?.charAt(0)}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{admin?.name}</p>
                <p className="text-xs text-gray-500">{admin?.role === 'super_admin' ? 'מנהל על' : 'מנהל'}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="h-5 w-5" />
              התנתק
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:mr-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b flex items-center justify-between px-4 lg:px-8">
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-4">
            <button className="relative p-2 hover:bg-gray-100 rounded-full">
              <Bell className="h-5 w-5 text-gray-600" />
              {notifications.length > 0 && (
                <span className="absolute top-1 left-1 h-2 w-2 bg-red-500 rounded-full" />
              )}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
