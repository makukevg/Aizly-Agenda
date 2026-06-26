import { createClient } from '@/lib/supabase/server'
import { MetricsDashboard } from '@/components/MetricsDashboard'

export default async function MetricasPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    const { data: profile } = await supabase
        .from('profiles')
        .select('clinic_id')
        .eq('id', user?.id)
        .single()

    const { data: doctors } = await supabase
        .from('doctors')
        .select('*')
        .eq('clinic_id', profile?.clinic_id)

    return (
        <MetricsDashboard
            clinicId={profile?.clinic_id || ''}
            doctors={doctors || []}
        />
    )
}