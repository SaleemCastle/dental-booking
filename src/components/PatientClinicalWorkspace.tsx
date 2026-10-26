import React, { useRef, useState } from 'react'
import type { TreatmentToothContext } from '../services/treatment-plans'
import PatientDentalChart from './PatientDentalChart'
import PatientTreatmentPlans from './PatientTreatmentPlans'
import PatientClinicalNotes from './PatientClinicalNotes'

const PatientClinicalWorkspace = ({ patient }: { patient: Patient }) => {
    const [context, setContext] = useState<TreatmentToothContext | null>(null)
    const [focusContext, setFocusContext] = useState<{
        context: TreatmentToothContext
        requestId: number
    } | null>(null)
    const chart = useRef<HTMLDivElement>(null)
    const planning = useRef<HTMLDivElement>(null)
    return (
        <div className="space-y-5">
            <div
                ref={chart}
                className="min-w-0 rounded-lg border border-clinic-line bg-white p-5 shadow-sm sm:p-6">
                <PatientDentalChart
                    patient={patient}
                    focusContext={focusContext}
                    onPlanTooth={next => {
                        setContext(next)
                        planning.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                        })
                    }}
                />
            </div>
            <div ref={planning} className="min-w-0">
                <PatientTreatmentPlans
                    patient={patient}
                    context={context}
                    onViewTooth={context => {
                        setContext(context)
                        setFocusContext(previous => ({
                            context,
                            requestId: (previous?.requestId ?? 0) + 1,
                        }))
                        chart.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                        })
                    }}
                />
            </div>
            <div className="min-w-0">
                <PatientClinicalNotes patient={patient} />
            </div>
        </div>
    )
}
export default PatientClinicalWorkspace
