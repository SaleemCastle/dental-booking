import React from 'react'
import { useSelector } from 'react-redux'
import { patientDataHeadings } from '../Constants'
import PatientRowDetails from './PatientRowDetails'
import { AppState } from '../store/store'

const PatientList = () => {
    const patients = useSelector(
        (state: AppState) => state.patients.patients.patients,
    )
    return (
        <section className="px-8 py-5">
            <div className="flex flex-row w-full items-center pl-4 gap-2 pb-3">
                <div className="h-4 w-4 border border-clinic-line rounded bg-white mr-3" />
                {patientDataHeadings.map((heading, index) => (
                    <h3
                        className={`flex-[1.5] ${
                            index === 0 ? 'flex-grow-[2]' : ''
                        } text-xs font-bold uppercase text-clinic-muted`}
                        key={index}>
                        {heading}
                    </h3>
                ))}
            </div>
            {patients.length > 0 ? (
                patients.map((patient: Patient) => (
                    <PatientRowDetails key={patient.id} info={patient} />
                ))
            ) : (
                <div className="rounded-md border border-dashed border-clinic-line bg-white p-10 text-center shadow-sm">
                    <h3 className="text-base font-bold text-clinic-ink">
                        No patients loaded
                    </h3>
                    <p className="mt-2 text-sm text-clinic-muted">
                        Connect the Laravel `/api/patients` response to populate
                        this table.
                    </p>
                </div>
            )}
        </section>
    )
}

export default PatientList
