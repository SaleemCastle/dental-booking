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
    const { firstName, lastName } = info
    const fullName = `${firstName} ${lastName}`.trim()
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`
    const address = [info.streetAddress, info.town, info.city]
        .filter(Boolean)
        .join(', ')
    const archived = isArchivedPatient(info)

    return (
        <tr
            className={`border-b border-clinic-line transition-colors hover:bg-clinic-canvas/70 ${
                isSelected ? 'bg-clinic-sky/60' : 'bg-white'
            } ${archived ? 'opacity-75' : ''}`}>
            <td className="px-4 py-3">
                <button
                    type="button"
                    aria-label={`View patient ${fullName}`}
                    aria-pressed={isSelected}
                    className="flex min-w-[210px] items-center gap-3 text-left"
                    onClick={() => onSelect?.(info)}>
                    <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                            archived ? 'bg-clinic-muted' : 'bg-clinic-teal'
                        }`}>
                        {initials}
                    </span>
                    <span className="truncate text-sm font-semibold text-clinic-ink">
                        {fullName}
                    </span>
                </button>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-clinic-muted">
                {info.sex || 'Not captured'}
            </td>
            <td className="max-w-[240px] px-4 py-3 text-sm text-clinic-ink">
                <span className="block truncate" title={address || undefined}>
                    {address || 'Not captured'}
                </span>
            </td>
            <td className="max-w-[200px] px-4 py-3 text-sm text-clinic-ink">
                <span
                    className="block truncate"
                    title={info.appointments || undefined}>
                    {info.appointments || 'None scheduled'}
                </span>
            </td>
            <td className="whitespace-nowrap px-4 py-3">
                <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        archived
                            ? 'bg-clinic-rose text-rose-700'
                            : 'bg-clinic-mint text-emerald-700'
                    }`}>
                    {archived ? 'Archived' : 'Active'}
                </span>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-clinic-muted">
                {formatDate(info.created_at)}
            </td>
        </tr>
    )
}

export default PatientRowDetails
