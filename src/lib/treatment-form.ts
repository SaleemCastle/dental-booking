import { ApiFieldErrors } from './api-contract'
import type { Treatment, TreatmentPayload } from '../services/treatments'

export interface TreatmentFormValues {
    name: string
    description: string
    category: string
    duration_minutes: string
    price: string
    active: boolean
}

export const getTreatmentFormValues = (
    treatment?: Treatment | null,
): TreatmentFormValues => ({
    name: treatment?.name ?? '',
    description: treatment?.description ?? '',
    category: treatment?.category ?? '',
    duration_minutes: treatment ? String(treatment.duration_minutes) : '',
    price: treatment?.price ?? '',
    active: treatment?.active ?? true,
})

export const validateTreatmentForm = (
    values: TreatmentFormValues,
): ApiFieldErrors => {
    const errors: ApiFieldErrors = {}
    const name = values.name.trim()
    const category = values.category.trim()

    if (!name || name.length > 255) {
        errors.name = ['Enter a treatment name of up to 255 characters.']
    }
    if (!category || category.length > 100) {
        errors.category = ['Enter a category of up to 100 characters.']
    }

    const duration = Number(values.duration_minutes)
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
        errors.duration_minutes = [
            'Enter a whole number from 1 to 1440 minutes.',
        ]
    }

    const price = values.price.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) > 99999999.99) {
        errors.price = [
            'Enter a price from 0 to 99999999.99 with up to two decimal places.',
        ]
    }

    return errors
}

export const toTreatmentPayload = (
    values: TreatmentFormValues,
): TreatmentPayload => ({
    name: values.name.trim(),
    description: values.description.trim() || null,
    category: values.category.trim(),
    duration_minutes: Number(values.duration_minutes),
    price: values.price.trim(),
    active: values.active,
})
