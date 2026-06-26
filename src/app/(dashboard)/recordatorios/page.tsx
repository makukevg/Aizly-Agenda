'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Appointment, Doctor } from '@/types'

function getTomorrow(): string {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
}

function getToday(): string {
    return new Date().toISOString().split('T')[0]
}

function formatDateLong(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00')
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`
}

function formatTime(time: string): string {
    return time?.slice(0, 5) || ''
}

function normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    if (digits.startsWith('549')) return digits
    if (digits.startsWith('54')) return '549' + digits.slice(2)
    return '549' + digits
}

function buildWhatsAppLink(phone: string, message: string): string {
    return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`
}

function buildMessage(appointment: Appointment, doctorName: string, clinicName: string, targetDate: string): string {
    return `Hola ${appointment.patient_name.split(',')[0].trim()} 👋

Le recordamos que tiene un turno programado para *${formatDateLong(targetDate)}* a las *${formatTime(appointment.time_start)} hs* con ${doctorName}.

📍 *${clinicName}*
${appointment.reason ? `📋 Motivo: ${appointment.reason}` : ''}

Por favor confirmanos su asistencia respondiendo este mensaje. Si necesita cancelar o reprogramar, avisenos con anticipación.

¡Hasta mañana! 🙏`.trim()
}

type ViewDate = 'tomorrow' | 'today'

export default function RecordatoriosPage() {
    const supabase = createClient()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [doctors, setDoctors] = useState<Doctor[]>([])
    const [clinicName, setClinicName] = useState('la clínica')
    const [clinicId, setClinicId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [viewDate, setViewDate] = useState<ViewDate>('tomorrow')
    const [sending, setSending] = useState<Set<string>>(new Set())
    const [sent, setSent] = useState<Set<string>>(new Set())

    const targetDate = viewDate === 'tomorrow' ? getTomorrow() : getToday()

    const fetchData = useCallback(async () => {
        setLoading(true)

        const { data: profile } = await supabase
            .from('profiles')
            .select('clinic_id')
            .single()

        if (!profile?.clinic_id) { setLoading(false); return }
        setClinicId(profile.clinic_id)

        const { data: clinic } = await supabase
            .from('clinics')
            .select('name')
            .eq('id', profile.clinic_id)
            .single()

        if (clinic?.name) setClinicName(clinic.name)

        const { data: docs } = await supabase
            .from('doctors')
            .select('*')
            .eq('clinic_id', profile.clinic_id)
            .eq('active', true)

        if (docs) setDoctors(docs as Doctor[])

        // Traer turnos de hoy y mañana
        const { data: apps } = await supabase
            .from('appointments')
            .select('*')
            .eq('clinic_id', profile.clinic_id)
            .in('date', [getToday(), getTomorrow()])
            .neq('status', 'cancelado')
            .neq('status', 'cancelled')
            .order('time_start', { ascending: true })

        if (apps) {
            setAppointments(apps as Appointment[])
            // Marcar los que ya tienen reminder_sent = true
            const alreadySent = new Set(
                apps.filter((a: Appointment & { reminder_sent?: boolean }) => a.reminder_sent).map((a: Appointment) => a.id)
            )
            setSent(alreadySent)
        }

        setLoading(false)
    }, [supabase])

    useEffect(() => { fetchData() }, [fetchData])

    const filtered = useMemo(() => {
        return appointments.filter(a => a.date === targetDate)
    }, [appointments, targetDate])

    const stats = useMemo(() => {
        const total = filtered.length
        const enviados = filtered.filter(a => sent.has(a.id)).length
        const pendientes = total - enviados
        return { total, enviados, pendientes }
    }, [filtered, sent])

    function getDoctorName(doctorId: string): string {
        return doctors.find(d => d.id === doctorId)?.name || 'el profesional'
    }

    async function markAsSent(appointmentId: string) {
        setSending(prev => new Set(prev).add(appointmentId))
        await supabase
            .from('appointments')
            .update({ reminder_sent: true })
            .eq('id', appointmentId)
        setSent(prev => new Set(prev).add(appointmentId))
        setSending(prev => { const s = new Set(prev); s.delete(appointmentId); return s })
    }

    async function markAllSent() {
        const pending = filtered.filter(a => !sent.has(a.id))
        const ids = pending.map(a => a.id)
        await supabase
            .from('appointments')
            .update({ reminder_sent: true })
            .in('id', ids)
        setSent(prev => new Set([...prev, ...ids]))
    }

    function handleSend(appointment: Appointment) {
        const doctorName = getDoctorName(appointment.doctor_id)
        const message = buildMessage(appointment, doctorName, clinicName, targetDate)
        const link = buildWhatsAppLink(appointment.patient_phone, message)
        window.open(link, '_blank')
        markAsSent(appointment.id)
    }

    function previewMessage(appointment: Appointment): string {
        return buildMessage(appointment, getDoctorName(appointment.doctor_id), clinicName, targetDate)
    }

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-zinc-950">

            {/* Header */}
            <div className="px-6 py-4 bg-white dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Recordatorios</h1>
                        <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">
                            Enviá recordatorios por WhatsApp a los pacientes
                        </p>
                    </div>

                    {/* Toggle hoy / mañana */}
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700 text-xs">
                        <button
                            onClick={() => setViewDate('today')}
                            className={`px-4 py-2 transition-colors ${viewDate === 'today' ? 'bg-green-600 text-white font-medium' : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-700'}`}
                        >
                            Hoy
                        </button>
                        <button
                            onClick={() => setViewDate('tomorrow')}
                            className={`px-4 py-2 transition-colors ${viewDate === 'tomorrow' ? 'bg-green-600 text-white font-medium' : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-700'}`}
                        >
                            Mañana
                        </button>
                    </div>
                </div>

                {/* Stats */}
                {!loading && filtered.length > 0 && (
                    <div className="flex items-center gap-4 mt-4">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-zinc-600" />
                            <span className="text-xs text-gray-500 dark:text-zinc-400">{stats.total} turnos</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-xs text-gray-500 dark:text-zinc-400">{stats.enviados} enviados</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span className="text-xs text-gray-500 dark:text-zinc-400">{stats.pendientes} pendientes</span>
                        </div>

                        {stats.pendientes > 0 && (
                            <button
                                onClick={markAllSent}
                                className="ml-auto text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 underline transition-colors"
                            >
                                Marcar todos como enviados
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {loading ? (
                    <div className="flex items-center justify-center h-40 gap-2 text-gray-400 text-sm">
                        <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        Cargando turnos...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-60 text-center">
                        <span className="text-4xl mb-3">📭</span>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            No hay turnos para {viewDate === 'tomorrow' ? 'mañana' : 'hoy'}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                            {viewDate === 'tomorrow' ? 'Probá ver los turnos de hoy' : 'No hay turnos programados para hoy'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 max-w-2xl">

                        {/* Fecha */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                            <span className="text-xs font-medium text-gray-500 dark:text-zinc-400 capitalize">
                                {formatDateLong(targetDate)}
                            </span>
                            <div className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
                        </div>

                        {filtered.map(a => {
                            const isSent = sent.has(a.id)
                            const isSending = sending.has(a.id)
                            const doctorName = getDoctorName(a.doctor_id)

                            return (
                                <div
                                    key={a.id}
                                    className={`bg-white dark:bg-zinc-900 rounded-2xl border transition-all ${isSent ? 'border-green-200 dark:border-green-500/20' : 'border-gray-100 dark:border-zinc-800'}`}
                                >
                                    <div className="p-4 flex items-start gap-4">

                                        {/* Hora */}
                                        <div className="flex-shrink-0 text-center w-12">
                                            <p className="text-base font-bold text-gray-900 dark:text-white tabular-nums">{formatTime(a.time_start)}</p>
                                            <p className="text-[10px] text-gray-400 dark:text-zinc-500">hs</p>
                                        </div>

                                        <div className="w-px h-10 bg-gray-100 dark:bg-zinc-800 flex-shrink-0 mt-1" />

                                        {/* Info paciente */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${isSent ? 'bg-green-100 dark:bg-green-400/10 text-green-600 dark:text-green-400' : 'bg-blue-100 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400'}`}>
                                                    {a.patient_name.split(',')[0].trim()[0]}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.patient_name}</p>
                                                    <p className="text-xs text-gray-400 dark:text-zinc-500">{doctorName} · {a.reason || 'Sin motivo'}</p>
                                                </div>
                                            </div>

                                            {/* Preview del mensaje */}
                                            <details className="mt-2 group">
                                                <summary className="text-[10px] text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 cursor-pointer select-none transition-colors list-none flex items-center gap-1">
                                                    <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
                                                    Ver mensaje
                                                </summary>
                                                <pre className="mt-2 p-2.5 bg-gray-50 dark:bg-zinc-800 rounded-lg text-[11px] text-gray-600 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed border border-gray-100 dark:border-zinc-700">
                                                    {previewMessage(a)}
                                                </pre>
                                            </details>
                                        </div>

                                        {/* Botón */}
                                        <div className="flex-shrink-0">
                                            {isSent ? (
                                                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-500/10">
                                                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                                                    <span className="text-xs font-medium text-green-600 dark:text-green-400">Enviado</span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleSend(a)}
                                                    disabled={isSending || !a.patient_phone}
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                                                        <path d="M11.5 0C5.149 0 0 5.149 0 11.5c0 2.033.535 3.94 1.47 5.59L0 23l6.09-1.596A11.452 11.452 0 0011.5 23C17.851 23 23 17.851 23 11.5S17.851 0 11.5 0zm0 21.059a9.561 9.561 0 01-4.88-1.335l-.35-.208-3.617.948.965-3.525-.228-.362A9.542 9.542 0 011.94 11.5C1.94 6.218 6.218 1.94 11.5 1.94c5.282 0 9.56 4.278 9.56 9.56 0 5.283-4.278 9.559-9.56 9.559z" />
                                                    </svg>
                                                    {isSending ? 'Abriendo...' : 'Enviar'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
