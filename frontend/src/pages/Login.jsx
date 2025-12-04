import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Eye, EyeOff } from 'lucide-react'
import useAuthStore from '../hooks/useAuthStore'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email || !password) {
      toast.error('אנא מלא את כל השדות')
      return
    }

    const result = await login(email, password)
    
    if (result.success) {
      toast.success('התחברת בהצלחה!')
      navigate('/')
    } else {
      toast.error(result.error || 'שגיאה בהתחברות')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-whatsapp-teal to-whatsapp-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-20 w-20 bg-white rounded-full shadow-lg mb-4">
            <MessageCircle className="h-10 w-10 text-whatsapp-light" />
          </div>
          <h1 className="text-3xl font-bold text-white">מערכת משלוחים</h1>
          <p className="text-white/80 mt-2">ניהול משלוחים עם WhatsApp Bot</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">התחברות</h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="admin@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">סיסמה</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-3 text-lg">
              {isLoading ? 'מתחבר...' : 'התחבר'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/60 text-sm mt-6">© 2024 מערכת ניהול משלוחים</p>
      </div>
    </div>
  )
}
