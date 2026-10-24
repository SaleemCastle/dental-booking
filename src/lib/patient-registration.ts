import { PatientPayload } from '../services/patients'
import { ApiFieldErrors } from './api'
import { WizardStepDefinition } from './wizard'

export type PatientRegistrationValues = Record<keyof PatientPayload, string>

export const initialPatientRegistrationValues: PatientRegistrationValues = {
    firstName: '',
    lastName: '',
    sex: '',
    streetAddress: '',
    town: '',
    city: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    allergies: '',
    medications: '',
    medical_alerts: '',
    appointments: '',
    notes: '',
}

export const patientRegistrationSteps: WizardStepDefinition[] = [
    { id: 'identity', fields: ['firstName', 'lastName', 'sex'] },
    { id: 'address', fields: ['streetAddress', 'town', 'city'] },
    {
        id: 'emergency',
        fields: [
            'emergency_contact_name',
            'emergency_contact_phone',
            'emergency_contact_relationship',
        ],
    },
    { id: 'medical', fields: ['allergies', 'medications', 'medical_alerts'] },
    { id: 'context', fields: ['appointments', 'notes'] },
]

export const requiredPatientFields = [
    'firstName',
    'lastName',
    'sex',
    'streetAddress',
    'town',
    'city',
    'appointments',
    'notes',
]

export const patientFieldMaxLengths: Partial<
    Record<keyof PatientRegistrationValues, number>
> = {
    firstName: 100,
    lastName: 100,
    sex: 255,
    streetAddress: 255,
    town: 255,
    city: 255,
    appointments: 255,
    emergency_contact_name: 255,
    emergency_contact_phone: 50,
    emergency_contact_relationship: 100,
}

const medicalListFields = [
    'allergies',
    'medications',
    'medical_alerts',
] as const

const inputToList = (value: string) =>
    value
        .split(/[\n,]/)
        .map(item => item.trim())
        .filter(Boolean)

export const buildPatientRegistrationPayload = (
    values: PatientRegistrationValues,
): PatientPayload => ({
    ...values,
    emergency_contact_name: values.emergency_contact_name.trim() || null,
    emergency_contact_phone: values.emergency_contact_phone.trim() || null,
    emergency_contact_relationship:
        values.emergency_contact_relationship.trim() || null,
    allergies: inputToList(values.allergies),
    medications: inputToList(values.medications),
    medical_alerts: inputToList(values.medical_alerts),
})

export const validatePatientRegistrationStep = (
    values: PatientRegistrationValues,
    stepIndex: number,
): ApiFieldErrors => {
    const errors: ApiFieldErrors = {}

    patientRegistrationSteps[stepIndex].fields.forEach(field => {
        const value = values[field].trim()
        const maxLength = patientFieldMaxLengths[field]

        if (requiredPatientFields.includes(field) && !value) {
            errors[field] = ['This field is required.']
        } else if (maxLength && value.length > maxLength) {
            errors[field] = [`Use ${maxLength} characters or fewer.`]
        }
    })

    medicalListFields.forEach(field => {
        if (
            patientRegistrationSteps[stepIndex].fields.includes(field) &&
            inputToList(values[field]).some(item => item.length > 255)
        ) {
            errors[field] = ['Each entry must be 255 characters or fewer.']
        }
    })

    return errors
}

// Laravel identifies invalid array entries as e.g. "allergies.0".
export const normalizePatientRegistrationErrors = (errors: ApiFieldErrors) =>
    Object.entries(errors).reduce<ApiFieldErrors>(
        (normalized, [key, messages]) => {
            const field = key.split('.')[0]
            normalized[field] = [...(normalized[field] ?? []), ...messages]
            return normalized
        },
        {},
    )
