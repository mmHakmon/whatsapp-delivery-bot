import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, MessageCircle, Clock, DollarSign, MapPin } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

function SettingCard({ title, icon: Icon, children }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-lg bg-whatsapp-light/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-whatsapp-dark" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(res => res.data.settings),
  })

  const [whatsappConfig, setWhatsappConfig] = useState({
    phone_number_id: '',
    business_account_id: '',
    access_token: '',
  })

  const [businessHours, setBusinessHours] = useState({
    start: '08:00',
    end: '22:00',
    days: [0, 1, 2, 3, 4, 5],
  })

  const [courierRates, setCourierRates] = useState({
    base: 15,
    per_km: 2,
    express_bonus: 10,
  })

  const [autoCancelMinutes, setAutoCancelMinutes] = useState(30)

  // Load settings when data is available
  useState(() => {
    if (settings) {
      if (settings.whatsapp_config) setWhatsappConfig(settings.whatsapp_config)
      if (settings.business_hours) setBusinessHours(settings.business_hours)
      if (settings.default_courier_rate) setCourierRates(settings.default_courier_rate)
      if (settings.auto_cancel_minutes) setAutoCancelMinutes(parseInt(settings.auto_cancel_minutes))
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: ({ key, value }) => api.put(`/settings/${key}`, { value }),
    onSuccess: () => {
      toast.success('הגדרות נשמרו')
      queryClient.invalidateQueries(['settings'])
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || 'שגיאה בשמירה'),
  })

  const saveWhatsApp = () => {
    saveMutation.mutate({ key: 'whatsapp_config', value: whatsappConfig })
  }

  const saveBusinessHours = () => {
    saveMutation.mutate({ key: 'business_hours', value: businessHours })
  }

  const saveCourierRates = () => {
    saveMutation.mutate({ key: 'default_courier_rate', value: courierRates })
  }

  const saveAutoCancel = () => {
    saveMutation.mutate({ key: 'auto_cancel_minutes', value: autoCancelMinutes.toString() })
  }

  const dayNames = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-whatsapp-light border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">הגדרות</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WhatsApp Configuration */}
        <SettingCard title="הגדרות WhatsApp" icon={MessageCircle}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number ID</label>
              <input
                className="input"
                value={whatsappConfig.phone_number_id}
                onChange={(e) => setWhatsappConfig(c => ({ ...c, phone_number_id: e.target.value }))}
                placeholder="123456789"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Business Account ID</label>
              <input
                className="input"
                value={whatsappConfig.business_account_id}
                onChange={(e) => setWhatsappConfig(c => ({ ...c, business_account_id: e.target.value }))}
                placeholder="123456789"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Access Token</label>
              <input
                type="password"
                className="input"
                value={whatsappConfig.access_token}
                onChange={(e) => setWhatsappConfig(c => ({ ...c, access_token: e.target.value }))}
                placeholder="••••••••••"
                dir="ltr"
              />
            </div>
            <button onClick={saveWhatsApp} className="btn-primary w-full flex items-center justify-center gap-2">
              <Save className="h-4 w-4" />
              שמור
            </button>
          </div>
        </SettingCard>

        {/* Business Hours */}
        <SettingCard title="שעות פעילות" icon={Clock}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">שעת פתיחה</label>
                <input
                  type="time"
                  className="input"
                  value={businessHours.start}
                  onChange={(e) => setBusinessHours(h => ({ ...h, start: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">שעת סגירה</label>
                <input
                  type="time"
                  className="input"
                  value={businessHours.end}
                  onChange={(e) => setBusinessHours(h => ({ ...h, end: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">ימי פעילות</label>
              <div className="flex gap-2">
                {dayNames.map((name, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setBusinessHours(h => ({
                        ...h,
                        days: h.days.includes(index)
                          ? h.days.filter(d => d !== index)
                          : [...h.days, index].sort()
                      }))
                    }}
                    className={`h-10 w-10 rounded-full font-medium transition-colors ${
                      businessHours.days.includes(index)
                        ? 'bg-whatsapp-light text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={saveBusinessHours} className="btn-primary w-full flex items-center justify-center gap-2">
              <Save className="h-4 w-4" />
              שמור
            </button>
          </div>
        </SettingCard>

        {/* Default Courier Rates */}
        <SettingCard title="תעריפי שליחים" icon={DollarSign}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">תעריף בסיס (₪)</label>
              <input
                type="number"
                className="input"
                value={courierRates.base}
                onChange={(e) => setCourierRates(r => ({ ...r, base: parseFloat(e.target.value) }))}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">לק"מ (₪)</label>
              <input
                type="number"
                className="input"
                value={courierRates.per_km}
                onChange={(e) => setCourierRates(r => ({ ...r, per_km: parseFloat(e.target.value) }))}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">בונוס אקספרס (₪)</label>
              <input
                type="number"
                className="input"
                value={courierRates.express_bonus}
                onChange={(e) => setCourierRates(r => ({ ...r, express_bonus: parseFloat(e.target.value) }))}
                dir="ltr"
              />
            </div>
            <button onClick={saveCourierRates} className="btn-primary w-full flex items-center justify-center gap-2">
              <Save className="h-4 w-4" />
              שמור
            </button>
          </div>
        </SettingCard>

        {/* Auto Cancel Settings */}
        <SettingCard title="הגדרות ביטול אוטומטי" icon={Clock}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">דקות עד ביטול אוטומטי</label>
              <input
                type="number"
                className="input"
                value={autoCancelMinutes}
                onChange={(e) => setAutoCancelMinutes(parseInt(e.target.value))}
                min="5"
                max="120"
                dir="ltr"
              />
              <p className="text-sm text-gray-500 mt-1">
                משלוחים שלא נלקחו תוך {autoCancelMinutes} דקות יבוטלו אוטומטית
              </p>
            </div>
            <button onClick={saveAutoCancel} className="btn-primary w-full flex items-center justify-center gap-2">
              <Save className="h-4 w-4" />
              שמור
            </button>
          </div>
        </SettingCard>
      </div>

      {/* Test WhatsApp Connection */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">בדיקת חיבור WhatsApp</h2>
        <p className="text-gray-500 mb-4">שלח הודעת בדיקה כדי לוודא שהבוט מחובר כראוי</p>
        <div className="flex gap-4">
          <input
            type="text"
            className="input flex-1"
            placeholder="מספר טלפון (עם קידומת מדינה)"
            id="test-phone"
            dir="ltr"
          />
          <button
            className="btn-primary"
            onClick={async () => {
              const phone = document.getElementById('test-phone').value
              if (!phone) return toast.error('הזן מספר טלפון')
              try {
                await api.post('/whatsapp/test-message', {
                  phone,
                  message: '🤖 הודעת בדיקה ממערכת ניהול המשלוחים!'
                })
                toast.success('הודעה נשלחה!')
              } catch (err) {
                toast.error('שגיאה בשליחה')
              }
            }}
          >
            שלח הודעת בדיקה
          </button>
        </div>
      </div>
    </div>
  )
}
