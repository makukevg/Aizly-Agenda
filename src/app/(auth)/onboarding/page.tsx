'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const [clinicName, setClinicName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      supabase.from('profiles').select('id').eq('id', user.id).single().then(({ data }) => {
        if (data) router.push('/agenda')
        setLoading(false)
      })
    })
  }, [])

  const handleSubmit = async () => {
    if (!clinicName.trim()) { setError('Ingresá el nombre de la clínica'); return }
    setError('')
    setSaving(true)

    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .insert({ name: clinicName.trim() })
      .select()
      .single()

    if (clinicError || !clinic) { setError('Error al crear la clínica'); setSaving(false); return }

    const fullName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Admin'

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: user!.id, clinic_id: clinic.id, full_name: fullName, role: 'admin' })

    if (profileError) {
      await supabase.from('clinics').delete().eq('id', clinic.id)
      setError('Error al crear el perfil'); setSaving(false); return
    }

    router.push('/agenda')
    router.refresh()
  }

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500 mb-4">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">Bienvenido a Aizly</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Empezá configurando tu clínica</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 ml-1">Nombre de la clínica</label>
            <input
              type="text"
              placeholder="Ej: Clínica Dental San Martín"
              value={clinicName}
              onChange={e => setClinicName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={handleSubmit} disabled={saving} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors mt-2">
            {saving ? 'Creando...' : 'Comenzar'}
          </button>
        </div>
      </div>
    </div>
  )
}
