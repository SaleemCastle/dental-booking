interface IInfoSectionProps {
    currentTab: string
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
}

type AuthValidationErrors = Partial<
    Record<'name' | 'email' | 'password' | 'password_confirmation', string[]>
>
