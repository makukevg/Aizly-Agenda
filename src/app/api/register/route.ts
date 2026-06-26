import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, password, full_name } = await request.json()

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 })
    }

    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .insert({ name: `Clínica de ${full_name}` })
      .select()
      .single()

    if (clinicError || !clinic) {
      return NextResponse.json({ error: 'Error al crear la clínica' }, { status: 500 })
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: authData.user.id, clinic_id: clinic.id, full_name, role: 'admin' })

    if (profileError) {
      await supabase.from('clinics').delete().eq('id', clinic.id)
      return NextResponse.json({ error: 'Error al crear el perfil' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
