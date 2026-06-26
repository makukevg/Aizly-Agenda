export interface Clinic {
    id: string
    name: string
    created_at: string
}
export interface Profile {
    id: string
    clinic_id: string
    full_name: string
    role: 'admin' | 'receptionist' | 'doctor'
    doctor_id: string | null
    created_at: string
}
export interface Doctor {
    id: string
    clinic_id: string
    name: string
    specialty: string
    active: boolean
    created_at: string
}
export interface Appointment {
    id: string
    clinic_id: string
    doctor_id: string
    patient_name: string
    patient_phone: string
    patient_email: string | null
    date: string
    time_start: string
    duration_min: number
    reason: string | null
    notes: string | null
    is_reactivated: boolean
    status: 'scheduled' | 'completado' | 'ausente' | 'cancelado'
    created_at: string
}