import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
    if (!profile) redirect('/onboarding')
    const { data: clinic, error: clinicError } = await supabase.from('clinics').select('name').eq('id', profile.clinic_id).single()
    if (clinicError || !clinic) redirect('/onboarding')
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar clinicName={clinic.name} />
            <div className="flex-1 flex flex-col min-w-0">{children}</div>
        </div>
    )
}