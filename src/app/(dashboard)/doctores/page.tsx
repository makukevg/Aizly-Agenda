'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/toast'
import type { Doctor } from '@/types'

export default function DoctoresPage() {
    const supabase = createClient()
    const toast = useToast()
    const [doctores, setDoctores] = useState<Doctor[]>([])
    const [loading, setLoading] = useState(true)
    const [panelOpen, setPanelOpen] = useState(false)
    const [editing, setEditing] = useState<Doctor | null>(null)
    const [form, setForm] = useState({ name: '', specialty: '' })
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

    const fetchDoctores = useCallback(async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data: clinicData } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
        if (!clinicData) { setLoading(false); return }
        const { data, error } = await supabase.from('doctors').select('*').eq('clinic_id', clinicData.clinic_id).order('name')
        if (!error && data) setDoctores(data as Doctor[])
        setLoading(false)
    }, [supabase])

    useEffect(() => { fetchDoctores() }, [fetchDoctores])

    function openCreate() {
        setForm({ name: '', specialty: '' })
        setEditing(null)
        setPanelOpen(true)
    }

    function openEdit(doc: Doctor) {
        setForm({ name: doc.name, specialty: doc.specialty })
        setEditing(doc)
        setPanelOpen(true)
    }

    function closePanel() { setPanelOpen(false); setEditing(null) }

    async function submitDoctor() {
        if (!form.name.trim()) { toast('Ingresá el nombre'); return }
        if (!form.specialty.trim()) { toast('Ingresá la especialidad'); return }
        if (editing) {
            const { error } = await supabase.from('doctors').update({ name: form.name.trim(), specialty: form.specialty.trim() }).eq('id', editing.id)
            if (error) { toast('Error al actualizar'); return }
            toast('Doctor actualizado ✓')
        } else {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { toast('Error de sesión'); return }
            const { data: clinicData } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
            if (!clinicData) { toast('Error'); return }
            const { error } = await supabase.from('doctors').insert({ clinic_id: clinicData.clinic_id, name: form.name.trim(), specialty: form.specialty.trim() })
            if (error) { toast('Error al crear'); return }
            toast('Doctor creado ✓')
        }
        closePanel()
        fetchDoctores()
    }

    async function toggleActive(doc: Doctor) {
        const { error } = await supabase.from('doctors').update({ active: !doc.active }).eq('id', doc.id)
        if (error) { toast('Error'); return }
        fetchDoctores()
        toast(doc.active ? 'Doctor desactivado' : 'Doctor activado ✓')
    }

    async function deleteDoctor(id: string) {
        const { error } = await supabase.from('doctors').delete().eq('id', id)
        if (error) { toast('No se puede borrar: tiene turnos asociados'); return }
        setDeleteConfirm(null)
        fetchDoctores()
        toast('Doctor eliminado')
    }

    return (
        <div className="flex h-full">
            <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-semibold">Doctores</h1>
                            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">{doctores.length} doctor{doctores.length !== 1 ? 'es' : ''} registrado{doctores.length !== 1 ? 's' : ''}</p>
                        </div>
                        <button onClick={openCreate} className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                            Nuevo doctor
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : doctores.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-zinc-500">
                        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        <p className="text-sm">No hay doctores cargados</p>
                    </div>
                ) : (
                    <div className="px-6 py-4 space-y-2">
                        {doctores.map(doc => (
                            <div key={doc.id} className={`flex items-center justify-between p-4 rounded-xl border ${doc.active ? 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900' : 'border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 opacity-60'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${doc.active ? 'bg-blue-500' : 'bg-gray-400'}`}>
                                        {doc.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{doc.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-zinc-400">{doc.specialty}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => toggleActive(doc)} className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${doc.active ? 'border-red-200 dark:border-red-400/10 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-400/5' : 'border-green-200 dark:border-green-400/10 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-400/5'}`}>
                                        {doc.active ? 'Desactivar' : 'Activar'}
                                    </button>
                                    <button onClick={() => openEdit(doc)} className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                                        Editar
                                    </button>
                                    {deleteConfirm === doc.id ? (
                                        <div className="flex items-center gap-1">
                                            <span className="text-[10px] text-red-500">¿Borrar?</span>
                                            <button onClick={() => deleteDoctor(doc.id)} className="px-2 py-1 text-[10px] font-medium bg-red-500 text-white rounded-md hover:bg-red-600">Sí</button>
                                            <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-[10px] font-medium bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 rounded-md hover:bg-gray-300 dark:hover:bg-zinc-600">No</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setDeleteConfirm(doc.id)} className="px-2.5 py-1 text-xs font-medium rounded-lg border border-red-200 dark:border-red-400/10 text-red-500 hover:bg-red-50 dark:hover:bg-red-400/5 transition-colors">
                                            Borrar
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {panelOpen && (
                <aside className="fixed right-0 top-0 bottom-0 w-[400px] bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 z-30 flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.06)] dark:shadow-[-4px_0_24px_rgba(0,0,0,0.3)]" style={{ animation: 'slideIn 0.25s ease' }}>
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
                        <h2 className="text-sm font-semibold">{editing ? 'Editar doctor' : 'Nuevo doctor'}</h2>
                        <button onClick={closePanel} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Nombre completo <span className="text-red-400">*</span></label>
                            <input type="text" placeholder="Ej: Dra. Martínez" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-zinc-100" onKeyDown={e => e.key === 'Enter' && submitDoctor()} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Especialidad <span className="text-red-400">*</span></label>
                            <input type="text" placeholder="Ej: Odontología" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-zinc-100" onKeyDown={e => e.key === 'Enter' && submitDoctor()} />
                        </div>
                    </div>
                    <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800">
                        <button onClick={submitDoctor} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
                            {editing ? 'Guardar cambios' : 'Crear doctor'}
                        </button>
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500 text-center mt-2">Enter ↵ para guardar · Esc para cerrar</p>
                    </div>
                </aside>
            )}
        </div>
    )
}