import React, { useEffect, useMemo, useState } from 'react'
import { FiCheck, FiClock, FiRefreshCw } from 'react-icons/fi'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError } from '../lib/api'
import {
    getDentalChartPermissions,
    getTreatmentPlanPermissions,
} from '../lib/permissions'
import type { TreatmentToothContext } from '../services/treatment-plans'
import { planningContextLabel } from '../lib/treatment-plans'
import { describeDentalTooth, toothLabel } from '../lib/dental-charts'
import { formatNoteDate } from '../lib/clinical-notes'
import {
    DentalChart,
    DentalChartMetadata,
    Dentition,
    ToothNumbering,
    DentalTooth,
    getDentalChart,
    getDentalChartMetadata,
} from '../services/dental-charts'
import { isArchivedPatient } from './PatientRowDetails'
import DentalOdontogram from './DentalOdontogram'
import DentalChartEditor from './DentalChartEditor'
import DentalChartHistory, {
    DentalChartAttribution,
} from './DentalChartHistory'
import {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'

const DentalFindingTimeline = ({
    chart,
    metadata,
    teeth,
    numbering,
    selectedTooth,
}: {
    chart: DentalChart
    metadata: DentalChartMetadata
    teeth: DentalTooth[]
    numbering: ToothNumbering
    selectedTooth: string
}) => {
    const findings = useMemo(
        () =>
            teeth.flatMap(tooth =>
                tooth.findings.map(finding => ({
                    tooth,
                    finding,
                })),
            ),
        [teeth],
    )
    const visibleFindings = selectedTooth
        ? findings.filter(item => item.tooth.tooth === selectedTooth)
        : findings
    const selectedPosition = metadata.dentitions[chart.dentition].find(
        position => position.fdi === selectedTooth,
    )

    return (
        <section
            aria-label="Dental treatment timeline"
            className="min-h-full bg-slate-50/80 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-extrabold text-clinic-ink">
                        Treatment timeline
                    </h3>
                    <p className="mt-1 text-xs text-clinic-muted">
                        {selectedTooth
                            ? `Findings for tooth ${
                                  selectedPosition
                                      ? toothLabel(selectedPosition, numbering)
                                      : selectedTooth
                              }`
                            : 'Recorded findings in this chart'}
                    </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-clinic-muted shadow-sm">
                    {visibleFindings.length}{' '}
                    {visibleFindings.length === 1 ? 'finding' : 'findings'}
                </span>
            </div>
            <div className="mt-5 rounded-md border border-clinic-line bg-white px-4 py-3">
                <DentalChartAttribution chart={chart} />
            </div>

            {visibleFindings.length ? (
                <ol className="relative mt-5 space-y-3 before:absolute before:bottom-5 before:left-[9px] before:top-5 before:w-px before:bg-slate-200">
                    {visibleFindings.map(({ tooth, finding }, index) => (
                        <li
                            key={`${tooth.tooth}-${
                                finding.code
                            }-${finding.surfaces.join('-')}-${index}`}
                            className="relative pl-8">
                            <span
                                aria-hidden="true"
                                className={`absolute left-0 top-5 z-10 flex h-[19px] w-[19px] items-center justify-center rounded-full border-2 border-slate-50 text-white shadow-sm ${
                                    finding.status === 'resolved'
                                        ? 'bg-emerald-500'
                                        : 'bg-amber-400'
                                }`}>
                                {finding.status === 'resolved' ? (
                                    <FiCheck className="h-3 w-3" />
                                ) : (
                                    <FiClock className="h-3 w-3" />
                                )}
                            </span>
                            <article className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <span className="mt-0.5 rounded border border-clinic-blue/20 bg-clinic-sky px-2 py-1 text-[10px] font-bold text-clinic-blue">
                                            Tooth{' '}
                                            {toothLabel(
                                                metadata.dentitions[
                                                    chart.dentition
                                                ].find(
                                                    position =>
                                                        position.fdi ===
                                                        tooth.tooth,
                                                ) ?? {
                                                    tooth: tooth.tooth,
                                                    fdi: tooth.tooth,
                                                    surfaces: [],
                                                },
                                                numbering,
                                            )}
                                        </span>
                                        <div>
                                            <h4 className="text-sm font-bold capitalize text-clinic-ink">
                                                {finding.code.replace(
                                                    /_/g,
                                                    ' ',
                                                )}
                                            </h4>
                                            <p className="mt-1 text-xs text-clinic-muted">
                                                {finding.surfaces.length
                                                    ? `Surfaces: ${finding.surfaces.join(
                                                          ', ',
                                                      )}`
                                                    : 'Whole tooth'}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                            finding.status === 'resolved'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-amber-50 text-amber-700'
                                        }`}>
                                        {finding.status === 'resolved'
                                            ? 'Resolved'
                                            : 'Active'}
                                    </span>
                                </div>
                                <div className="mt-4 grid gap-3 border-t border-clinic-line pt-3 sm:grid-cols-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">
                                            Recorded
                                        </p>
                                        <p className="mt-1 text-xs font-semibold text-clinic-ink">
                                            {formatNoteDate(chart.recorded_at)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">
                                            Linked treatment
                                        </p>
                                        <p className="mt-1 text-xs font-semibold text-clinic-ink">
                                            {finding.treatment_id
                                                ? `Treatment #${finding.treatment_id}`
                                                : 'Not linked'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">
                                            Provider
                                        </p>
                                        <p className="mt-1 text-xs font-semibold text-clinic-ink">
                                            {chart.dentist_id
                                                ? `Provider #${chart.dentist_id}`
                                                : 'Not recorded'}
                                        </p>
                                    </div>
                                </div>
                                {finding.note && (
                                    <p className="mt-3 rounded-md border-l-2 border-clinic-blue bg-slate-50 px-3 py-2 text-xs leading-5 text-clinic-muted">
                                        {finding.note}
                                    </p>
                                )}
                            </article>
                        </li>
                    ))}
                </ol>
            ) : (
                <div className="mt-5 rounded-lg border border-dashed border-clinic-line bg-white px-5 py-12 text-center">
                    <p className="text-sm font-semibold text-clinic-ink">
                        {selectedTooth
                            ? 'No findings recorded for this tooth'
                            : 'No dental findings recorded'}
                    </p>
                    <p className="mt-1 text-xs text-clinic-muted">
                        Recorded conditions and linked treatments will appear
                        here.
                    </p>
                </div>
            )}
        </section>
    )
}

const PatientDentalChart = ({
    patient,
    onPlanTooth,
    focusContext,
}: {
    patient: Patient
    onPlanTooth?: (context: TreatmentToothContext) => void
    focusContext?: { context: TreatmentToothContext; requestId: number } | null
}) => {
    const { user, status } = useAuthSession()
    const access = getDentalChartPermissions(
        status === 'authenticated' ? user : null,
    )
    const planningAccess = getTreatmentPlanPermissions(
        status === 'authenticated' ? user : null,
    )
    const [dentition, setDentition] = useState<Dentition>('adult')
    const [numbering, setNumbering] = useState<ToothNumbering>('universal')
    const [selected, setSelected] = useState('')
    const [editing, setEditing] = useState<DentalChart | null>(null)
    const [showHistory, setShowHistory] = useState(false)
    const [notice, setNotice] = useState('')
    useEffect(() => {
        if (focusContext) {
            setDentition(focusContext.context.dentition)
            setSelected(focusContext.context.tooth)
        }
    }, [focusContext])
    const metadata = useSWR(
        access.canView ? ['dental-chart-metadata', user] : null,
        () => getDentalChartMetadata(),
        { shouldRetryOnError: false },
    )
    // Always request canonical IDs. Display numbering is a local metadata lookup.
    const chart = useSWR<DentalChart, ApiError>(
        access.canView ? ['dental-chart', user, patient.id, dentition] : null,
        () =>
            getDentalChart(patient.id, { dentition, numbering_system: 'fdi' }),
        { shouldRetryOnError: false, revalidateOnFocus: false },
    )
    const archived = isArchivedPatient(patient)
    const failed = chart.error || metadata.error
    const visible = access.canView && !failed && chart.data && metadata.data
    const position = metadata.data?.dentitions[dentition].find(
        item => item.fdi === selected,
    )
    const tooth = chart.data?.teeth.find(item => item.tooth === selected)
    return (
        <section aria-label="Patient dental chart" className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-clinic-ink">
                        Service
                    </span>
                    <div
                        role="group"
                        aria-label="Dental chart service"
                        className="inline-flex rounded-lg bg-slate-100 p-1">
                        <button
                            type="button"
                            aria-pressed="true"
                            className="rounded-md bg-white px-5 py-2 text-xs font-bold text-clinic-ink shadow-sm">
                            Medical
                        </button>
                        <button
                            type="button"
                            disabled
                            title="Cosmetic charting is not available yet"
                            className="cursor-not-allowed rounded-md px-5 py-2 text-xs font-semibold text-slate-400">
                            Cosmetic
                        </button>
                    </div>
                </div>
                {access.canView && (
                    <button
                        type="button"
                        aria-label="Refresh dental chart"
                        className={`${buttonClass} inline-flex items-center gap-2`}
                        disabled={chart.isValidating || metadata.isValidating}
                        onClick={() => {
                            setNotice('')
                            void chart.mutate()
                            void metadata.mutate()
                        }}>
                        <FiRefreshCw
                            aria-hidden="true"
                            className={
                                chart.isValidating || metadata.isValidating
                                    ? 'animate-spin'
                                    : ''
                            }
                        />
                        Refresh
                    </button>
                )}
            </div>
            {!access.canView ? (
                <p
                    role="status"
                    className="rounded-lg border border-clinic-line bg-white p-6 text-sm text-clinic-muted">
                    You do not have permission to view dental charts.
                </p>
            ) : (
                <>
                    {(!chart.data || !metadata.data) && !failed && (
                        <div
                            role="status"
                            className="grid gap-4 rounded-xl border border-clinic-line bg-white p-5 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
                            <div className="h-[360px] animate-pulse rounded-lg bg-clinic-canvas motion-reduce:animate-none" />
                            <div className="space-y-4">
                                <div className="h-8 w-48 animate-pulse rounded bg-clinic-canvas motion-reduce:animate-none" />
                                <div className="h-28 animate-pulse rounded-lg bg-clinic-canvas motion-reduce:animate-none" />
                                <div className="h-28 animate-pulse rounded-lg bg-clinic-canvas motion-reduce:animate-none" />
                            </div>
                        </div>
                    )}
                    {failed && (
                        <div
                            role="alert"
                            className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
                            <p className="font-semibold">
                                {[403, 404].includes(
                                    (failed as ApiError).statusCode,
                                )
                                    ? 'This dental chart is unavailable for the current patient or clinic access.'
                                    : 'The dental chart could not be loaded.'}
                            </p>
                            <button
                                type="button"
                                className={`${buttonClass} mt-3`}
                                onClick={() => {
                                    void chart.mutate()
                                    void metadata.mutate()
                                }}>
                                Retry dental chart
                            </button>
                        </div>
                    )}
                    {notice && (
                        <p
                            role="status"
                            className="rounded-md bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                            {notice}
                        </p>
                    )}
                    {visible && (
                        <>
                            <div className="grid overflow-hidden rounded-xl border border-clinic-line bg-white shadow-sm lg:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.22fr)]">
                                <section
                                    aria-label="Odontogram"
                                    className="min-w-0 p-4 sm:p-6">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-base font-extrabold text-clinic-ink">
                                                Odontogram
                                            </h3>
                                            <p className="mt-1 text-xs text-clinic-muted">
                                                {dentition === 'adult'
                                                    ? 'Adult dentition'
                                                    : 'Primary dentition'}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <label
                                                className="sr-only"
                                                htmlFor="chart-dentition">
                                                Dentition
                                            </label>
                                            <select
                                                id="chart-dentition"
                                                aria-label="Chart dentition"
                                                className={`${inputClass} mt-0 min-h-0 py-1.5 text-xs`}
                                                value={dentition}
                                                onChange={event => {
                                                    setDentition(
                                                        event.target
                                                            .value as Dentition,
                                                    )
                                                    setSelected('')
                                                    setNotice('')
                                                    setShowHistory(false)
                                                }}>
                                                <option value="adult">
                                                    Adult
                                                </option>
                                                <option value="primary">
                                                    Primary
                                                </option>
                                            </select>
                                            <label
                                                className="sr-only"
                                                htmlFor="chart-numbering">
                                                Tooth numbering
                                            </label>
                                            <select
                                                id="chart-numbering"
                                                aria-label="Tooth numbering"
                                                className={`${inputClass} mt-0 min-h-0 py-1.5 text-xs`}
                                                value={numbering}
                                                onChange={event =>
                                                    setNumbering(
                                                        event.target
                                                            .value as ToothNumbering,
                                                    )
                                                }>
                                                <option value="universal">
                                                    Universal
                                                </option>
                                                <option value="fdi">FDI</option>
                                            </select>
                                        </div>
                                    </div>
                                    {!chart.data.teeth.length && (
                                        <p className="mt-4 rounded-md bg-clinic-canvas px-3 py-2 text-xs leading-5 text-clinic-muted">
                                            {chart.data.version === 0
                                                ? 'No chart recorded for this dentition.'
                                                : 'This observation contains no charted teeth.'}{' '}
                                            Uncharted teeth have no recorded
                                            health or presence assessment.
                                        </p>
                                    )}
                                    <div className="mt-4">
                                        <DentalOdontogram
                                            metadata={metadata.data}
                                            dentition={dentition}
                                            numbering={numbering}
                                            teeth={chart.data.teeth}
                                            selected={selected}
                                            onSelect={setSelected}
                                        />
                                    </div>
                                    {position && (
                                        <div
                                            aria-label={`Tooth ${toothLabel(
                                                position,
                                                numbering,
                                            )} details`}
                                            className="mt-4 rounded-lg border border-clinic-line bg-slate-50 px-4 py-3">
                                            <h4 className="text-xs font-bold text-clinic-ink">
                                                Tooth{' '}
                                                {toothLabel(
                                                    position,
                                                    numbering,
                                                )}
                                            </h4>
                                            <p className="mt-1 break-words text-xs leading-5 text-clinic-muted">
                                                {describeDentalTooth(tooth)}
                                            </p>
                                        </div>
                                    )}
                                    {position &&
                                        focusContext?.context.dentition ===
                                            dentition &&
                                        focusContext.context.tooth ===
                                            selected && (
                                            <p
                                                role="status"
                                                className="mt-3 rounded border border-clinic-line bg-clinic-sky p-3 text-sm">
                                                Planning context:{' '}
                                                {planningContextLabel(
                                                    focusContext.context,
                                                    metadata.data,
                                                )}
                                            </p>
                                        )}
                                    {position &&
                                        onPlanTooth &&
                                        planningAccess.canWrite &&
                                        !archived && (
                                            <button
                                                type="button"
                                                className={`${buttonClass} mt-3`}
                                                onClick={() =>
                                                    onPlanTooth({
                                                        dentition,
                                                        numbering_system: 'fdi',
                                                        tooth: position.fdi,
                                                        surfaces: [],
                                                    })
                                                }>
                                                Plan treatment for this tooth
                                            </button>
                                        )}
                                </section>
                                <DentalFindingTimeline
                                    chart={chart.data}
                                    metadata={metadata.data}
                                    teeth={chart.data.teeth}
                                    numbering={numbering}
                                    selectedTooth={selected}
                                />
                            </div>
                            {(archived || !access.canWrite) && (
                                <p className="rounded-md bg-slate-50 px-4 py-3 text-xs text-clinic-muted">
                                    Read-only.{' '}
                                    {archived
                                        ? 'Archived patients cannot receive new chart observations.'
                                        : 'Chart observations require an authorized clinical role.'}
                                </p>
                            )}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-clinic-muted">
                                    Version {chart.data.version} ·{' '}
                                    {formatNoteDate(chart.data.recorded_at)}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {access.canWrite && !archived && (
                                        <button
                                            type="button"
                                            className={primaryClass}
                                            onClick={() =>
                                                setEditing(chart.data)
                                            }>
                                            Record chart observation
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        aria-expanded={showHistory}
                                        onClick={() =>
                                            setShowHistory(current => !current)
                                        }>
                                        {showHistory
                                            ? 'Hide chart history'
                                            : 'View chart history'}
                                    </button>
                                </div>
                            </div>
                            {showHistory && (
                                <DentalChartHistory
                                    key={`${dentition}-${chart.data.version}`}
                                    patientId={patient.id}
                                    dentition={dentition}
                                    numbering={numbering}
                                    metadata={metadata.data}
                                />
                            )}
                        </>
                    )}
                </>
            )}
            {editing && access.canView && metadata.data && (
                <DentalChartEditor
                    patient={patient}
                    chart={editing}
                    metadata={metadata.data}
                    numbering={numbering}
                    onClose={() => setEditing(null)}
                    onSaved={saved => {
                        void chart.mutate(saved, false)
                        setEditing(null)
                        setNotice(
                            `Dental chart saved as version ${saved.version}.`,
                        )
                    }}
                />
            )}
        </section>
    )
}
export default PatientDentalChart
