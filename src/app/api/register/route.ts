import { createServerClient } from '@supabase/ssr'
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

    let supabaseResponse = NextResponse.next({ request: {} as any })
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return [] },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            )
          },
        },
      },
    )

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
      return NextResponse.json({ error: 'Error al crear la clínica: ' + (clinicError?.message || '') }, { status: 500 })
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: authData.user.id, clinic_id: clinic.id, full_name, role: 'admin' })

    if (profileError) {
      await supabase.from('clinics').delete().eq('id', clinic.id)
      return NextResponse.json({ error: 'Error al crear el perfil: ' + profileError.message }, { status: 500 })
    }

    const jsonResponse = NextResponse.json({ success: true })
    supabaseResponse.cookies.getAll().forEach(c => {
      jsonResponse.cookies.set(c.name, c.value, c)
    })

    return jsonResponse
  } catch (e) {
    return NextResponse.json({ error: 'Error interno: ' + (e instanceof Error ? e.message : 'desconocido') }, { status: 500 })
  }
}
