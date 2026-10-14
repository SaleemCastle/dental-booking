import React from 'react'
import { formatDate } from '../utils'

interface IPatientRowDetails {
    info: Patient
    isSelected?: boolean
    onSelect?: (patient: Patient) => void
}

export const isArchivedPatient = (patient: Patient) =>
    patient.archived === true ||
    patient.isArchived === true ||
    patient.is_archived === true ||
    Boolean(patient.archived_at || patient.archivedAt || patient.deleted_at)

const PatientRowDetails = ({
    info,
    isSelected = false,
    onSelect,
}: IPatientRowDetails) => {
    const { firstName, lastName, city, created_at } = info
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`
    const archived = isArchivedPatient(info)

    return (
        <button
            type="button"
            className={`py-3 w-full rounded-md border flex flex-row items-center pl-4 gap-2 mb-3 text-left hover:shadow-row transition-all ${
                isSelected
                    ? 'border-clinic-blue bg-clinic-sky'
                    : 'border-clinic-line bg-white'
            } ${archived ? 'opacity-75' : ''}`}
            onClick={() => onSelect?.(info)}>
            <div className="h-4 w-4 border border-clinic-line rounded bg-white mr-3" />

            <div className="flex flex-row" style={{ flex: 2 }}>
                <span
                    className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        archived ? 'bg-clinic-muted' : 'bg-clinic-teal'
                    }`}>
                    <h3 className="text-white font-medium">{initials}</h3>
                </span>
                <div className="flex flex-col ml-2">
                    <h3 className="font-semibold text-clinic-ink">{`${firstName} ${lastName}`}</h3>
                    <h3 className="text-xs text-clinic-muted">
                        {archived
                            ? 'Archived patient record'
                            : 'Active patient record'}
                    </h3>
                </div>
            </div>

            <h3 className="flex-[1.5] font-semibold text-sm text-clinic-ink">
                {'Not captured'}
            </h3>

            <h3 className="flex-[1.5] font-semibold text-sm text-clinic-ink">
                {city}
            </h3>
            <h3 className="flex-[1.5] font-semibold text-sm">
                <span className="rounded bg-clinic-sky px-2 py-1 text-xs text-clinic-blue">
                    {info.appointments || 'None scheduled'}
                </span>
            </h3>
            <h3 className="flex-[1.5] font-semibold text-sm">
                <span
                    className={`rounded px-2 py-1 text-xs ${
                        archived
                            ? 'bg-clinic-rose text-rose-700'
                            : 'bg-clinic-mint text-emerald-700'
                    }`}>
                    {archived ? 'Archived' : 'Active'}
                </span>
            </h3>
            <h3 className="flex-[1.5] font-semibold text-sm text-clinic-muted">
                {formatDate(created_at)}
            </h3>
        </button>
    )
}

export default PatientRowDetails
