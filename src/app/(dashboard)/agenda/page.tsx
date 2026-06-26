import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Agenda } from '@/components/agenda/agenda'
import type { Appointment, Doctor } from '@/types'

export default async function AgendaPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
    if (!profile) redirect('/onboarding')
    const { data: doctors } = await supabase.from('doctors').select('*').eq('clinic_id', profile.clinic_id).eq('active', true).order('name')
    const today = new Date()
    const weekStart = new Date(today)
    const day = weekStart.getDay()
    const diff = day === 0 ? -6 : 1 - day
    weekStart.setDate(weekStart.getDate() + diff)
    weekStart.setHours(0, 0, 0, 0)
    const weekDates = Array.from({ length: 5 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + i)
        return d.toISOString().split('T')[0]
    })
    const { data: appointments } = await supabase.from('appointments').select('*').eq('clinic_id', profile.clinic_id).in('date', weekDates).eq('status', 'scheduled').order('date', { ascending: true }).order('time_start', { ascending: true })
    return <Agenda initialAppointments={(appointments as Appointment[]) || []} doctors={(doctors as Doctor[]) || []} clinicId={profile.clinic_id} />
}