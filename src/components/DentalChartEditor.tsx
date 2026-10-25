import React, { FormEvent, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError, ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    getDentalChartPermissions,
    getUserPermissionSet,
} from '../lib/permissions'
import {
    cloneDentalTeeth,
    describeDentalTooth,
    reconcileDentalTeeth,
    replaceDentalTooth,
    toothLabel,
    validateDentalSnapshot,
} from '../lib/dental-charts'
import {
    DentalChart,
    DentalChartMetadata,
    DentalTooth,
    ToothNumbering,
    appendDentalChart,
    getDentalChart,
} from '../services/dental-charts'
import {
    getAppointmentProviders,
    getProviderName,
} from '../services/appointments'
import { ClinicalNotePage, getClinicalNotes } from '../services/clinical-notes'
import { getTreatments } from '../services/treatments'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'
import DentalOdontogram from './DentalOdontogram'
import DentalToothEditor from './DentalToothEditor'

const DentalChartEditor = ({
    patient,
    chart,
    metadata,
    numbering,
    onClose,
    onSaved,
}: {
    patient: Patient
    chart: DentalChart
    metadata: DentalChartMetadata
    numbering: ToothNumbering
    onClose: () => void
    onSaved: (chart: DentalChart) => void
}) => {
    const { user, status } = useAuthSession()
    const access = getDentalChartPermissions(
        status === 'authenticated' ? user : null,
    )
    const [base, setBase] = useState(chart)
    const [teeth, setTeeth] = useState(() => cloneDentalTeeth(chart.teeth))
    const [selected, setSelected] = useState<string>('')
    const [provider, setProvider] = useState(
        chart.dentist_id ? String(chart.dentist_id) : '',
    )
    const [noteId, setNoteId] = useState('')
    const [reason, setReason] = useState('')
    const [pendingFinding, setPendingFinding] = useState(false)
    const [busy, setBusy] = useState(false)
    const [denied, setDenied] = useState(false)
    const [error, setError] = useState('')
    const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({})
    const [conflict, setConflict] = useState(false)
    const [latest, setLatest] = useState<DentalChart | null>(null)
    const [choices, setChoices] = useState<Record<string, 'local' | 'latest'>>(
        {},
    )
    const savingRef = useRef(false)
    const formRef = useRef<HTMLFormElement>(null)
    const canWrite = access.canWrite && !denied
    const positions = metadata.dentitions[chart.dentition]
    const position = positions.find(item => item.fdi === selected)
    const grants = getUserPermissionSet(user)
    const canLinkTreatment = grants.has('treatments.view')
    const providers = useSWR(
        canWrite ? ['dental-chart-providers', user] : null,
        getAppointmentProviders,
        { shouldRetryOnError: false },
    )
    const treatments = useSWR(
        canWrite && canLinkTreatment ? ['dental-chart-treatments', user] : null,
        () => getTreatments(),
        { shouldRetryOnError: false },
    )
    const notes = useSWRInfinite<ClinicalNotePage, ApiError>(
        (index, previous: ClinicalNotePage | null) =>
            !canWrite ||
            !provider ||
            (previous && index >= Number(previous.meta.lastPage))
                ? null
                : ['dental-chart-notes', user, patient.id, provider, index + 1],
        (_key, _user, id, dentist, page) =>
            getClinicalNotes({
                patient_id: id,
                dentist_id: Number(dentist),
                page,
                per_page: 50,
            }),
        { shouldRetryOnError: false },
    )
    const dirty =
        pendingFinding ||
        Boolean(reason || noteId) ||
        provider !== (chart.dentist_id ? String(chart.dentist_id) : '') ||
        JSON.stringify(teeth) !== JSON.stringify(chart.teeth)
    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (dirty) {
                event.preventDefault()
                event.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => window.removeEventListener('beforeunload', beforeUnload)
    }, [dirty])
    const close = () => {
        if (
            !busy &&
            (!dirty ||
                window.confirm('Discard this unsaved chart observation?'))
        )
            onClose()
    }
    const select = (id: string) => {
        if (id === selected) return
        if (
            pendingFinding &&
            !window.confirm(
                'Discard the finding entry that has not been applied?',
            )
        )
            return
        setPendingFinding(false)
        setSelected(id)
    }
    const merge = latest
        ? reconcileDentalTeeth(base.teeth, teeth, latest.teeth, choices)
        : null
    const loadLatest = async () => {
        if (savingRef.current) return
        savingRef.current = true
        setBusy(true)
        setError('')
        try {
            setLatest(
                await getDentalChart(patient.id, {
                    dentition: chart.dentition,
                    numbering_system: 'fdi',
                }),
            )
            setChoices({})
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setError(failure.message)
            if ([403, 404].includes(failure.statusCode)) setDenied(true)
        } finally {
            savingRef.current = false
            setBusy(false)
        }
    }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (savingRef.current || !canWrite || conflict) return
        setFieldErrors({})
        if (pendingFinding) {
            setError(
                'Apply or reset the current finding entry before saving the chart.',
            )
            return
        }
        if (!/^[1-9]\d*$/.test(provider)) {
            setError('Select the observing provider.')
            formRef.current
                ?.querySelector<HTMLSelectElement>('[name="dentist_id"]')
                ?.focus()
            return
        }
        if (!reason.trim() || Array.from(reason).length > 1000) {
            setError('Enter a reason of 1 to 1,000 characters.')
            formRef.current
                ?.querySelector<HTMLTextAreaElement>('[name="reason"]')
                ?.focus()
            return
        }
        const invalid = validateDentalSnapshot(teeth, metadata, chart.dentition)
        if (invalid) {
            setError(invalid)
            return
        }
        savingRef.current = true
        setBusy(true)
        setError('')
        try {
            const saved = await appendDentalChart(patient.id, {
                dentition: chart.dentition,
                numbering_system: 'fdi',
                expected_version: base.version,
                dentist_id: Number(provider),
                clinical_note_id: noteId ? Number(noteId) : null,
                reason: reason.trim(),
                teeth,
            })
            onSaved(saved)
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setError(failure.message)
            setFieldErrors(failure.errors)
            if (failure.statusCode === 409) {
                setConflict(true)
                setLatest(null)
            }
            if ([403, 404].includes(failure.statusCode)) setDenied(true)
            const toothPath = Object.keys(failure.errors).find(key =>
                key.startsWith('teeth.'),
            )
            if (toothPath)
                setSelected(
                    teeth[Number(toothPath.split('.')[1])]?.tooth ?? selected,
                )
        } finally {
            savingRef.current = false
            setBusy(false)
        }
    }
    return (
        <AppointmentDialog
            title={`Record ${chart.dentition} dental chart`}
            closeLabel="Close dental chart editor"
            busy={busy}
            onClose={close}>
            <form
                ref={formRef}
                noValidate
                onSubmit={submit}
                className="space-y-5 p-5">
                <p className="text-sm font-bold">
                    {patient.firstName} {patient.lastName} · Based on version{' '}
                    {base.version}
                </p>
                <p className="text-xs text-clinic-muted">
                    Save records a complete new observation. Previous revisions
                    remain unchanged.
                </p>
                {!canWrite && (
                    <p role="alert" className="text-sm text-red-700">
                        Clinical editing is no longer available. Your draft
                        cannot be submitted.
                    </p>
                )}
                {error && (
                    <p role="alert" className="text-sm text-red-700">
                        {error}
                    </p>
                )}
                {!!Object.keys(fieldErrors).length && (
                    <ul role="alert" className="space-y-1 text-sm text-red-700">
                        {Object.entries(fieldErrors).map(
                            ([field, messages]) => {
                                const index = field.startsWith('teeth.')
                                    ? Number(field.split('.')[1])
                                    : -1
                                const item = positions.find(
                                    position =>
                                        position.fdi === teeth[index]?.tooth,
                                )
                                return (
                                    <li key={field}>
                                        {item
                                            ? `Tooth ${toothLabel(
                                                  item,
                                                  numbering,
                                              )}: `
                                            : ''}
                                        {messages.join(' ')}
                                    </li>
                                )
                            },
                        )}
                    </ul>
                )}
                {conflict && (
                    <section
                        aria-label="Resolve chart conflict"
                        className="space-y-4 rounded border border-amber-300 bg-clinic-amber p-4">
                        <h4 className="font-bold">
                            A newer chart exists. Your draft has been kept.
                        </h4>
                        <p className="text-sm">
                            Load the latest version, review changes, and
                            reconcile before saving again.
                        </p>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={busy || !canWrite}
                            onClick={() => void loadLatest()}>
                            Load latest for review
                        </button>
                        {latest && merge && (
                            <>
                                <p className="text-sm">
                                    Latest: version {latest.version}. Teeth you
                                    did not change use the latest observation.
                                    Your changes to other teeth are preserved.
                                </p>
                                <details>
                                    <summary className="cursor-pointer text-sm font-bold">
                                        Review latest chart
                                    </summary>
                                    <ul className="mt-2 space-y-2 text-sm">
                                        {latest.teeth.map(tooth => (
                                            <li key={tooth.tooth}>
                                                Tooth{' '}
                                                {toothLabel(
                                                    positions.find(
                                                        item =>
                                                            item.fdi ===
                                                            tooth.tooth,
                                                    ),
                                                    numbering,
                                                )}
                                                : {describeDentalTooth(tooth)}
                                            </li>
                                        ))}
                                        {!latest.teeth.length && (
                                            <li>All positions uncharted.</li>
                                        )}
                                    </ul>
                                </details>
                                {merge.conflicts.map(id => (
                                    <fieldset
                                        key={id}
                                        className="space-y-2 rounded border border-amber-300 p-3 text-sm">
                                        <legend className="font-bold">
                                            Tooth{' '}
                                            {toothLabel(
                                                positions.find(
                                                    item => item.fdi === id,
                                                ),
                                                numbering,
                                            )}{' '}
                                            changed in both charts
                                        </legend>
                                        <p className="break-words">
                                            Your draft:{' '}
                                            {describeDentalTooth(
                                                teeth.find(
                                                    tooth => tooth.tooth === id,
                                                ),
                                            )}
                                        </p>
                                        <p className="break-words">
                                            Latest:{' '}
                                            {describeDentalTooth(
                                                latest.teeth.find(
                                                    tooth => tooth.tooth === id,
                                                ),
                                            )}
                                        </p>
                                        {(['local', 'latest'] as const).map(
                                            choice => (
                                                <label
                                                    key={choice}
                                                    className="mr-4 inline-flex items-center gap-2">
                                                    <input
                                                        type="radio"
                                                        name={`conflict-${id}`}
                                                        checked={
                                                            choices[id] ===
                                                            choice
                                                        }
                                                        onChange={() =>
                                                            setChoices(
                                                                current => ({
                                                                    ...current,
                                                                    [id]: choice,
                                                                }),
                                                            )
                                                        }
                                                    />
                                                    {choice === 'local'
                                                        ? 'Keep my tooth observation'
                                                        : 'Use latest tooth observation'}
                                                </label>
                                            ),
                                        )}
                                    </fieldset>
                                ))}
                                {!merge.conflicts.length && (
                                    <p className="text-sm">
                                        No tooth has competing changes. Review
                                        the latest chart before continuing.
                                    </p>
                                )}
                                <button
                                    type="button"
                                    className={primaryClass}
                                    disabled={
                                        merge.unresolved.length > 0 ||
                                        busy ||
                                        !canWrite
                                    }
                                    onClick={() => {
                                        setTeeth(merge.teeth)
                                        setBase(latest)
                                        setConflict(false)
                                        setLatest(null)
                                        setFieldErrors({})
                                        setError(
                                            'Reviewed changes applied to your draft. Review the chart and save when ready.',
                                        )
                                    }}>
                                    Use reviewed chart
                                </button>
                            </>
                        )}
                    </section>
                )}
                <fieldset
                    disabled={busy || !canWrite || conflict}
                    className="min-w-0 space-y-5">
                    <DentalOdontogram
                        metadata={metadata}
                        dentition={chart.dentition}
                        numbering={numbering}
                        teeth={teeth}
                        selected={selected}
                        onSelect={select}
                    />
                    {position ? (
                        <DentalToothEditor
                            key={selected}
                            position={position}
                            label={toothLabel(position, numbering)}
                            tooth={teeth.find(
                                tooth => tooth.tooth === selected,
                            )}
                            metadata={metadata}
                            treatments={treatments.data ?? []}
                            canLinkTreatment={
                                canLinkTreatment && !treatments.error
                            }
                            onPendingChange={setPendingFinding}
                            onChange={(next?: DentalTooth) => {
                                setTeeth(current =>
                                    replaceDentalTooth(current, selected, next),
                                )
                                setError('')
                                setFieldErrors({})
                            }}
                        />
                    ) : (
                        <p className="text-sm text-clinic-muted">
                            Select a tooth to record its status, findings and
                            surfaces.
                        </p>
                    )}
                    {canLinkTreatment && !treatments.data && !treatments.error && (
                        <p role="status" className="text-sm">
                            Loading treatments...
                        </p>
                    )}
                    {treatments.error && (
                        <p role="alert" className="text-sm text-red-700">
                            Treatments could not be loaded.{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => void treatments.mutate()}>
                                Retry treatments
                            </button>
                        </p>
                    )}
                    <label className="block text-sm font-bold">
                        Observing provider *
                        <select
                            name="dentist_id"
                            aria-label="Observing provider"
                            className={inputClass}
                            value={provider}
                            onChange={event => {
                                setProvider(event.target.value)
                                setNoteId('')
                            }}>
                            <option value="">Select a provider</option>
                            {provider &&
                                !providers.data?.some(
                                    item => String(item.id) === provider,
                                ) && (
                                    <option value={provider}>
                                        Provider #{provider} (previous
                                        observation)
                                    </option>
                                )}
                            {(providers.data ?? []).map(item => (
                                <option key={item.id} value={item.id}>
                                    {getProviderName(item)}
                                </option>
                            ))}
                        </select>
                    </label>
                    {!providers.data && !providers.error && (
                        <p role="status" className="text-sm">
                            Loading providers...
                        </p>
                    )}
                    {providers.error && (
                        <p role="alert" className="text-sm text-red-700">
                            Providers could not be loaded.{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => void providers.mutate()}>
                                Retry providers
                            </button>
                        </p>
                    )}
                    <label className="block text-sm font-bold">
                        Clinical note (optional)
                        <select
                            aria-label="Linked clinical note"
                            className={inputClass}
                            value={noteId}
                            disabled={!provider || Boolean(notes.error)}
                            onChange={event => setNoteId(event.target.value)}>
                            <option value="">No clinical note link</option>
                            {notes.data
                                ?.flatMap(page => page.notes)
                                .filter(
                                    note =>
                                        note.patient_id === patient.id &&
                                        note.dentist_id === Number(provider),
                                )
                                .map(note => (
                                    <option key={note.id} value={note.id}>
                                        Note #{note.id} ·{' '}
                                        {note.note_text.slice(0, 80)}
                                    </option>
                                ))}
                        </select>
                    </label>
                    {provider && !notes.data && !notes.error && (
                        <p role="status" className="text-sm">
                            Loading matching clinical notes...
                        </p>
                    )}
                    {notes.error && (
                        <p role="alert" className="text-sm text-red-700">
                            Clinical notes could not be loaded.{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => void notes.mutate()}>
                                Retry matching notes
                            </button>
                        </p>
                    )}
                    {notes.data &&
                        notes.data.length <
                            Number(notes.data[0]?.meta.lastPage) && (
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() =>
                                    void notes.setSize(notes.size + 1)
                                }
                                disabled={notes.isValidating}>
                                Load older matching notes
                            </button>
                        )}
                    <label className="block text-sm font-bold">
                        Reason for this observation *
                        <textarea
                            name="reason"
                            aria-label="Reason for observation"
                            className={inputClass}
                            rows={3}
                            maxLength={1000}
                            required
                            value={reason}
                            onChange={event => setReason(event.target.value)}
                        />
                    </label>
                    {!teeth.length && (
                        <p className="text-sm text-clinic-muted">
                            This observation contains no charted teeth. Saving
                            it records an empty chart; explain the correction in
                            the reason.
                        </p>
                    )}
                </fieldset>
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={busy}
                        onClick={close}>
                        Cancel observation
                    </button>
                    <button
                        type="submit"
                        className={primaryClass}
                        disabled={
                            busy ||
                            !canWrite ||
                            conflict ||
                            Boolean(providers.error) ||
                            !providers.data
                        }>
                        {busy ? 'Working...' : 'Save chart observation'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}
export default DentalChartEditor
