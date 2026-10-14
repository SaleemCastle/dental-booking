interface IInfoSectionProps {
    currentTab: string
    patientSearch?: string
    onPatientSearchChange?: (value: string) => void
    onPatientSearchClear?: () => void
}

interface Patient {
    id: number
    firstName: string
    lastName: string
    appointments: string
    streetAddress: string
    town: string
    city: string
    sex: string
    notes: string
    created_at: string
    updated_at: string
    archived?: boolean
    isArchived?: boolean
    is_archived?: boolean
    archived_at?: string | null
    archivedAt?: string | null
    archived_by_user_id?: number | null
    deleted_at?: string | null
    emergency_contact_name?: string | null
    emergency_contact_phone?: string | null
    emergency_contact_relationship?: string | null
    allergies?: string[]
    medications?: string[]
    medical_alerts?: string[]
}

type AuthValidationErrors = Partial<
    Record<'name' | 'email' | 'password' | 'password_confirmation', string[]>
>
