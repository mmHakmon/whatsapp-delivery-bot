import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Save, Send } from 'lucide-react'
import api from '../utils/api'
import toast from 'react-hot-toast'

export default function DeliveryForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      priority: 'normal',
      package_size: 'medium',
      is_fragile: false,
      requires_signature: false,
      cash_on_delivery: 0,
    }
  })

  const { data: delivery, isLoading } = useQuery({
    queryKey: ['delivery', id],
    queryFn: () => api.get(`/deliveries/${id}`).then(res => res.data.delivery),
    enabled: isEdit,
  })

  useEffect(() => {
    if (delivery) {
      reset(delivery)
    }
  }, [delivery, reset])

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/deliveries', data),
    onSuccess: (res) => {
      toast.success('משלוח נוצר בהצלחה')
      queryClient.invalidateQueries(['deliveries'])
      navigate('/deliveries')
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || 'שגיאה ביצירת משלוח'),
  })

  const updateMutation = useMutation({
    mutationFn: (data) => api.put(`/deliveries/${id}`, data),
    onSuccess: () => {
      toast.success('משלוח עודכן')
      queryClient.invalidateQueries(['deliveries'])
      navigate('/deliveries')
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || 'שגיאה בעדכון'),
  })

  const onSubmit = (data) => {
    // Calculate totals
    const basePrice = parseFloat(data.base_price) || 0
    const expressFee = parseFloat(data.express_fee) || 0
    const distanceFee = parseFloat(data.distance_fee) || 0
    data.total_price = basePrice + expressFee + distanceFee
    data.courier_payment = parseFloat(data.courier_payment) || data.total_price * 0.7

    if (isEdit) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-whatsapp-light border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/deliveries')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowRight className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">{isEdit ? 'עריכת משלוח' : 'משלוח חדש'}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Pickup Details */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-whatsapp-dark">פרטי איסוף</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם *</label>
              <input {...register('pickup_name', { required: true })} className="input" placeholder="שם איש קשר" />
              {errors.pickup_name && <span className="text-red-500 text-sm">שדה חובה</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">טלפון *</label>
              <input {...register('pickup_phone', { required: true })} className="input" placeholder="050-0000000" dir="ltr" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">כתובת *</label>
              <input {...register('pickup_address', { required: true })} className="input" placeholder="רחוב ומספר" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">עיר *</label>
              <input {...register('pickup_city', { required: true })} className="input" placeholder="עיר" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
              <input {...register('pickup_notes')} className="input" placeholder="קומה, דירה, קוד כניסה..." />
            </div>
          </div>
        </div>

        {/* Dropoff Details */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-whatsapp-dark">פרטי מסירה</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם *</label>
              <input {...register('dropoff_name', { required: true })} className="input" placeholder="שם מקבל" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">טלפון *</label>
              <input {...register('dropoff_phone', { required: true })} className="input" placeholder="050-0000000" dir="ltr" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">כתובת *</label>
              <input {...register('dropoff_address', { required: true })} className="input" placeholder="רחוב ומספר" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">עיר *</label>
              <input {...register('dropoff_city', { required: true })} className="input" placeholder="עיר" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
              <input {...register('dropoff_notes')} className="input" placeholder="קומה, דירה, קוד כניסה..." />
            </div>
          </div>
        </div>

        {/* Package Details */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-whatsapp-dark">פרטי חבילה</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
              <input {...register('package_description')} className="input" placeholder="מה נמצא בחבילה?" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">גודל</label>
              <select {...register('package_size')} className="input">
                <option value="small">קטן</option>
                <option value="medium">בינוני</option>
                <option value="large">גדול</option>
                <option value="xlarge">גדול מאוד</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">עדיפות</label>
              <select {...register('priority')} className="input">
                <option value="low">נמוכה</option>
                <option value="normal">רגילה</option>
                <option value="high">גבוהה</option>
                <option value="urgent">דחוף</option>
              </select>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('is_fragile')} className="h-4 w-4 rounded" />
                <span>שבריר</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('requires_signature')} className="h-4 w-4 rounded" />
                <span>נדרשת חתימה</span>
              </label>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4 text-whatsapp-dark">תמחור</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מחיר בסיס *</label>
              <input type="number" {...register('base_price', { required: true })} className="input" placeholder="0" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תוספת אקספרס</label>
              <input type="number" {...register('express_fee')} className="input" placeholder="0" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תוספת מרחק</label>
              <input type="number" {...register('distance_fee')} className="input" placeholder="0" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">גבייה מהלקוח</label>
              <input type="number" {...register('cash_on_delivery')} className="input" placeholder="0" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תשלום לשליח *</label>
              <input type="number" {...register('courier_payment', { required: true })} className="input" placeholder="0" dir="ltr" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => navigate('/deliveries')} className="btn-secondary">
            ביטול
          </button>
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            <Save className="h-5 w-5" />
            {isEdit ? 'שמור שינויים' : 'צור משלוח'}
          </button>
        </div>
      </form>
    </div>
  )
}
