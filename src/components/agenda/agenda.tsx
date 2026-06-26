'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/toast'
import type { Appointment, Doctor } from '@/types'

// ─── Constantes ────────────────────────────────────────────────────────────────
const SLOT_H = 60
const START_H = 7
const END_H = 21
const TOTAL_SLOTS = (END_H - START_H) * 2
const DIAS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// ─── Utilidades ────────────────────────────────────────────────────────────────
function fmtDate(d: Date) {
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]
}
function fmtDateShort(d: Date) {
    return DIAS[d.getDay()] + ' ' + d.getDate()
}
function formatDateISO(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}
function slotTop(hora: string) {
    const [h, m] = hora.split(':').map(Number)
    return (h - START_H) * 2 * SLOT_H + (m / 30) * SLOT_H
}
function turnoH(dur: number) {
    return (dur / 30) * SLOT_H - 4
}
function isToday(d: Date) {
    const t = new Date()
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
}
function getWeekDates(baseDate: Date): Date[] {
    const d = new Date(baseDate)  // ← usa la fecha recibida
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const mon = new Date(d)
    mon.setDate(d.getDate() + diff)
    mon.setHours(0, 0, 0, 0)
    return Array.from({ length: 5 }, (_, i) => {
        const x = new Date(mon)
        x.setDate(mon.getDate() + i)
        return x
    })
}
function endTime(hora: string, dur: number) {
    const [h, m] = hora.split(':').map(Number)
    const total = h * 60 + m + dur
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0')
}
function timeToMin(hora: string) {
    const [h, m] = hora.split(':').map(Number)
    return h * 60 + m
}
function hasOverlap(t1: Appointment, t2: Appointment) {
    const s1 = timeToMin(t1.time_start), e1 = s1 + t1.duration_min
    const s2 = timeToMin(t2.time_start), e2 = s2 + t2.duration_min
    return s1 < e2 && s2 < e1
}
function checkOverlap(time: string, dur: number, dayApps: Appointment[], excludeId: string | null) {
    const s = timeToMin(time), e = s + dur
    for (const a of dayApps) {
        if (a.id === excludeId) continue
        const as2 = timeToMin(a.time_start), ae = as2 + a.duration_min
        if (s < ae && as2 < e) {
            return `Se superpone con ${a.patient_name} (${a.time_start} - ${endTime(a.time_start, a.duration_min)})`
        }
    }
    return null
}
function buildTimeSlots(): string[] {
    const slots: string[] = []
    for (let h = START_H; h < END_H; h++) {
        slots.push(String(h).padStart(2, '0') + ':00')
        slots.push(String(h).padStart(2, '0') + ':30')
    }
    return slots
}

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface FormState {
    patient_name: string
    patient_phone: string
    patient_email: string
    date: string
    time_start: string
    duration_min: number
    reason: string
}
interface AgendaProps {
    initialAppointments: Appointment[]
    doctors: Doctor[]
    clinicId: string
}

// ─── Componente principal ──────────────────────────────────────────────────────
export function Agenda({ initialAppointments, doctors, clinicId }: AgendaProps) {
    const supabase = createClient()
    const toast = useToast()

    const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments || [])
    const [view, setView] = useState<'day' | 'week'>('day')
    const [date, setDate] = useState(new Date())
    const [selectedDoctorId, setSelectedDoctorId] = useState(doctors[0]?.id || '')
    const [panelOpen, setPanelOpen] = useState(false)
    const [panelMode, setPanelMode] = useState<'create' | 'detail' | null>(null)
    const [panelTurnoId, setPanelTurnoId] = useState<string | null>(null)
    const [cmdOpen, setCmdOpen] = useState(false)
    const [cmdQuery, setCmdQuery] = useState('')
    const [cmdIdx, setCmdIdx] = useState(0)
    const [loading, setLoading] = useState(false)
    const [cancelConfirm, setCancelConfirm] = useState(false)
    const [form, setForm] = useState<FormState>({
        patient_name: '', patient_phone: '', patient_email: '',
        date: formatDateISO(new Date()), time_start: '09:00', duration_min: 30, reason: ''
    })
    const [overlapWarning, setOverlapWarning] = useState<string | null>(null)

    const scrollRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>

    // ── Fetch ────────────────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true)
        const res = await supabase
            .from('appointments')
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('doctor_id', selectedDoctorId)
            .in('status', ['scheduled', 'completado', 'ausente', 'cancelado']) // ✅ Valores REALES de tu BD
            .order('date', { ascending: true })
            .order('time_start', { ascending: true })
        if (res.data) setAppointments(res.data)
        setLoading(false)
    }, [selectedDoctorId, clinicId])

    useEffect(() => { fetchData() }, [fetchData, date])  // ← También cuando cambia la fecha

    // ── Datos derivados ──────────────────────────────────────────────────────────
    const dayApps = useMemo(() => {
        const dateStr = formatDateISO(date)
        return appointments.filter(a => a.date === dateStr && a.doctor_id === selectedDoctorId)
    }, [appointments, date, selectedDoctorId])

    const weekApps = useMemo(() => {
        return appointments.filter(a => a.doctor_id === selectedDoctorId)
    }, [appointments, selectedDoctorId])

    const overlaps = useMemo(() => {
        const ids: Record<string, boolean> = {}
        for (let i = 0; i < dayApps.length; i++) {
            for (let j = i + 1; j < dayApps.length; j++) {
                if (hasOverlap(dayApps[i], dayApps[j])) {
                    ids[dayApps[i].id] = true
                    ids[dayApps[j].id] = true
                }
            }
        }
        return ids
    }, [dayApps])

    // ── Handlers ─────────────────────────────────────────────────────────────────
    function openCreate(hora?: string) {
        setForm({
            patient_name: '', patient_phone: '', patient_email: '',
            date: formatDateISO(date), time_start: hora || '09:00', duration_min: 30, reason: ''
        })
        setOverlapWarning(null)
        setCancelConfirm(false)
        setPanelOpen(true)
        setPanelMode('create')
        setPanelTurnoId(null)
    }

    function openDetail(id: string) {
        setCancelConfirm(false)
        setPanelOpen(true)
        setPanelMode('detail')
        setPanelTurnoId(id)
    }

    function closePanel() {
        setPanelOpen(false)
        setPanelMode(null)
        setPanelTurnoId(null)
        setOverlapWarning(null)
    }

    function handleFormChange(field: keyof FormState, value: string | number) {
        const updated = { ...form, [field]: value }
        setForm(updated)
        if (field === 'time_start' || field === 'duration_min' || field === 'date') {
            const sameDay = field === 'date' ? String(value) : form.date
            if (sameDay && formatDateISO(date) === sameDay) {
                const t = field === 'time_start' ? String(value) : updated.time_start
                const d = field === 'duration_min' ? Number(value) : updated.duration_min
                setOverlapWarning(checkOverlap(t, d, dayApps, null))
            } else {
                setOverlapWarning(null)
            }
        }
    }

    async function submitTurno() {
        if (!form.patient_name.trim()) { toast('Ingresá el nombre'); return }
        if (!form.patient_phone.trim()) { toast('Ingresá el teléfono'); return }
        if (overlapWarning) { toast('Resolvé el sobreturno'); return }
        const row = {
            clinic_id: clinicId, doctor_id: selectedDoctorId,
            patient_name: form.patient_name.trim(), patient_phone: form.patient_phone.trim(),
            patient_email: form.patient_email.trim() || null, date: form.date,
            time_start: form.time_start, duration_min: form.duration_min,
            reason: form.reason.trim() || null, is_reactivated: false, status: 'scheduled'
        }
        const res = await supabase.from('appointments').insert(row)
        if (res.error) { toast('Error al crear turno'); return }
        closePanel(); fetchData(); toast('Turno creado')
    }

    async function doCancel(id: string) {
        const res = await supabase.from('appointments').update({ status: 'cancelado' }).eq('id', id)
        if (res.error) { toast('Error al cancelar'); return }
        closePanel(); fetchData(); toast('Turno cancelado')
    }

    async function doUpdateStatus(id: string, status: string) {
        if (!id) { toast('Error: ID inválido'); return }

        // Mapeo a valores reales de tu tabla
        const mapeo: Record<string, string> = {
            'attended': 'completado',
            'absent': 'ausente',
            'scheduled': 'scheduled'
        }

        const valorFinal = mapeo[status] || status

        console.log('💾 Guardando:', { id, status: valorFinal })

        const res = await supabase
            .from('appointments')
            .update({ status: valorFinal })
            .eq('id', id)
            .select()

        console.log('📦 Resultado:', res)

        if (res.error) {
            console.error('❌ Error real:', res.error)
            toast(`Error: ${res.error.message}`);
            return
        }

        // ✅ ÉXITO - Forzar actualización completa
        console.log('✅ Guardado exitoso - Actualizando UI...')

        toast('✅ Estado actualizado correctamente')

        // Cerrar panel PRIMERO
        closePanel()

        // Pequeña espera y luego recargar datos
        setTimeout(async () => {
            await fetchData()
            console.log('🔄 Datos recargados')
        }, 300)
    }

    // ── Command palette ──────────────────────────────────────────────────────────
    const cmdActions = [
        { id: 'new', label: 'Nuevo turno', key: 'N', icon: '➕' },
        { id: 'today', label: 'Ir a hoy', key: 'T', icon: '📅' },
        { id: 'view', label: 'Cambiar vista', key: 'W', icon: '📐' },
    ]
    const filteredCmd = cmdActions.filter(a => a.label.toLowerCase().includes(cmdQuery.toLowerCase()))

    function execCmd(id: string) {
        setCmdOpen(false)
        if (id === 'new') openCreate()
        else if (id === 'today') setDate(new Date())
        else if (id === 'view') setView(v => v === 'day' ? 'week' : 'day')
    }

    // ── Keyboard shortcuts ───────────────────────────────────────────────────────
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (cmdOpen) {
                if (e.key === 'Escape') { setCmdOpen(false); setCmdQuery(''); setCmdIdx(0) }
                if (e.key === 'ArrowDown') setCmdIdx(i => Math.min(i + 1, filteredCmd.length - 1))
                if (e.key === 'ArrowUp') setCmdIdx(i => Math.max(i - 1, 0))
                if (e.key === 'Enter' && filteredCmd[cmdIdx]) execCmd(filteredCmd[cmdIdx].id)
                return
            }
            if (panelOpen) {
                if (e.key === 'Escape') closePanel()
                if (e.key === 'Enter' && panelMode === 'create') submitTurno()
                return
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault(); setCmdOpen(true); setCmdQuery(''); setCmdIdx(0); return
            }
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
            if (e.key === 'n') openCreate()
            if (e.key === 't') setDate(new Date())
            if (e.key === 'w') setView(v => v === 'day' ? 'week' : 'day')
            if (e.key === 'ArrowRight') setDate(d => { const x = new Date(d); x.setDate(x.getDate() + 1); return x })
            if (e.key === 'ArrowLeft') setDate(d => { const x = new Date(d); x.setDate(x.getDate() - 1); return x })
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [cmdOpen, panelOpen, panelMode, filteredCmd, cmdIdx])

    const panelTurno = panelTurnoId ? appointments.find(a => a.id === panelTurnoId) : null
    const hasOverlapsFlag = Object.keys(overlaps).length > 0

    // ── Render ───────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100">

            {/* ── Header ── */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-zinc-800 flex-shrink-0 flex-wrap">

                {/* Vista */}
                <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-zinc-700 text-xs">
                    <button
                        onClick={() => setView('day')}
                        className={`px-3 py-1.5 transition-colors ${view === 'day' ? 'bg-violet-600 text-white' : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-700'}`}
                    >Día</button>
                    <button
                        onClick={() => setView('week')}
                        className={`px-3 py-1.5 transition-colors ${view === 'week' ? 'bg-violet-600 text-white' : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-700'}`}
                    >Semana</button>
                </div>

                {/* ── Navegación de fechas INTELIGENTE ────────────────────── */}
                <div className="flex items-center gap-2 flex-wrap">

                    {/* Flecha ATRÁS - 1 día o 1 semana según vista */}
                    <button
                        onClick={() => setDate(d => {
                            const x = new Date(d);
                            x.setDate(x.getDate() - (view === 'week' ? 7 : 1));
                            return x
                        })}
                        className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 hover:text-gray-700 dark:hover:bg-zinc-700 hover:text-gray-800 text-sm font-medium transition-colors"
                        title={view === 'week' ? 'Semana anterior' : 'Día anterior'}
                    >◀</button>

                    {/* Fecha actual */}
                    <span className="font-medium text-sm min-w-[120px] text-center">
                        {view === 'week' ? `Semana del ${fmtDate(date)}` : fmtDate(date)}
                    </span>

                    {/* Flecha ADELANTE - 1 día o 1 semana según vista */}
                    <button
                        onClick={() => setDate(d => {
                            const x = new Date(d);
                            x.setDate(x.getDate() + (view === 'week' ? 7 : 1));
                            return x
                        })}
                        className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 hover:text-gray-700 dark:hover:bg-zinc-700 hover:text-gray-800 text-sm font-medium transition-colors"
                        title={view === 'week' ? 'Semana siguiente' : 'Día siguiente'}
                    >▶</button>

                    {/* 📅 BUSCADOR DE FECHAS - Ir a cualquier fecha */}
                    <input
                        type="date"
                        value={formatDateISO(date)}
                        onChange={(e) => {
                            if (e.target.value) setDate(new Date(e.target.value + 'T12:00:00'))
                        }}
                        className="px-3 py-1.5 text-xs border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
                        title="Buscar fecha específica"
                    />

                    {/* Botón HOY - Volver al presente */}
                    {!isToday(date) && (
                        <button
                            onClick={() => setDate(new Date())}
                            className="text-xs px-3 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50 font-medium transition-colors"
                        >Hoy</button>
                    )}

                </div>

                {/* Alerta sobreturnos */}
                {hasOverlapsFlag && (
                    <span className="text-xs bg-red-100 dark:bg-red-400/10 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-400/20">
                        ⚠ {Object.keys(overlaps).length} sobreturno{Object.keys(overlaps).length > 1 ? 's' : ''}
                    </span>
                )}

                <div className="ml-auto flex items-center gap-2">
                    {/* Leyenda */}
                    <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 mr-1">
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" />Normal
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block" />Reactivado
                        </span>
                    </div>

                    {/* Selector doctor */}
                    <select
                        value={selectedDoctorId}
                        onChange={e => setSelectedDoctorId(e.target.value)}
                        className="text-xs border border-gray-200 dark:border-zinc-700 rounded px-2 py-1.5 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300"
                    >
                        {doctors.map(d => (
                            <option key={d.id} value={d.id}>{d.name} — {d.specialty}</option>
                        ))}
                    </select>

                    {/* Nuevo turno */}
                    <button
                        onClick={() => openCreate()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-md transition-colors"
                    >
                        <span>+</span> Nuevo turno
                    </button>

                    {/* Command palette trigger */}
                    <button
                        onClick={() => { setCmdOpen(true); setCmdQuery(''); setCmdIdx(0) }}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 text-xs border border-gray-200 dark:border-zinc-700"
                        title="⌘K"
                    >⌘K</button>
                </div>
            </div>

            {/* ── Contenido principal ── */}
            <div className="flex-1 overflow-hidden relative">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                        <div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full mr-2" />
                        Cargando...
                    </div>
                ) : view === 'day' ? (
                    <DayView
                        dayApps={dayApps}
                        overlaps={overlaps}
                        date={date}
                        scrollRef={scrollRef}
                        onClickSlot={openCreate}
                        onClickTurno={openDetail}
                    />
                ) : (
                    <WeekView
                        weekApps={weekApps}
                        overlaps={overlaps}
                        date={date}
                        onClickSlot={openCreate}
                        onClickTurno={openDetail}
                    />
                )}
            </div>

            {/* ── Panel lateral ── */}
            {panelOpen && (
                <div
                    className="fixed inset-0 z-40 flex justify-end"
                    onClick={e => { if (e.target === e.currentTarget) closePanel() }}
                >
                    <div className="w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl border-l border-gray-200 dark:border-zinc-800 flex flex-col h-full overflow-y-auto">
                        {panelMode === 'create' && (
                            <CreatePanel
                                form={form}
                                overlapWarning={overlapWarning}
                                onClose={closePanel}
                                onChange={handleFormChange}
                                onSubmit={submitTurno}
                            />
                        )}
                        {panelMode === 'detail' && panelTurno && (
                            <DetailPanel
                                turno={panelTurno}
                                overlaps={overlaps}
                                doctors={doctors}
                                cancelConfirm={cancelConfirm}
                                onClose={closePanel}
                                onCancelConfirm={() => setCancelConfirm(true)}
                                onCancelBack={() => setCancelConfirm(false)}
                                onDoCancel={() => doCancel(panelTurno.id)}
                                onDoStatus={doUpdateStatus}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* ── Command palette ── */}
            {cmdOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/20 dark:bg-black/40 backdrop-blur-sm"
                    onClick={() => { setCmdOpen(false); setCmdQuery('') }}
                >
                    <div
                        className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-gray-200 dark:border-zinc-700 overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center px-3 border-b border-gray-100 dark:border-zinc-800">
                            <span className="text-gray-400 mr-2 text-sm">🔍</span>
                            <input
                                autoFocus
                                value={cmdQuery}
                                onChange={e => { setCmdQuery(e.target.value); setCmdIdx(0) }}
                                placeholder="Buscar acción..."
                                className="flex-1 py-3 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
                            />
                        </div>
                        <div className="py-1">
                            {filteredCmd.length === 0 && (
                                <div className="px-3 py-2.5 text-sm text-gray-400">Sin resultados</div>
                            )}
                            {filteredCmd.map((a, i) => (
                                <button
                                    key={a.id}
                                    onClick={() => execCmd(a.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors ${i === cmdIdx ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
                                >
                                    <span>{a.icon}</span>
                                    <span className="flex-1">{a.label}</span>
                                    <kbd className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-gray-500 font-mono">{a.key}</kbd>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── DayView ───────────────────────────────────────────────────────────────────
function DayView({
    dayApps, overlaps, date, scrollRef, onClickSlot, onClickTurno
}: {
    dayApps: Appointment[]
    overlaps: Record<string, boolean>
    date: Date
    scrollRef: React.RefObject<HTMLDivElement>
    onClickSlot: (hora: string) => void
    onClickTurno: (id: string) => void
}) {
    const timeSlots = buildTimeSlots()
    const totalH = TOTAL_SLOTS * SLOT_H

    return (
        <div ref={scrollRef} className="h-full overflow-y-auto">
            <div className="relative flex" style={{ minHeight: totalH + 'px' }}>

                {/* Gutter de horas */}
                <div className="w-14 flex-shrink-0 relative select-none">
                    {timeSlots.map((t, i) => i % 2 === 0 && (
                        <div
                            key={t}
                            className="absolute right-2 text-[10px] text-gray-400 dark:text-zinc-500"
                            style={{ top: i * SLOT_H - 7 + 'px' }}
                        >{t}</div>
                    ))}
                </div>

                {/* Grilla */}
                <div className="flex-1 relative border-l border-gray-100 dark:border-zinc-800">
                    {timeSlots.map((t, i) => (
                        <div
                            key={t}
                            onClick={() => onClickSlot(t)}
                            className={`absolute w-full cursor-pointer hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors
                ${i % 2 === 0
                                    ? 'border-t border-gray-200 dark:border-zinc-700'
                                    : 'border-t border-dashed border-gray-100 dark:border-zinc-800'}`}
                            style={{ top: i * SLOT_H + 'px', height: SLOT_H + 'px' }}
                        />
                    ))}

                    {/* Línea de hora actual */}
                    {isToday(date) && <CurrentTimeLine />}

                    {/* Turnos */}
                    {dayApps.map(app => (
                        <AppointmentBlock
                            key={app.id}
                            app={app}
                            isOverlap={!!overlaps[app.id]}
                            onClick={() => onClickTurno(app.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

// ─── WeekView ──────────────────────────────────────────────────────────────────
function WeekView({
    weekApps, overlaps, date, onClickSlot, onClickTurno
}: {
    weekApps: Appointment[]
    overlaps: Record<string, boolean>
    date: Date
    onClickSlot: (hora: string) => void
    onClickTurno: (id: string) => void
}) {
    const weekDates = getWeekDates(date)
    const timeSlots = buildTimeSlots()
    const totalH = TOTAL_SLOTS * SLOT_H

    return (
        <div className="h-full overflow-auto">
            {/* Cabecera de días */}
            <div className="flex border-b border-gray-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
                <div className="w-14 flex-shrink-0" />
                {weekDates.map(d => (
                    <div
                        key={d.toISOString()}
                        className={`flex-1 text-center py-2 text-xs font-medium ${isToday(d) ? 'text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                        {fmtDateShort(d)}
                        {isToday(d) && <span className="ml-1 w-1.5 h-1.5 bg-violet-500 rounded-full inline-block" />}
                    </div>
                ))}
            </div>

            <div className="relative flex" style={{ minHeight: totalH + 'px' }}>
                {/* Gutter horas */}
                <div className="w-14 flex-shrink-0 relative select-none">
                    {timeSlots.map((t, i) => i % 2 === 0 && (
                        <div
                            key={t}
                            className="absolute right-2 text-[10px] text-gray-400"
                            style={{ top: i * SLOT_H - 7 + 'px' }}
                        >{t}</div>
                    ))}
                </div>

                {/* Columnas por día */}
                {weekDates.map(d => {
                    const dateStr = formatDateISO(d)
                    const dayA = weekApps.filter(a => a.date === dateStr)
                    return (
                        <div key={dateStr} className="flex-1 relative border-l border-gray-100 dark:border-zinc-800">
                            {timeSlots.map((t, i) => (
                                <div
                                    key={t}
                                    onClick={() => onClickSlot(t)}
                                    className={`absolute w-full cursor-pointer hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors
                    ${i % 2 === 0
                                            ? 'border-t border-gray-200 dark:border-zinc-700'
                                            : 'border-t border-dashed border-gray-100 dark:border-zinc-800'}`}
                                    style={{ top: i * SLOT_H + 'px', height: SLOT_H + 'px' }}
                                />
                            ))}
                            {isToday(d) && <CurrentTimeLine />}
                            {dayA.map(app => (
                                <AppointmentBlock
                                    key={app.id}
                                    app={app}
                                    isOverlap={!!overlaps[app.id]}
                                    onClick={() => onClickTurno(app.id)}
                                />
                            ))}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ─── CurrentTimeLine ───────────────────────────────────────────────────────────
function CurrentTimeLine() {
    const getNowTop = () => {
        const now = new Date()
        return slotTop(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    }
    const [top, setTop] = useState(getNowTop)

    useEffect(() => {
        const interval = setInterval(() => setTop(getNowTop()), 60000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div
            className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
            style={{ top: top + 'px' }}
        >
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
            <div className="flex-1 h-px bg-red-500" />
        </div>
    )
}

// ─── AppointmentBlock ──────────────────────────────────────────────────────────
// ─── AppointmentBlock ──────────────────────────────────────────────────────────
function AppointmentBlock({ app, isOverlap, onClick }: {
    app: Appointment
    isOverlap: boolean
    onClick: () => void
}) {
    // 🎨 COLORES CORREGIDOS - Usando los valores REALES de tu BD
    let colorClass = 'bg-violet-500/20 border-violet-400/50 dark:bg-violet-500/15 dark:border-violet-500/30 text-violet-900 dark:text-violet-200'

    if (app.status === 'completado') {
        // 🟢 VERDE - Atendido
        colorClass = 'bg-green-500/25 border-green-500/50 dark:bg-green-500/20 dark:border-green-500/40 text-green-800 dark:text-green-300 font-medium'
    } else if (app.status === 'cancelado') {
        // 🔴 ROJO - Cancelado
        colorClass = 'bg-red-500/25 border-red-500/50 dark:bg-red-500/20 dark:border-red-500/40 text-red-800 dark:text-red-300 line-through opacity-70'
    } else if (app.status === 'ausente') {
        // ⚫ GRIS - No asistió
        colorClass = 'bg-gray-400/30 border-gray-500/50 dark:bg-gray-600/30 dark:border-gray-500/40 text-gray-700 dark:text-gray-300 line-through opacity-60'
    } else if (isOverlap) {
        // 🟠 NARANJA - Superpuesto
        colorClass = 'bg-orange-400/30 border-orange-500/60 dark:bg-orange-500/20 dark:border-orange-500/40 text-orange-800 dark:text-orange-300 border-2 border-dashed'
    } else if (app.is_reactivated) {
        // 🔵 CYAN - Reactivado
        colorClass = 'bg-cyan-500/20 border-cyan-400/50 dark:bg-cyan-500/15 dark:border-cyan-500/30 text-cyan-800 dark:text-cyan-200'
    }
    // else → 🔮 VIOLETA (valor por defecto = 'scheduled')

    const top = slotTop(app.time_start || '09:00')
    const height = turnoH(app.duration_min || 30)

    return (
        <div
            onClick={onClick}
            className={`absolute left-1 right-1 rounded-md px-1 cursor-pointer ${colorClass} shadow-sm truncate leading-tight hover:shadow-md hover:brightness-95 transition-all`}
            style={{ top: `${top}px`, height: `${height}px` }}
        >
            <div className="text-xs font-semibold truncate leading-tight">
                {app.patient_name}
                {' '}
                <span className="font-normal opacity-75">
                    {app.status === 'completado' && '✅'}
                    {app.status === 'cancelado' && '🚫'}
                    {app.status === 'ausente' && '❌'}
                    {app.status === 'scheduled' && '⏰'}
                    {app.is_reactivated && '🔄'}
                </span>
            </div>
            <div className="text-[10px] opacity-70 mt-0.5">
                {app.time_start} · {app.duration_min}min
            </div>
            {app.reason && (
                <div className="text-[10px] opacity-60 truncate">
                    {app.reason}
                </div>
            )}
        </div>
    )
}

// ─── CreatePanel ───────────────────────────────────────────────────────────────
function CreatePanel({ form, overlapWarning, onClose, onChange, onSubmit }: {
    form: FormState
    overlapWarning: string | null
    onClose: () => void
    onChange: (field: keyof FormState, value: string | number) => void
    onSubmit: () => void
}) {
    return (
        <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
                <h2 className="font-semibold text-sm">Nuevo turno</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre del paciente *</label>
                    <input
                        value={form.patient_name}
                        onChange={e => onChange('patient_name', e.target.value)}
                        placeholder="Ej: María García"
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Teléfono *</label>
                    <input
                        value={form.patient_phone}
                        onChange={e => onChange('patient_phone', e.target.value)}
                        placeholder="+54 9 11 1234-5678"
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email</label>
                    <input
                        value={form.patient_email}
                        onChange={e => onChange('patient_email', e.target.value)}
                        placeholder="opcional"
                        type="email"
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
                        <input
                            type="date"
                            value={form.date}
                            onChange={e => onChange('date', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Hora</label>
                        <input
                            type="time"
                            value={form.time_start}
                            step={1800}
                            onChange={e => onChange('time_start', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Duración</label>
                    <select
                        value={form.duration_min}
                        onChange={e => onChange('duration_min', Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                        <option value={15}>15 minutos</option>
                        <option value={30}>30 minutos</option>
                        <option value={45}>45 minutos</option>
                        <option value={60}>1 hora</option>
                        <option value={90}>1h 30min</option>
                        <option value={120}>2 horas</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Motivo</label>
                    <textarea
                        value={form.reason}
                        onChange={e => onChange('reason', e.target.value)}
                        placeholder="Consulta, control, implante..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    />
                </div>

                {overlapWarning && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-400/10 rounded-lg border border-red-200 dark:border-red-400/20 text-red-700 dark:text-red-400 text-xs">
                        <span>⚠️</span>
                        <span>{overlapWarning}</span>
                    </div>
                )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 flex gap-2 flex-shrink-0">
                <button
                    onClick={onClose}
                    className="flex-1 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >Cancelar</button>
                <button
                    onClick={onSubmit}
                    className="flex-1 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
                >Guardar turno</button>
            </div>
        </>
    )
}

// ─── DetailPanel ───────────────────────────────────────────────────────────────
function DetailPanel({ turno, overlaps, doctors, cancelConfirm, onClose, onCancelConfirm, onCancelBack, onDoCancel, onDoStatus }: {
    turno: Appointment
    overlaps: Record<string, boolean>
    doctors: Doctor[]
    cancelConfirm: boolean
    onClose: () => void
    onCancelConfirm: () => void
    onCancelBack: () => void
    onDoCancel: () => void
    onDoStatus: (id: string, status: 'attended' | 'absent' | 'scheduled') => void
}) {
    const doctor = doctors.find(d => d.id === turno.doctor_id)
    const isOverlap = !!overlaps[turno.id]
    const isReactivated = turno.is_reactivated

    const accentClass = turno.status === 'completado' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-500/20'
        : turno.status === 'ausente' ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            : isReactivated ? 'bg-cyan-50 dark:bg-cyan-900/10 border-cyan-200 dark:border-cyan-500/20'
                : 'bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-500/20'

    const waLink = turno.patient_phone
        ? `https://wa.me/${turno.patient_phone.replace(/\D/g, '')}?text=Hola%20${encodeURIComponent(turno.patient_name)},%20le%20recordamos%20su%20turno%20el%20${turno.date}%20a%20las%20${turno.time_start}.`
        : null

    return (
        <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
                <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-sm">Detalle del turno</h2>
                    {isReactivated && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 rounded font-medium">Reactivado</span>
                    )}
                    {isOverlap && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-medium">⚠ Sobreturno</span>
                    )}
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
                {/* Card principal */}
                <div className={`p-4 rounded-xl border ${accentClass}`}>
                    <div className="font-semibold text-base">{turno.patient_name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                        {turno.time_start} – {endTime(turno.time_start, turno.duration_min)} · {turno.duration_min}min
                    </div>
                </div>

                {/* --- NUEVO: Botones de Asistencia --- */}
                {turno.status === 'scheduled' ? (
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => onDoStatus(turno.id, 'attended')} className="py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg">✅ Asistió</button>
                        <button onClick={() => onDoStatus(turno.id, 'absent')} className="py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg">❌ Ausente</button>
                    </div>
                ) : (
                    <button onClick={() => onDoStatus(turno.id, 'scheduled')} className="w-full py-2 text-xs text-violet-600 dark:text-violet-400 hover:underline">
                        Deshacer marca de asistencia
                    </button>
                )}

                {/* Info */}
                <div className="space-y-2.5 text-sm">
                    {turno.patient_phone && (
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-base">📱</span>
                            <a href={`tel:${turno.patient_phone}`} className="text-violet-600 dark:text-violet-400 hover:underline">
                                {turno.patient_phone}
                            </a>
                        </div>
                    )}
                    {turno.patient_email && (
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-base">✉️</span>
                            <a href={`mailto:${turno.patient_email}`} className="text-violet-600 dark:text-violet-400 hover:underline">
                                {turno.patient_email}
                            </a>
                        </div>
                    )}
                    {turno.reason && (
                        <div className="flex items-start gap-2">
                            <span className="text-gray-400 text-base">📋</span>
                            <span className="text-gray-700 dark:text-gray-300">{turno.reason}</span>
                        </div>
                    )}
                    {turno.notes && (
                        <div className="flex items-start gap-2">
                            <span className="text-gray-400 text-base">📝</span>
                            <span className="text-gray-700 dark:text-gray-300 text-xs italic">{turno.notes}</span>
                        </div>
                    )}
                    {doctor && (
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-base">👨‍⚕️</span>
                            <span className="text-gray-700 dark:text-gray-300">{doctor.name} · {doctor.specialty}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-base">📅</span>
                        <span className="text-gray-700 dark:text-gray-300">{turno.date}</span>
                    </div>
                </div>

                {/* WhatsApp */}
                {waLink && (
                    <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors"
                    >
                        📱 Enviar recordatorio por WhatsApp
                    </a>
                )}

                {/* Confirmar cancelación */}
                {cancelConfirm && (
                    <div className="p-3 bg-red-50 dark:bg-red-400/5 rounded-lg border border-red-200 dark:border-red-400/10">
                        <p className="text-sm text-red-700 dark:text-red-400 font-medium mb-2">
                            ¿Cancelar este turno? No se puede deshacer.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={onDoCancel}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition-colors"
                            >Sí, cancelar</button>
                            <button
                                onClick={onCancelBack}
                                className="px-3 py-1.5 bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 text-xs rounded-md border border-gray-200 dark:border-zinc-700 transition-colors"
                            >Volver</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 flex-shrink-0">
                {!cancelConfirm && (
                    <button
                        onClick={onCancelConfirm}
                        className="w-full py-2.5 bg-red-50 dark:bg-red-400/5 hover:bg-red-100 dark:hover:bg-red-400/10 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg border border-red-200 dark:border-red-400/20 transition-colors"
                    >Cancelar turno</button>
                )}
                <p className="text-[10px] text-gray-400 dark:text-zinc-500 text-center mt-2">Esc para cerrar</p>
            </div>
        </>
    )
}