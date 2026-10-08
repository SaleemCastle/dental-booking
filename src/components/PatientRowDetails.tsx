import React from 'react'
import { formatDate } from '../utils'

interface IPatientRowDetails {
    info: Patient
}
const PatientRowDetails = ({ info }: IPatientRowDetails) => {
    const { firstName, lastName, city, created_at } = info
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`
    return (
        <div className="py-3 w-full bg-white rounded-md border border-clinic-line flex flex-row items-center pl-4 gap-2 mb-3 hover:shadow-row transition-all cursor-pointer">
            <div className="h-4 w-4 border border-clinic-line rounded bg-white mr-3" />

            <div className="flex flex-row" style={{ flex: 2 }}>
                <span className="h-10 w-10 rounded-full bg-clinic-teal flex items-center justify-center">
                    <h3 className="text-white font-medium">{initials}</h3>
                </span>
                <div className="flex flex-col ml-2">
                    <h3 className="font-semibold text-clinic-ink">{`${firstName} ${lastName}`}</h3>
                    <h3 className="text-xs text-clinic-muted">
                        patient@purepearl.test
                    </h3>
                </div>
            </div>

            <h3 className="flex-[1.5] font-semibold text-sm text-clinic-ink">
                {'(876)-287-3021'}
            </h3>

            <h3 className="flex-[1.5] font-semibold text-sm text-clinic-ink">
                {city}
            </h3>
            <h3 className="flex-[1.5] font-semibold text-sm">
                <span className="rounded bg-clinic-amber px-2 py-1 text-xs text-amber-700">
                    Checkup
                </span>
            </h3>
            <h3 className="flex-[1.5] font-semibold text-sm">
                <span className="rounded bg-clinic-mint px-2 py-1 text-xs text-emerald-700">
                    Completed
                </span>
            </h3>
            <h3 className="flex-[1.5] font-semibold text-sm text-clinic-muted">
                {formatDate(created_at)}
            </h3>
        </div>
    )
}

export default PatientRowDetails
