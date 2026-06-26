'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/toast'
import type { Appointment, Doctor } from '@/types'

interface Patient {
    name: string
    phone: string
    lastDate: string
    totalTurnos: number
    email: string | null
}

interface MedicalRecord {
    id: string
    date: string
    reason: string | null
    diagnosis: string | null
    treatment: string | null
    notes: string | null
    next_appointment_suggested: string | null
    doctor_id: string | null
    created_at: string
}

interface RecordForm {
    date: string
    reason: string
    diagnosis: string
    treatment: string
    notes: string
    next_appointment_suggested: string
    doctor_id: string
}

function normalizar(texto: string) {
    return texto.toLowerCase().trim().replace(/\s+/g, ' ')
}

function whatsappLink(phone: string) {
    const digits = phone.replace(/\D/g, '')
    let number = digits
    if (!digits.startsWith('54')) number = '549' + digits
    else if (digits.startsWith('54') && !digits.startsWith('549')) number = '549' + digits.slice(2)
    return `https://wa.me/${number}`
}

function monthsAgo(months: number) {
    const d = new Date()
    d.setMonth(d.getMonth() - months)
    return d.toISOString().split('T')[0]
}

type SortCol = 'name' | 'phone' | 'turnos' | 'lastDate'
type SortDir = 'asc' | 'desc'
type FilterType = 'all' | 'active' | 'inactive' | 'lost'

export default function PacientesPage() {
    const supabase = createClient()
    const toast = useToast()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [doctors, setDoctors] = useState<Doctor[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
    const [patientHistory, setPatientHistory] = useState<Appointment[]>([])
    const [sortCol, setSortCol] = useState<SortCol>('lastDate')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [filter, setFilter] = useState<FilterType>('all')

    const [panelTab, setPanelTab] = useState<'turnos' | 'historia'>('turnos')
    const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([])
    const [loadingRecords, setLoadingRecords] = useState(false)
    const [recordForm, setRecordForm] = useState<RecordForm | null>(null)
    const [savingRecord, setSavingRecord] = useState(false)
    const [clinicId, setClinicId] = useState<string | null>(null)

    const [importOpen, setImportOpen] = useState(false)
    const [importText, setImportText] = useState('')
    const [importPreview, setImportPreview] = useState<{ name: string; phone: string; email: string }[]>([])
    const [importDoctor, setImportDoctor] = useState('')
    const [importing, setImporting] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const fetchData = useCallback(async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
        if (!profile?.clinic_id) { setLoading(false); return }
        setClinicId(profile.clinic_id)
        const { data: docs } = await supabase.from('doctors').select('*').eq('clinic_id', profile.clinic_id).eq('active', true).order('name')
        if (docs) setDoctors(docs as Doctor[])
        const { data: apps } = await supabase.from('appointments').select('*').eq('clinic_id', profile.clinic_id).order('date', { ascending: false }).order('time_start', { ascending: false })
        if (apps) setAppointments(apps as Appointment[])
        setLoading(false)
    }, [supabase])

    useEffect(() => { fetchData() }, [fetchData])

    const patients: Patient[] = useMemo(() => {
        const map = new Map<string, Patient>()
        appointments.forEach(a => {
            const key = `${normalizar(a.patient_name)}|${normalizar(a.patient_phone)}`
            if (map.has(key)) {
                const p = map.get(key)!
                if (a.date > p.lastDate) p.lastDate = a.date
                p.totalTurnos++
                if (!p.email && a.patient_email) p.email = a.patient_email
            } else {
                map.set(key, {
                    name: a.patient_name.trim(),
                    phone: a.patient_phone.trim(),
                    lastDate: a.date,
                    totalTurnos: 1,
                    email: a.patient_email,
                })
            }
        })
        return Array.from(map.values())
    }, [appointments])

    const filtered = useMemo(() => {
        if (!search.trim()) return patients
        const q = normalizar(search)
        return patients.filter(p => normalizar(p.name).includes(q) || p.phone.includes(q))
    }, [patients, search])

    const withFilter = useMemo(() => {
        const sixMonthsAgo = monthsAgo(6)
        const oneYearAgo = monthsAgo(12)
        if (filter === 'active') return filtered.filter(p => p.lastDate >= sixMonthsAgo)
        if (filter === 'inactive') return filtered.filter(p => p.lastDate < sixMonthsAgo && p.lastDate >= oneYearAgo)
        if (filter === 'lost') return filtered.filter(p => p.lastDate < oneYearAgo)
        return filtered
    }, [filtered, filter])

    const sorted = useMemo(() => {
        const arr = [...withFilter]
        arr.sort((a, b) => {
            let cmp = 0
            if (sortCol === 'name') cmp = normalizar(a.name).localeCompare(normalizar(b.name))
            else if (sortCol === 'phone') cmp = a.phone.localeCompare(b.phone)
            else if (sortCol === 'turnos') cmp = a.totalTurnos - b.totalTurnos
            else if (sortCol === 'lastDate') cmp = a.lastDate.localeCompare(b.lastDate)
            return sortDir === 'asc' ? cmp : -cmp
        })
        return arr
    }, [withFilter, sortCol, sortDir])

    const filterCounts = useMemo(() => {
        const sixMonthsAgo = monthsAgo(6)
        const oneYearAgo = monthsAgo(12)
        return {
            all: filtered.length,
            active: filtered.filter(p => p.lastDate >= sixMonthsAgo).length,
            inactive: filtered.filter(p => p.lastDate < sixMonthsAgo && p.lastDate >= oneYearAgo).length,
            lost: filtered.filter(p => p.lastDate < oneYearAgo).length,
        }
    }, [filtered])

    function toggleSort(col: SortCol) {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortCol(col); setSortDir('desc') }
    }

    function SortIcon({ col }: { col: SortCol }) {
        if (sortCol !== col) return <span className="text-gray-300 dark:text-zinc-600 ml-1 text-[10px]">↕</span>
        return <span className="text-blue-500 ml-1 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
    }

    async function selectPatient(p: Patient) {
        setSelectedPatient(p)
        setPanelTab('turnos')
        setRecordForm(null)
        const history = appointments.filter(
            a => normalizar(a.patient_name) === normalizar(p.name) && normalizar(a.patient_phone) === normalizar(p.phone)
        )
        setPatientHistory(history)
        await loadMedicalRecords(p.phone)
    }

    async function loadMedicalRecords(phone: string) {
        setLoadingRecords(true)
        // Buscar patient_id por phone en tabla patients
        const { data: pat } = await supabase
            .from('patients')
            .select('id')
            .eq('phone', phone)
            .eq('clinic_id', clinicId)
            .maybeSingle()
        if (!pat) { setMedicalRecords([]); setLoadingRecords(false); return }
        const { data: records } = await supabase
            .from('medical_records')
            .select('*')
            .eq('patient_id', pat.id)
            .order('date', { ascending: false })
        setMedicalRecords(records || [])
        setLoadingRecords(false)
    }

    function openRecordForm() {
        const today = new Date().toISOString().split('T')[0]
        setRecordForm({
            date: today,
            reason: selectedPatient ? (patientHistory[0]?.reason || '') : '',
            diagnosis: '',
            treatment: '',
            notes: '',
            next_appointment_suggested: '',
            doctor_id: doctors[0]?.id || '',
        })
    }

    async function saveRecord() {
        if (!recordForm || !selectedPatient || !clinicId) return
        setSavingRecord(true)

        // Buscar o crear paciente en tabla patients
        let patientId: string
        const { data: existing } = await supabase
            .from('patients')
            .select('id')
            .eq('phone', selectedPatient.phone)
            .eq('clinic_id', clinicId)
            .maybeSingle()

        if (existing) {
            patientId = existing.id
        } else {
            const { data: newPat, error } = await supabase
                .from('patients')
                .insert({
                    clinic_id: clinicId,
                    name: selectedPatient.name,
                    phone: selectedPatient.phone,
                    email: selectedPatient.email,
                })
                .select('id')
                .single()
            if (error || !newPat) { toast('Error al guardar'); setSavingRecord(false); return }
            patientId = newPat.id
        }

        const { error } = await supabase.from('medical_records').insert({
            clinic_id: clinicId,
            patient_id: patientId,
            doctor_id: recordForm.doctor_id || null,
            date: recordForm.date,
            reason: recordForm.reason || null,
            diagnosis: recordForm.diagnosis || null,
            treatment: recordForm.treatment || null,
            notes: recordForm.notes || null,
            next_appointment_suggested: recordForm.next_appointment_suggested || null,
        })

        if (error) { toast('Error al guardar historia'); setSavingRecord(false); return }
        toast('Historia clínica guardada ✓')
        setRecordForm(null)
        await loadMedicalRecords(selectedPatient.phone)
        setSavingRecord(false)
    }

    function closePanel() { setSelectedPatient(null); setPatientHistory([]); setMedicalRecords([]); setRecordForm(null) }

    function getDoctorName(id: string) { return doctors.find(d => d.id === id)?.name || '—' }

    function formatDate(dateStr: string) {
        const d = new Date(dateStr + 'T12:00:00')
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
        return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`
    }

    // ===== IMPORT =====
    function parseCSV(text: string) {
        const lines = text.trim().split('\n').filter(l => l.trim())
        if (lines.length < 2) { setImportPreview([]); return }
        let sep = ','
        if (lines[0].includes('\t')) sep = '\t'
        else if (lines[0].includes(';')) sep = ';'
        const headers = lines[0].split(sep).map(h => normalizar(h))
        const nameIdx = headers.findIndex(h => h.includes('nombre') || h.includes('name') || h.includes('paciente'))
        const phoneIdx = headers.findIndex(h => h.includes('tel') || h.includes('phone') || h.includes('celular'))
        const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail') || h.includes('correo'))
        if (nameIdx === -1 || phoneIdx === -1) { toast('No se encontraron columnas de nombre y teléfono'); setImportPreview([]); return }
        const parsed: { name: string; phone: string; email: string }[] = []
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
            const name = cols[nameIdx] || ''
            const phone = cols[phoneIdx] || ''
            const email = emailIdx !== -1 ? (cols[emailIdx] || '') : ''
            if (name && phone) parsed.push({ name, phone, email: email || '' })
        }
        setImportPreview(parsed)
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const text = ev.target?.result as string
            setImportText(text)
            parseCSV(text)
        }
        reader.readAsText(file)
    }

    async function doImport() {
        if (!importDoctor) { toast('Seleccioná un doctor'); return }
        if (importPreview.length === 0) { toast('No hay datos para importar'); return }
        setImporting(true)
        const { data: clinicData } = await supabase.from('profiles').select('clinic_id').single()
        if (!clinicData) { toast('Error de clínica'); setImporting(false); return }
        const rows = importPreview.map(p => ({
            clinic_id: clinicData.clinic_id, doctor_id: importDoctor,
            patient_name: p.name, patient_phone: p.phone, patient_email: p.email || null,
            date: '2020-01-01', time_start: '00:00', duration_min: 30,
            reason: 'Paciente importado', is_reactivated: false, status: 'completado',
        }))
        const { error } = await supabase.from('appointments').insert(rows)
        if (error) { toast('Error al importar'); setImporting(false); return }
        toast(`${importPreview.length} pacientes importados ✓`)
        setImportOpen(false); setImportText(''); setImportPreview([]); setImportDoctor('')
        setImporting(false); fetchData()
    }

    const filterButtons: { id: FilterType; label: string; count: number; color: string }[] = [
        { id: 'all', label: 'Todos', count: filterCounts.all, color: 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300' },
        { id: 'active', label: 'Activos', count: filterCounts.active, color: 'bg-green-100 dark:bg-green-400/10 text-green-700 dark:text-green-400' },
        { id: 'inactive', label: 'Inactivos', count: filterCounts.inactive, color: 'bg-amber-100 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400' },
        { id: 'lost', label: 'Perdidos', count: filterCounts.lost, color: 'bg-red-100 dark:bg-red-400/10 text-red-700 dark:text-red-400' },
    ]

    return (
        <div className="flex h-full">
            <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h1 className="text-lg font-semibold">Pacientes</h1>
                            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">{patients.length} paciente{patients.length !== 1 ? 's' : ''} en total</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-zinc-700 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-gray-700 dark:text-zinc-300">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                                Importar base
                            </button>
                            <div className="relative">
                                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                                <input type="text" placeholder="Buscar por nombre o teléfono..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-3 py-2 w-72 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-zinc-100" />
                            </div>
                        </div>
                    </div>

                    {/* Filtros */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {filterButtons.map(b => (
                            <button key={b.id} onClick={() => setFilter(b.id)} className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${filter === b.id ? b.color + ' ring-1 ring-current/20' : 'bg-gray-50 dark:bg-zinc-800/50 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}>
                                {b.label}
                                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold bg-white/60 dark:bg-black/20 px-1">{b.count}</span>
                            </button>
                        ))}
                        {filter !== 'all' && (
                            <button onClick={() => setFilter('all')} className="text-[10px] text-gray-400 dark:text-zinc-500 hover:underline ml-1">Limpiar</button>
                        )}
                    </div>
                    {filter !== 'all' && (
                        <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1.5">
                            {filter === 'active' && 'Pacientes con turno en los últimos 6 meses'}
                            {filter === 'inactive' && 'Sin turno entre 6 meses y 1 año — candidatos a reactivar'}
                            {filter === 'lost' && 'Sin turno hace más de 1 año — alto riesgo de pérdida'}
                        </p>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : sorted.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-zinc-500">
                        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
                        <p className="text-sm">{search ? 'No se encontraron pacientes' : 'No hay pacientes en esta categoría'}</p>
                    </div>
                ) : (
                    <div className="px-6 py-4">
                        <table className="w-full">
                            <thead>
                                <tr className="text-xs text-gray-500 dark:text-zinc-400 border-b border-gray-100 dark:border-zinc-800">
                                    <th className="text-left pb-3 font-medium cursor-pointer select-none hover:text-gray-900 dark:hover:text-zinc-100" onClick={() => toggleSort('name')}>Paciente<SortIcon col="name" /></th>
                                    <th className="text-left pb-3 font-medium">Teléfono</th>
                                    <th className="text-center pb-3 font-medium cursor-pointer select-none hover:text-gray-900 dark:hover:text-zinc-100" onClick={() => toggleSort('turnos')}>Turnos<SortIcon col="turnos" /></th>
                                    <th className="text-left pb-3 font-medium cursor-pointer select-none hover:text-gray-900 dark:hover:text-zinc-100" onClick={() => toggleSort('lastDate')}>Último turno<SortIcon col="lastDate" /></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((p, i) => {
                                    const sixMonthsAgo = monthsAgo(6)
                                    const oneYearAgo = monthsAgo(12)
                                    const isInactive = p.lastDate < sixMonthsAgo && p.lastDate >= oneYearAgo
                                    const isLost = p.lastDate < oneYearAgo
                                    return (
                                        <tr key={i} onClick={() => selectPatient(p)} className="border-b border-gray-50 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors">
                                            <td className="py-3 pr-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${isLost ? 'bg-red-100 dark:bg-red-400/10 text-red-600 dark:text-red-400' : isInactive ? 'bg-amber-100 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400'}`}>
                                                        {p.name.split(', ').pop()?.[0] || p.name[0]}
                                                    </div>
                                                    <span className="text-sm font-medium">{p.name}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <a href={whatsappLink(p.phone)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} className="text-sm text-green-600 dark:text-green-400 hover:underline flex items-center gap-1.5">
                                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-1.32-.06-2.054.532-.734.593-1.928.822-2.793.822-1.158 0-2.433-.593-3.823-1.576-1.307-.984-2.36-2.229-3.158-3.716-.798-1.487-1.147-2.966-1.045-4.436.103-1.471.631-2.906 1.493-4.193 1.858-2.578 4.773-4.564 8.197-5.435 3.423-.872 6.956-.732 10.472.264 3.516 1.867 5.965 4.778 7.558 2.911 1.586 6.283 2.186 9.48 1.581 3.197-.605 6.41-2.063 9.403-1.458 2.993-3.449 5.334-5.797 6.813-2.348 1.465-4.877 2.29-7.343 2.29-1.299 0-2.59-.108-3.862-.322-.655-.107-1.28-.234-1.876-.374-.604-.147-1.144-.29-1.617-.416-.473-.127-.862-.226-1.155-.296-.293-.07-.547-.12-.742-.155-.195-.035-.328-.053-.401-.053s-.206.018-.401.053c-.195.035-.449.085-.742.155-.293.07-.632.166-1.017.289-.385.123-.838.254-1.347.401-.509.147-1.076.314-1.693.502-.617.188-1.283.396-1.983.633-.7.237-1.428.475-2.15.722-.722.247-1.413.47-2.04.682-.627.212-1.198.382-1.696.518-.498.136-.895.218-1.171.256-.276.038-.454.057-.527.057s-.251-.019-.527-.057c-.276-.038-.673-.12-1.171-.256-.498-.136-1.069-.306-1.696-.518-.627-.212-1.32-.435-2.04-.682-.72-.247-1.45-.485-2.15-.722-.7-.237-1.384-.455-1.998-.663-.614-.208-1.178-.396-1.677-.566-.499-.17-.904-.294-1.2-.382-.296-.088-.476-.132-.535-.132s-.239.044-.535.132z" /></svg>
                                                    {p.phone}
                                                </a>
                                            </td>
                                            <td className="py-3 pr-4 text-sm text-gray-500 dark:text-zinc-400 text-center">
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 text-xs font-medium">{p.totalTurnos}</span>
                                            </td>
                                            <td className="py-3 text-sm text-gray-500 dark:text-zinc-400">
                                                <div className="flex items-center gap-2">
                                                    {formatDate(p.lastDate)}
                                                    {isLost && <span className="text-[9px] font-medium bg-red-100 text-red-600 dark:bg-red-400/10 dark:text-red-400 px-1.5 py-0.5 rounded">+1 año</span>}
                                                    {isInactive && <span className="text-[9px] font-medium bg-amber-100 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400 px-1.5 py-0.5 rounded">6-12m</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ===== PANEL DETALLE ===== */}
            {selectedPatient && (
                <aside className="fixed right-0 top-0 bottom-0 w-[420px] bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 z-30 flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.06)] dark:shadow-[-4px_0_24px_rgba(0,0,0,0.3)]" style={{ animation: 'slideIn 0.25s ease' }}>

                    {/* Header paciente */}
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-400/10 flex items-center justify-center text-blue-600 dark:text-blue-400 text-base font-semibold flex-shrink-0">
                                    {selectedPatient.name.split(', ').pop()?.[0] || selectedPatient.name[0]}
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold leading-tight">{selectedPatient.name}</h3>
                                    <a href={whatsappLink(selectedPatient.phone)} target="_blank" rel="noopener" className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1 mt-0.5">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.5 0C5.149 0 0 5.149 0 11.5c0 2.033.535 3.94 1.47 5.59L0 23l6.09-1.596A11.452 11.452 0 0011.5 23C17.851 23 23 17.851 23 11.5S17.851 0 11.5 0zm0 21.059a9.561 9.561 0 01-4.88-1.335l-.35-.208-3.617.948.965-3.525-.228-.362A9.542 9.542 0 011.94 11.5C1.94 6.218 6.218 1.94 11.5 1.94c5.282 0 9.56 4.278 9.56 9.56 0 5.283-4.278 9.559-9.56 9.559z"/></svg>
                                        {selectedPatient.phone}
                                    </a>
                                    {selectedPatient.email && <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">✉️ {selectedPatient.email}</p>}
                                </div>
                            </div>
                            <button onClick={closePanel} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 transition-colors flex-shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="flex gap-2">
                            <div className="flex-1 bg-gray-50 dark:bg-zinc-800 rounded-lg p-2.5 text-center">
                                <p className="text-base font-semibold">{selectedPatient.totalTurnos}</p>
                                <p className="text-[10px] text-gray-500 dark:text-zinc-400">Turnos</p>
                            </div>
                            <div className="flex-1 bg-gray-50 dark:bg-zinc-800 rounded-lg p-2.5 text-center">
                                <p className="text-base font-semibold">{patientHistory.filter(a => a.is_reactivated).length}</p>
                                <p className="text-[10px] text-gray-500 dark:text-zinc-400">Reactivados</p>
                            </div>
                            <div className="flex-1 bg-violet-50 dark:bg-violet-900/20 rounded-lg p-2.5 text-center">
                                <p className="text-base font-semibold text-violet-600 dark:text-violet-400">{medicalRecords.length}</p>
                                <p className="text-[10px] text-violet-500 dark:text-violet-400">Historias</p>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex mt-3 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700 text-xs">
                            <button
                                onClick={() => setPanelTab('turnos')}
                                className={`flex-1 py-1.5 transition-colors ${panelTab === 'turnos' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium' : 'bg-white dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700'}`}
                            >📅 Turnos</button>
                            <button
                                onClick={() => setPanelTab('historia')}
                                className={`flex-1 py-1.5 transition-colors ${panelTab === 'historia' ? 'bg-violet-600 text-white font-medium' : 'bg-white dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700'}`}
                            >🩺 Historia clínica</button>
                        </div>
                    </div>

                    {/* Contenido tabs */}
                    <div className="flex-1 overflow-y-auto">

                        {/* TAB: Turnos */}
                        {panelTab === 'turnos' && (
                            <div className="px-5 py-4">
                                <h4 className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-3">Todos los turnos</h4>
                                {patientHistory.length === 0 ? (
                                    <p className="text-sm text-gray-400 dark:text-zinc-500">Sin turnos registrados</p>
                                ) : (
                                    <div className="space-y-2">
                                        {patientHistory.map(a => (
                                            <div key={a.id} className="p-3 rounded-lg border border-gray-100 dark:border-zinc-800">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${a.status === 'completado' ? 'bg-green-500' : a.status === 'cancelado' ? 'bg-red-500' : 'bg-blue-500'}`} />
                                                        <span className="text-sm font-medium">{formatDate(a.date)}</span>
                                                        <span className="text-xs text-gray-400 dark:text-zinc-500">{a.time_start}</span>
                                                    </div>
                                                    {a.is_reactivated && <span className="text-[10px] font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400 px-1.5 py-0.5 rounded">Reactivado</span>}
                                                </div>
                                                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1.5">{getDoctorName(a.doctor_id)} · {a.reason || 'Sin motivo'}</p>
                                                <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">
                                                    {a.status === 'completado' ? '✅ Completado' : a.status === 'cancelado' ? '❌ Cancelado' : '⏳ Programado'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB: Historia clínica */}
                        {panelTab === 'historia' && (
                            <div className="px-5 py-4 space-y-4">

                                {/* Botón nueva entrada */}
                                {!recordForm && (
                                    <button
                                        onClick={openRecordForm}
                                        className="w-full py-2 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <span>+</span> Nueva entrada
                                    </button>
                                )}

                                {/* Formulario nueva entrada */}
                                {recordForm && (
                                    <div className="border border-violet-200 dark:border-violet-500/30 rounded-xl p-4 space-y-3 bg-violet-50/50 dark:bg-violet-900/10">
                                        <h4 className="text-xs font-semibold text-violet-700 dark:text-violet-400">Nueva entrada de historia clínica</h4>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-[10px] font-medium text-gray-500 dark:text-zinc-400 mb-1">Fecha</label>
                                                <input type="date" value={recordForm.date} onChange={e => setRecordForm(f => f ? { ...f, date: e.target.value } : f)}
                                                    className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-medium text-gray-500 dark:text-zinc-400 mb-1">Profesional</label>
                                                <select value={recordForm.doctor_id} onChange={e => setRecordForm(f => f ? { ...f, doctor_id: e.target.value } : f)}
                                                    className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300">
                                                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {[
                                            { field: 'reason', label: 'Motivo de consulta' },
                                            { field: 'diagnosis', label: 'Diagnóstico' },
                                            { field: 'treatment', label: 'Tratamiento' },
                                            { field: 'notes', label: 'Notas adicionales' },
                                        ].map(({ field, label }) => (
                                            <div key={field}>
                                                <label className="block text-[10px] font-medium text-gray-500 dark:text-zinc-400 mb-1">{label}</label>
                                                <textarea
                                                    rows={2}
                                                    value={recordForm[field as keyof RecordForm] as string}
                                                    onChange={e => setRecordForm(f => f ? { ...f, [field]: e.target.value } : f)}
                                                    className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 resize-none"
                                                    placeholder={label}
                                                />
                                            </div>
                                        ))}

                                        <div>
                                            <label className="block text-[10px] font-medium text-gray-500 dark:text-zinc-400 mb-1">Próximo turno sugerido</label>
                                            <input type="date" value={recordForm.next_appointment_suggested}
                                                onChange={e => setRecordForm(f => f ? { ...f, next_appointment_suggested: e.target.value } : f)}
                                                className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100" />
                                        </div>

                                        <div className="flex gap-2 pt-1">
                                            <button onClick={() => setRecordForm(null)} className="flex-1 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                                            <button onClick={saveRecord} disabled={savingRecord} className="flex-1 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors">
                                                {savingRecord ? 'Guardando...' : 'Guardar'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Lista de registros */}
                                {loadingRecords ? (
                                    <div className="flex justify-center py-6"><div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
                                ) : medicalRecords.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-2xl mb-2">🩺</p>
                                        <p className="text-xs text-gray-400 dark:text-zinc-500">Sin historia clínica registrada</p>
                                        <p className="text-[10px] text-gray-300 dark:text-zinc-600 mt-1">Agregá la primera entrada arriba</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {medicalRecords.map(r => (
                                            <div key={r.id} className="p-3.5 rounded-xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-800/50">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatDate(r.date)}</span>
                                                    <span className="text-[10px] text-gray-400 dark:text-zinc-500">{getDoctorName(r.doctor_id || '')}</span>
                                                </div>
                                                {r.reason && <div className="mb-1.5"><span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Motivo · </span><span className="text-xs text-gray-700 dark:text-gray-300">{r.reason}</span></div>}
                                                {r.diagnosis && <div className="mb-1.5"><span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Diagnóstico · </span><span className="text-xs text-gray-700 dark:text-gray-300">{r.diagnosis}</span></div>}
                                                {r.treatment && <div className="mb-1.5"><span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Tratamiento · </span><span className="text-xs text-gray-700 dark:text-gray-300">{r.treatment}</span></div>}
                                                {r.notes && <div className="mb-1.5"><span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Notas · </span><span className="text-xs text-gray-600 dark:text-zinc-400 italic">{r.notes}</span></div>}
                                                {r.next_appointment_suggested && (
                                                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-zinc-700 flex items-center gap-1.5">
                                                        <span className="text-[10px]">📅</span>
                                                        <span className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">Próximo turno sugerido: {formatDate(r.next_appointment_suggested)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </aside>
            )}

            {/* ===== MODAL IMPORTAR ===== */}
            {importOpen && (
                <>
                    <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setImportOpen(false)} />
                    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-xl shadow-2xl z-50 overflow-hidden border border-gray-200 dark:border-zinc-700">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
                            <h2 className="text-sm font-semibold">Importar base de pacientes</h2>
                            <button onClick={() => setImportOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">Pegá los datos desde Excel o un CSV</label>
                                <p className="text-[11px] text-gray-400 dark:text-zinc-500 mb-2">Formato: nombre, teléfono, email (email opcional). La primera fila debe ser el encabezado.</p>
                                <textarea value={importText} onChange={e => { setImportText(e.target.value); parseCSV(e.target.value) }} rows={5} placeholder="nombre,telefono,email
García María,11-1234-5678,maria@email.com
López Carlos,11-9876-5432," className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 dark:text-zinc-100 font-mono" />
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-zinc-700 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-gray-700 dark:text-zinc-300">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                                    Subir archivo CSV
                                </button>
                                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                            </div>
                            {importPreview.length > 0 && (
                                <div>
                                    <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">Vista previa ({importPreview.length} pacientes)</p>
                                    <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-zinc-700 rounded-lg">
                                        <table className="w-full text-xs">
                                            <thead className="bg-gray-50 dark:bg-zinc-800 sticky top-0">
                                                <tr><th className="text-left px-3 py-2 font-medium">Nombre</th><th className="text-left px-3 py-2 font-medium">Teléfono</th><th className="text-left px-3 py-2 font-medium">Email</th></tr>
                                            </thead>
                                            <tbody>
                                                {importPreview.slice(0, 20).map((p, i) => (
                                                    <tr key={i} className="border-t border-gray-100 dark:border-zinc-800">
                                                        <td className="px-3 py-1.5">{p.name}</td>
                                                        <td className="px-3 py-1.5">{p.phone}</td>
                                                        <td className="px-3 py-1.5 text-gray-400">{p.email || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {importPreview.length > 20 && <p className="text-[10px] text-gray-400 text-center py-1">...y {importPreview.length - 20} más</p>}
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">Asignar a doctor <span className="text-red-400">*</span></label>
                                <select value={importDoctor} onChange={e => setImportDoctor(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-zinc-200">
                                    <option value="">Seleccionar doctor...</option>
                                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name} — {d.specialty}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-3">
                            <button onClick={() => setImportOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancelar</button>
                            <button onClick={doImport} disabled={importing || !importDoctor || importPreview.length === 0} className="px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                                {importing ? 'Importando...' : `Importar ${importPreview.length} pacientes`}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}