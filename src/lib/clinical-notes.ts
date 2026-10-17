import type { ApiFieldErrors } from './api-contract'
import type {
    ClinicalNote,
    ClinicalNotePayload,
} from '../services/clinical-notes'

export interface ClinicalNoteValues {
    dentist_id: string
    appointment_id: string
    note_text: string
}
export const clinicalNoteValues = (
    note?: ClinicalNote,
): ClinicalNoteValues => ({
    dentist_id: note ? String(note.dentist_id) : '',
    appointment_id:
        note?.appointment_id == null ? '' : String(note.appointment_id),
    note_text: note?.note_text ?? '',
})
export const validateClinicalNote = (values: ClinicalNoteValues) => {
    const errors: ApiFieldErrors = {}
    if (!/^[1-9]\d*$/.test(values.dentist_id))
        errors.dentist_id = ['Select a provider.']
    if (values.appointment_id && !/^[1-9]\d*$/.test(values.appointment_id))
        errors.appointment_id = [
            'Select an appointment or leave the note unlinked.',
        ]
    if (!values.note_text.trim()) errors.note_text = ['Enter a clinical note.']
    else if (Array.from(values.note_text).length > 16000)
        errors.note_text = [
            'Clinical notes must be 16,000 characters or fewer.',
        ]
    return errors
}
export const clinicalNotePayload = (
    patientId: number,
    values: ClinicalNoteValues,
    note?: ClinicalNote,
): Partial<ClinicalNotePayload> => {
    const payload: ClinicalNotePayload = {
        patient_id: patientId,
        dentist_id: Number(values.dentist_id),
        appointment_id: values.appointment_id
            ? Number(values.appointment_id)
            : null,
        note_text: values.note_text,
    }
    if (!note) return payload
    return Object.fromEntries(
        Object.entries(payload).filter(([key, value]) => note[key] !== value),
    )
}
export const formatNoteDate = (value: string | null) => {
    if (!value || Number.isNaN(Date.parse(value))) return 'Date unknown'
    return (
        new Date(value).toLocaleString('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }) + ' UTC'
    )
}
