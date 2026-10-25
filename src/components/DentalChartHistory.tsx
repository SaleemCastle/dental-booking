import React, { useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError } from '../lib/api'
import { describeDentalTooth, toothLabel } from '../lib/dental-charts'
import { formatNoteDate } from '../lib/clinical-notes'
import {
    DentalChartMetadata,
    DentalRevisionSummary,
    Dentition,
    ToothNumbering,
    getDentalChartHistory,
    getDentalChartRevision,
} from '../services/dental-charts'
import DentalOdontogram from './DentalOdontogram'
import { appointmentButtonClass as buttonClass } from './AppointmentDialog'

export const DentalChartAttribution = ({
    chart,
}: {
    chart: DentalRevisionSummary
}) => (
    <div className="space-y-1 text-xs text-clinic-muted">
        <p>
            Version {chart.version} · {formatNoteDate(chart.recorded_at)}
        </p>
        {chart.version > 0 && (
            <>
                <p>
                    Provider #{chart.dentist_id} · Recorded by user #
                    {chart.author_user_id}
                    {chart.clinical_note_id
                        ? ` · Clinical note #${chart.clinical_note_id}`
                        : ''}
                </p>
                <p className="whitespace-pre-wrap break-words text-clinic-ink">
                    {chart.reason}
                </p>
            </>
        )}
    </div>
)

const DentalChartHistory = ({
    patientId,
    dentition,
    numbering,
    metadata,
}: {
    patientId: number
    dentition: Dentition
    numbering: ToothNumbering
    metadata: DentalChartMetadata
}) => {
    const { user } = useAuthSession()
    const [page, setPage] = useState(1)
    const [version, setVersion] = useState<number | null>(null)
    const [selected, setSelected] = useState('')
    const history = useSWR<
        Awaited<ReturnType<typeof getDentalChartHistory>>,
        ApiError
    >(
        ['dental-chart-history', user, patientId, dentition, page],
        () =>
            getDentalChartHistory(patientId, {
                dentition,
                numbering_system: 'fdi',
                page,
            }),
        { shouldRetryOnError: false },
    )
    const snapshot = useSWR<
        Awaited<ReturnType<typeof getDentalChartRevision>>,
        ApiError
    >(
        version == null
            ? null
            : ['dental-chart-revision', user, patientId, dentition, version],
        () =>
            getDentalChartRevision(patientId, version, {
                dentition,
                numbering_system: 'fdi',
            }),
        { shouldRetryOnError: false },
    )
    const tooth = snapshot.data?.teeth.find(item => item.tooth === selected)
    const accessDenied =
        history.error?.statusCode === 403 || snapshot.error?.statusCode === 403
    return (
        <section aria-label="Dental chart history" className="space-y-4">
            <h4 className="text-sm font-extrabold">
                {dentition === 'adult' ? 'Adult' : 'Primary'} chart history
            </h4>
            {accessDenied && (
                <p role="alert" className="text-sm text-red-700">
                    You do not have permission to view chart history.{' '}
                    <button
                        type="button"
                        className={buttonClass}
                        onClick={() => {
                            void history.mutate()
                            void snapshot.mutate()
                        }}>
                        Retry chart history access
                    </button>
                </p>
            )}
            {!history.data && !history.error && (
                <p role="status" className="text-sm">
                    Loading chart history...
                </p>
            )}
            {history.error && !accessDenied && (
                <p role="alert" className="text-sm text-red-700">
                    Chart history could not be loaded.{' '}
                    <button
                        type="button"
                        className={buttonClass}
                        onClick={() => void history.mutate()}>
                        Retry chart history
                    </button>
                </p>
            )}
            {!accessDenied && !history.error && history.data && (
                <>
                    {!history.data.revisions.length && (
                        <p className="text-sm text-clinic-muted">
                            No chart observations recorded for this dentition.
                        </p>
                    )}
                    <ol className="space-y-3">
                        {history.data.revisions.map(item => (
                            <li
                                key={item.version}
                                className="space-y-2 rounded border border-clinic-line p-3">
                                <DentalChartAttribution chart={item} />
                                <button
                                    type="button"
                                    className={buttonClass}
                                    aria-pressed={version === item.version}
                                    onClick={() => {
                                        setVersion(item.version)
                                        setSelected('')
                                    }}>
                                    View version {item.version}
                                </button>
                            </li>
                        ))}
                    </ol>
                    <nav
                        aria-label="Chart history pages"
                        className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={page === 1 || history.isValidating}
                            onClick={() => setPage(current => current - 1)}>
                            Newer revisions
                        </button>
                        <span className="text-xs">
                            Page {page} of{' '}
                            {Number(
                                history.data.meta.lastPage ??
                                    history.data.meta.last_page ??
                                    1,
                            )}
                        </span>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={
                                page >=
                                    Number(
                                        history.data.meta.lastPage ??
                                            history.data.meta.last_page ??
                                            1,
                                    ) || history.isValidating
                            }
                            onClick={() => setPage(current => current + 1)}>
                            Older revisions
                        </button>
                    </nav>
                </>
            )}
            {version != null && !accessDenied && (
                <section
                    aria-label={`Historical chart version ${version}`}
                    className="space-y-3 border-t border-clinic-line pt-4">
                    <h5 className="text-sm font-extrabold">
                        Historical version {version} · Read-only
                    </h5>
                    {!snapshot.data && !snapshot.error && (
                        <p role="status" className="text-sm">
                            Loading historical chart...
                        </p>
                    )}
                    {snapshot.error && (
                        <p role="alert" className="text-sm text-red-700">
                            This revision could not be loaded.{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => void snapshot.mutate()}>
                                Retry historical chart
                            </button>
                        </p>
                    )}
                    {!snapshot.error && snapshot.data && (
                        <>
                            <DentalChartAttribution chart={snapshot.data} />
                            <DentalOdontogram
                                metadata={metadata}
                                dentition={dentition}
                                numbering={numbering}
                                teeth={snapshot.data.teeth}
                                selected={selected}
                                onSelect={setSelected}
                            />
                            {selected && (
                                <p className="break-words text-sm">
                                    Tooth{' '}
                                    {toothLabel(
                                        metadata.dentitions[dentition].find(
                                            item => item.fdi === selected,
                                        ),
                                        numbering,
                                    )}
                                    : {describeDentalTooth(tooth)}
                                </p>
                            )}
                        </>
                    )}
                </section>
            )}
        </section>
    )
}
export default DentalChartHistory
