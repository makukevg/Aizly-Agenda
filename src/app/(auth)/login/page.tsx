'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const [email, setEmail] = useState('demo@aizly.com')
    const [password, setPassword] = useState('demo123')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const router = useRouter()
    const supabase = createClient()

    const handleLogin = async () => {
        setError('')
        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { setError(error.message); setLoading(false); return }
        router.push('/agenda')
        router.refresh()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
            <div className="w-full max-w-sm px-6">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500 mb-4">
                        <span className="text-white font-bold text-lg">A</span>
                    </div>
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">Ingresá a tu agenda</h1>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Aizly Agenda</p>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 ml-1">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 ml-1">Contraseña</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <button onClick={handleLogin} disabled={loading} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors mt-2">
                        {loading ? 'Ingresando...' : 'Iniciar sesión'}
                    </button>
                </div>
                <p className="text-center text-xs text-gray-400 dark:text-zinc-500 mt-6">
                    ¿No tenés cuenta? <a href="#" className="text-blue-500 hover:underline">Solicitar acceso</a>
                </p>
            </div>
        </div>
    )
}