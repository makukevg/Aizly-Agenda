'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Appointment, Doctor } from '@/types'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface MetricsDashboardProps {
    clinicId: string
    doctors: Doctor[]
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function startOfWeek(d: Date): Date {
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const mon = new Date(d)
    mon.setDate(d.getDate() + diff)
    mon.setHours(0, 0, 0, 0)
    return mon
}

function formatISO(d: Date): string {
    return d.toISOString().split('T')[0]
}

function getWeekRange(offset = 0): { start: string; end: string; label: string } {
    const now = new Date()
    const mon = startOfWeek(now)
    mon.setDate(mon.getDate() + offset * 7)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    const label = offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana anterior' : `Semana ${offset > 0 ? '+' : ''}${offset}`
    return { start: formatISO(mon), end: formatISO(sun), label }
}

function getMonthRange(offset = 0): { start: string; end: string; label: string } {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + offset
    const start = new Date(y, m, 1)
    const end = new Date(y, m + 1, 0)
    const label = start.toLocaleString('es-AR', { month: 'long', year: 'numeric' })
    return { start: formatISO(start), end: formatISO(end), label: label.charAt(0).toUpperCase() + label.slice(1) }
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const HORAS = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']

// ─── Componentes UI ───────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 p-5 ${className}`}>
            {children}
        </div>
    )
}

function StatBig({ value, label, sub, color = 'violet' }: { value: string | number; label: string; sub?: string; color?: string }) {
    const colors: Record<string, string> = {
        violet: 'text-violet-600 dark:text-violet-400',
        green: 'text-green-600 dark:text-green-400',
        cyan: 'text-cyan-600 dark:text-cyan-400',
        red: 'text-red-500 dark:text-red-400',
        gray: 'text-gray-500 dark:text-gray-400',
        amber: 'text-amber-600 dark:text-amber-400',
    }
    return (
        <div className="flex flex-col gap-0.5">
            <span className={`text-3xl font-bold tabular-nums ${colors[color]}`}>{value}</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
            {sub && <span className="text-xs text-gray-400 dark:text-zinc-500">{sub}</span>}
        </div>
    )
}

function MiniBar({ value, max, color = 'bg-violet-500' }: { value: number; max: number; color?: string }) {
    const pct = max === 0 ? 0 : Math.round((value / max) * 100)
    return (
        <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums text-gray-500 dark:text-zinc-400 w-6 text-right">{value}</span>
        </div>
    )
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
    const total = data.reduce((s, d) => s + d.value, 0)
    if (total === 0) return <div className="text-xs text-gray-400 text-center py-4">Sin datos</div>

    let cumulative = 0
    const radius = 36
    const cx = 50
    const cy = 50
    const strokeWidth = 14

    const segments = data.map(d => {
        const pct = d.value / total
        const start = cumulative
        cumulative += pct
        return { ...d, pct, startPct: start }
    }).filter(d => d.value > 0)

    function describeArc(startPct: number, endPct: number) {
        const startAngle = startPct * 2 * Math.PI - Math.PI / 2
        const endAngle = endPct * 2 * Math.PI - Math.PI / 2
        const x1 = cx + radius * Math.cos(startAngle)
        const y1 = cy + radius * Math.sin(startAngle)
        const x2 = cx + radius * Math.cos(endAngle)
        const y2 = cy + radius * Math.sin(endAngle)
        const large = endPct - startPct > 0.5 ? 1 : 0
        return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`
    }

    return (
        <div className="flex items-center gap-4">
            <svg viewBox="0 0 100 100" className="w-20 h-20 flex-shrink-0">
                {segments.map((seg, i) => (
                    <path
                        key={i}
                        d={describeArc(seg.startPct, seg.startPct + seg.pct)}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                ))}
                <text x="50" y="54" textAnchor="middle" className="text-[14px] font-bold" fill="currentColor" fontSize="14" fontWeight="bold">
                    {total}
                </text>
            </svg>
            <div className="flex flex-col gap-1.5">
                {data.filter(d => d.value > 0).map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-gray-600 dark:text-gray-400">{d.label}</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200 ml-auto pl-2">{Math.round(d.value / total * 100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function MetricsDashboard({ clinicId, doctors }: MetricsDashboardProps) {
    const supabase = createClient()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState<'week' | 'month'>('week')
    const [weekOffset, setWeekOffset] = useState(0)
    const [monthOffset, setMonthOffset] = useState(0)
    const [doctorFilter, setDoctorFilter] = useState<string>('all')

    // ── Fetch ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        async function fetchAll() {
            setLoading(true)
            const { data } = await supabase
                .from('appointments')
                .select('*')
                .eq('clinic_id', clinicId)
                .order('date', { ascending: true })
            if (data) setAppointments(data)
            setLoading(false)
        }
        fetchAll()
    }, [clinicId])

    // ── Rango activo ──────────────────────────────────────────────────────────
    const range = useMemo(() => {
        return period === 'week' ? getWeekRange(weekOffset) : getMonthRange(monthOffset)
    }, [period, weekOffset, monthOffset])

    // ── Filtrado ──────────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        return appointments.filter(a => {
            const inRange = a.date >= range.start && a.date <= range.end
            const byDoctor = doctorFilter === 'all' || a.doctor_id === doctorFilter
            return inRange && byDoctor
        })
    }, [appointments, range, doctorFilter])

    const allInRange = useMemo(() => {
        return appointments.filter(a => a.date >= range.start && a.date <= range.end)
    }, [appointments, range])

    // ── Métricas ──────────────────────────────────────────────────────────────
    const metrics = useMemo(() => {
        const total = filtered.length
        const scheduled = filtered.filter(a => a.status === 'scheduled').length
        const completado = filtered.filter(a => a.status === 'completado').length
        const ausente = filtered.filter(a => a.status === 'ausente').length
        const cancelado = filtered.filter(a => a.status === 'cancelado').length
        const reactivados = filtered.filter(a => a.is_reactivated).length

        // Tasa asistencia (sobre los que ya tuvieron turno)
        const pasados = completado + ausente + cancelado
        const tasaAsistencia = pasados === 0 ? null : Math.round((completado / pasados) * 100)

        // Pacientes únicos
        const pacientesUnicos = new Set(filtered.map(a => a.patient_phone || a.patient_name)).size

        // Pacientes recurrentes (tuvieron turno antes del rango)
        const phonesFiltrados = new Set(filtered.map(a => a.patient_phone).filter(Boolean))
        const antes = appointments.filter(a => a.date < range.start)
        const recurrentes = [...phonesFiltrados].filter(p => antes.some(a => a.patient_phone === p)).length
        const nuevos = pacientesUnicos - recurrentes

        // Horarios más demandados
        const porHora: Record<string, number> = {}
        filtered.forEach(a => {
            const h = a.time_start?.slice(0, 2) || '00'
            porHora[h] = (porHora[h] || 0) + 1
        })
        const horasOrdenadas = HORAS.map(h => ({ hora: h + ':00', count: porHora[h] || 0 }))
        const maxHora = Math.max(...horasOrdenadas.map(h => h.count), 1)

        // Evolución mensual (últimos 6 meses)
        const evolucion: { mes: string; total: number; completados: number }[] = []
        for (let i = 5; i >= 0; i--) {
            const r = getMonthRange(-i)
            const mes = appointments.filter(a => a.date >= r.start && a.date <= r.end &&
                (doctorFilter === 'all' || a.doctor_id === doctorFilter))
            evolucion.push({
                mes: MESES[new Date(r.start + 'T12:00:00').getMonth()],
                total: mes.length,
                completados: mes.filter(a => a.status === 'completado').length
            })
        }
        const maxEvo = Math.max(...evolucion.map(e => e.total), 1)

        // Razones más comunes
        const porRazon: Record<string, number> = {}
        filtered.forEach(a => {
            if (a.reason) porRazon[a.reason] = (porRazon[a.reason] || 0) + 1
        })
        const razones = Object.entries(porRazon).sort((a, b) => b[1] - a[1]).slice(0, 5)

        // Minutos totales agenda
        const minTotales = filtered.reduce((s, a) => s + (a.duration_min || 0), 0)

        return {
            total, scheduled, completado, ausente, cancelado, reactivados,
            tasaAsistencia, pacientesUnicos, nuevos, recurrentes,
            horasOrdenadas, maxHora, evolucion, maxEvo, razones, minTotales
        }
    }, [filtered, appointments, range, doctorFilter])

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-5 p-5 bg-gray-50 dark:bg-zinc-950 min-h-full">

            {/* ── Header ── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Métricas</h1>
                    <p className="text-sm text-gray-400 dark:text-zinc-500">{range.label}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Filtro doctor */}
                    <select
                        value={doctorFilter}
                        onChange={e => setDoctorFilter(e.target.value)}
                        className="text-xs border border-gray-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300"
                    >
                        <option value="all">Todos los profesionales</option>
                        {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>

                    {/* Toggle semana/mes */}
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700 text-xs">
                        <button
                            onClick={() => setPeriod('week')}
                            className={`px-3 py-1.5 transition-colors ${period === 'week' ? 'bg-violet-600 text-white' : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400'}`}
                        >Semana</button>
                        <button
                            onClick={() => setPeriod('month')}
                            className={`px-3 py-1.5 transition-colors ${period === 'month' ? 'bg-violet-600 text-white' : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400'}`}
                        >Mes</button>
                    </div>

                    {/* Navegación período */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => period === 'week' ? setWeekOffset(o => o - 1) : setMonthOffset(o => o - 1)}
                            className="px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-sm hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                        >◀</button>
                        <button
                            onClick={() => { setWeekOffset(0); setMonthOffset(0) }}
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-xs text-violet-600 dark:text-violet-400 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                        >Hoy</button>
                        <button
                            onClick={() => period === 'week' ? setWeekOffset(o => o + 1) : setMonthOffset(o => o + 1)}
                            className="px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-sm hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                        >▶</button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full" />
                    Cargando métricas...
                </div>
            ) : (
                <>
                    {/* ── Fila 1: Stats principales ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Card>
                            <StatBig value={metrics.total} label="Turnos totales" sub={`${Math.round(metrics.minTotales / 60)}h de agenda`} color="violet" />
                        </Card>
                        <Card>
                            <StatBig
                                value={metrics.tasaAsistencia !== null ? `${metrics.tasaAsistencia}%` : '—'}
                                label="Tasa de asistencia"
                                sub={`${metrics.completado} asistieron`}
                                color="green"
                            />
                        </Card>
                        <Card>
                            <StatBig value={metrics.pacientesUnicos} label="Pacientes únicos" sub={`${metrics.nuevos} nuevos · ${metrics.recurrentes} recurrentes`} color="cyan" />
                        </Card>
                        <Card>
                            <StatBig value={metrics.reactivados} label="Reactivados" sub={metrics.total > 0 ? `${Math.round(metrics.reactivados / metrics.total * 100)}% del total` : '—'} color="amber" />
                        </Card>
                    </div>

                    {/* ── Fila 2: Distribución + Horarios ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                        {/* Distribución de estados */}
                        <Card>
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Estado de turnos</h2>
                            <DonutChart data={[
                                { label: 'Programados', value: metrics.scheduled, color: '#8b5cf6' },
                                { label: 'Asistieron', value: metrics.completado, color: '#22c55e' },
                                { label: 'Ausentes', value: metrics.ausente, color: '#6b7280' },
                                { label: 'Cancelados', value: metrics.cancelado, color: '#ef4444' },
                            ]} />
                        </Card>

                        {/* Horarios demandados */}
                        <Card>
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Horarios más demandados</h2>
                            {metrics.total === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">Sin turnos en este período</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {metrics.horasOrdenadas
                                        .filter(h => h.count > 0)
                                        .sort((a, b) => b.count - a.count)
                                        .slice(0, 6)
                                        .map(h => (
                                            <div key={h.hora} className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 dark:text-zinc-400 w-10 font-mono">{h.hora}</span>
                                                <MiniBar value={h.count} max={metrics.maxHora} color="bg-violet-500" />
                                            </div>
                                        ))
                                    }
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* ── Fila 3: Evolución mensual ── */}
                    <Card>
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Evolución — últimos 6 meses</h2>
                        <div className="flex items-end gap-2 h-28">
                            {metrics.evolucion.map((e, i) => {
                                const hTotal = metrics.maxEvo === 0 ? 0 : Math.round((e.total / metrics.maxEvo) * 100)
                                const hComp = e.total === 0 ? 0 : Math.round((e.completados / e.total) * 100)
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                        <div className="w-full flex flex-col justify-end" style={{ height: '88px' }}>
                                            <div className="relative w-full rounded-t-md overflow-hidden bg-gray-100 dark:bg-zinc-800" style={{ height: `${hTotal}%`, minHeight: e.total > 0 ? '8px' : '0' }}>
                                                <div className="absolute bottom-0 w-full bg-green-500/60" style={{ height: `${hComp}%` }} />
                                                <div className="absolute top-0 w-full h-full bg-violet-500/30" />
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-gray-400 dark:text-zinc-500">{e.mes}</span>
                                        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">{e.total}</span>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="flex gap-3 mt-2">
                            <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-violet-500/30 inline-block" />Total</span>
                            <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-sm bg-green-500/60 inline-block" />Asistieron</span>
                        </div>
                    </Card>

                    {/* ── Fila 4: Razones más comunes ── */}
                    {metrics.razones.length > 0 && (
                        <Card>
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Motivos de consulta más frecuentes</h2>
                            <div className="space-y-2">
                                {metrics.razones.map(([razon, count], i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500 dark:text-zinc-400 w-4 text-right">{i + 1}.</span>
                                        <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{razon}</span>
                                        <MiniBar
                                            value={count}
                                            max={metrics.razones[0][1]}
                                            color={i === 0 ? 'bg-violet-500' : 'bg-violet-300 dark:bg-violet-700'}
                                        />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </>
            )}
        </div>
    )
}
