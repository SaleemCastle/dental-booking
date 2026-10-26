import React, { FormEvent, useRef, useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    planPriorities,
    priceInCents,
    formatPlanAmount,
    validatePlanningContext,
} from '../lib/treatment-plans'
import { getActiveTreatments } from '../services/treatments'
import {
    getAppointmentProviders,
    getProviderName,
} from '../services/appointments'
import {
    getDentalChartMetadata,
    ToothNumbering,
} from '../services/dental-charts'
import {
    NewTreatmentPlanItem,
    TreatmentPlanItem,
    TreatmentPlanItemUpdate,
    TreatmentToothContext,
} from '../services/treatment-plans'
import DentalOdontogram from './DentalOdontogram'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'

const TreatmentPlanItemForm = ({
    item,
    context: seed,
    canWrite,
    onClose,
    onSave,
    onDenied,
}: {
    item?: TreatmentPlanItem
    context?: TreatmentToothContext | null
    canWrite: boolean
    onClose: () => void
    onSave: (
        payload: NewTreatmentPlanItem | TreatmentPlanItemUpdate,
    ) => Promise<void>
    onDenied: () => void
}) => {
    const { user } = useAuthSession()
    const initialContext = item ? item.tooth_context : seed
    const [treatmentId, setTreatmentId] = useState(
        item ? String(item.treatment_id) : '',
    )
    const [provider, setProvider] = useState(
        item ? String(item.dentist_id) : '',
    )
    const [estimate, setEstimate] = useState(item?.estimated_price ?? '')
    const [priority, setPriority] = useState(item?.priority ?? 'normal')
    const [sequence, setSequence] = useState(item ? String(item.sequence) : '')
    const [notes, setNotes] = useState(item?.notes ?? '')
    const [context, setContext] = useState<TreatmentToothContext>(
        () =>
            initialContext ?? {
                dentition: 'adult',
                numbering_system: 'fdi',
                tooth: '',
                surfaces: [],
            },
    )
    const [toothSpecific, setToothSpecific] = useState(Boolean(initialContext))
    const [numbering, setNumbering] = useState<ToothNumbering>('universal')
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [message, setMessage] = useState('')
    const [saving, setSaving] = useState(false)
    const [denied, setDenied] = useState(false)
    const changed = useRef(false)
    const locked = useRef(false)
    const form = useRef<HTMLFormElement>(null)
    const catalog = useSWR(
        canWrite && !item ? ['planning-catalog', user] : null,
        getActiveTreatments,
        {
            shouldRetryOnError: false,
            revalidateOnMount: true,
            dedupingInterval: 0,
        },
    )
    const providers = useSWR(
        canWrite ? ['appointment-providers', user] : null,
        getAppointmentProviders,
        { shouldRetryOnError: false },
    )
    const metadata = useSWR(
        canWrite ? ['dental-chart-metadata', user] : null,
        () => getDentalChartMetadata(),
        { shouldRetryOnError: false },
    )
    const selectedTreatment = catalog.data?.find(
        treatment => String(treatment.id) === treatmentId && treatment.active,
    )
    const position = metadata.data?.dentitions[context.dentition].find(
        position =>
            (context.numbering_system === 'fdi'
                ? position.fdi
                : position.tooth) === context.tooth,
    )
    const close = () => {
        if (
            !saving &&
            (!changed.current ||
                window.confirm('Discard unsaved treatment item changes?'))
        )
            onClose()
    }
    const touch = () => {
        changed.current = true
        setErrors({})
        setMessage('')
    }
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (locked.current || !canWrite || denied) return
        if (!item && catalog.isValidating) {
            setMessage(
                'Wait for the latest catalog before adding this treatment.',
            )
            return
        }
        const validation: ApiFieldErrors = {}
        if (!item && !selectedTreatment)
            validation.treatment_id = ['Select an active catalog treatment.']
        if (
            !/^[1-9]\d*$/.test(provider) ||
            !providers.data?.some(
                providerItem => String(providerItem.id) === provider,
            )
        )
            validation.dentist_id = ['Select a clinic provider.']
        if (estimate && priceInCents(estimate) == null)
            validation.estimated_price = [
                'Use an amount from 0 through 99,999,999.99, with at most two decimal places.',
            ]
        if (
            sequence &&
            (!/^\d+$/.test(sequence) ||
                Number(sequence) < 1 ||
                Number(sequence) > 1000000)
        )
            validation.sequence = ['Use an integer from 1 through 1,000,000.']
        if (Array.from(notes).length > 10000)
            validation.notes = ['Use 10,000 characters or fewer.']
        const contextError = validatePlanningContext(
            toothSpecific ? context : null,
            metadata.data,
        )
        if (contextError) validation['tooth_context.tooth'] = [contextError]
        setErrors(validation)
        if (Object.keys(validation).length) {
            setMessage('Please review the highlighted fields.')
            const element = form.current?.elements.namedItem(
                Object.keys(validation)[0],
            )
            if (element instanceof HTMLElement) element.focus()
            return
        }
        const payload = {
            ...(item ? {} : { treatment_id: Number(treatmentId) }),
            dentist_id: Number(provider),
            priority,
            notes: notes || null,
            tooth_context: toothSpecific
                ? {
                      ...context,
                      numbering_system: 'fdi' as const,
                      tooth: position.fdi,
                      surfaces: [...context.surfaces],
                  }
                : null,
            ...(estimate ? { estimated_price: estimate } : {}),
            ...(sequence ? { sequence: Number(sequence) } : {}),
        }
        const changes = item
            ? Object.fromEntries(
                  Object.entries(payload).filter(
                      ([key, value]) =>
                          JSON.stringify(item[key]) !== JSON.stringify(value),
                  ),
              )
            : payload
        if (item && !Object.keys(changes).length) {
            onClose()
            return
        }
        locked.current = true
        setSaving(true)
        setMessage('')
        try {
            await onSave(changes)
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setMessage(failure.message)
            setErrors(failure.errors)
            if ([403, 404].includes(failure.statusCode)) {
                setDenied(true)
                onDenied()
            }
        } finally {
            locked.current = false
            setSaving(false)
        }
    }
    const fieldError = (name: string) => (
        <div
            id={`planning-${name}-error`}
            className="mt-2 space-y-1 text-sm text-red-700">
            {errors[name]?.map((message, index) => (
                <p key={index}>{message}</p>
            ))}
        </div>
    )
    return (
        <AppointmentDialog
            title={item ? 'Edit planned treatment' : 'Add planned treatment'}
            closeLabel="Close planned treatment form"
            busy={saving}
            onClose={close}>
            <form
                ref={form}
                noValidate
                onSubmit={submit}
                className="space-y-5 p-5 sm:p-6">
                {message && (
                    <p role="alert" className="text-sm text-red-700">
                        {message}
                    </p>
                )}
                {!!Object.keys(errors).length && (
                    <ul role="alert" className="text-sm text-red-700">
                        {Object.entries(errors)
                            .filter(
                                ([key]) =>
                                    ![
                                        'treatment_id',
                                        'dentist_id',
                                        'estimated_price',
                                        'sequence',
                                        'notes',
                                    ].includes(key),
                            )
                            .flatMap(([key, messages]) =>
                                messages.map((message, index) => (
                                    <li key={`${key}-${index}`}>{message}</li>
                                )),
                            )}
                    </ul>
                )}
                {(!canWrite || denied) && (
                    <p role="alert" className="text-sm text-red-700">
                        Editing is unavailable. Your entries have been kept.
                    </p>
                )}
                <fieldset
                    disabled={saving || !canWrite || denied}
                    className="min-w-0 space-y-5">
                    {item ? (
                        <div className="rounded border border-clinic-line p-3 text-sm">
                            <p className="font-bold">{item.treatment_name}</p>
                            <p>
                                Captured catalog price: {item.catalog_price}. To
                                replace this procedure, cancel this item and add
                                a new one.
                            </p>
                        </div>
                    ) : (
                        <label className="block text-sm font-bold">
                            Catalog treatment *
                            <select
                                name="treatment_id"
                                aria-label="Catalog treatment"
                                className={inputClass}
                                value={treatmentId}
                                aria-invalid={Boolean(
                                    errors.treatment_id?.length,
                                )}
                                aria-describedby="planning-treatment_id-error"
                                onChange={event => {
                                    touch()
                                    setTreatmentId(event.target.value)
                                    setEstimate(
                                        catalog.data?.find(
                                            item =>
                                                String(item.id) ===
                                                event.target.value,
                                        )?.price ?? '',
                                    )
                                }}>
                                <option value="">
                                    Select an active treatment
                                </option>
                                {(catalog.data ?? [])
                                    .filter(item => item.active)
                                    .map(item => (
                                        <option key={item.id} value={item.id}>
                                            {item.name} · {item.price}
                                        </option>
                                    ))}
                            </select>
                            {fieldError('treatment_id')}
                        </label>
                    )}
                    {!item && !catalog.data && !catalog.error && (
                        <p role="status" className="text-sm">
                            Loading treatment catalog...
                        </p>
                    )}
                    {!item && catalog.error && (
                        <p role="alert" className="text-sm text-red-700">
                            The treatment catalog is unavailable for this clinic
                            access.{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => void catalog.mutate()}>
                                Retry planning catalog
                            </button>
                        </p>
                    )}
                    {!item &&
                        catalog.data &&
                        !catalog.data.some(item => item.active) && (
                            <p className="text-sm text-clinic-muted">
                                No active treatments are available to propose.
                            </p>
                        )}
                    <label className="block text-sm font-bold">
                        Provider *
                        <select
                            name="dentist_id"
                            aria-label="Planned treatment provider"
                            className={inputClass}
                            value={provider}
                            aria-invalid={Boolean(errors.dentist_id?.length)}
                            aria-describedby="planning-dentist_id-error"
                            onChange={event => {
                                touch()
                                setProvider(event.target.value)
                            }}>
                            <option value="">Select a provider</option>
                            {(providers.data ?? []).map(item => (
                                <option key={item.id} value={item.id}>
                                    {getProviderName(item)}
                                </option>
                            ))}
                        </select>
                        {fieldError('dentist_id')}
                    </label>
                    {!providers.data && !providers.error && (
                        <p role="status" className="text-sm">
                            Loading clinic providers...
                        </p>
                    )}
                    {providers.error && (
                        <p role="alert" className="text-sm text-red-700">
                            Providers could not be loaded.{' '}
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => void providers.mutate()}>
                                Retry planning providers
                            </button>
                        </p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-bold">
                            Estimated price
                            <input
                                name="estimated_price"
                                aria-label="Estimated item price"
                                inputMode="decimal"
                                placeholder={
                                    selectedTreatment?.price ??
                                    'Catalog default'
                                }
                                value={estimate}
                                className={inputClass}
                                aria-invalid={Boolean(
                                    errors.estimated_price?.length,
                                )}
                                aria-describedby="planning-estimated_price-error"
                                onChange={event => {
                                    touch()
                                    setEstimate(event.target.value)
                                }}
                            />
                            {fieldError('estimated_price')}
                        </label>
                        <label className="block text-sm font-bold">
                            Priority
                            <select
                                aria-label="Item priority"
                                className={inputClass}
                                value={priority}
                                onChange={event => {
                                    touch()
                                    setPriority(
                                        event.target.value as typeof priority,
                                    )
                                }}>
                                {planPriorities.map(priority => (
                                    <option key={priority} value={priority}>
                                        {priority}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <p className="text-sm text-clinic-muted">
                        Estimated item total:{' '}
                        {formatPlanAmount(
                            priceInCents(
                                estimate ||
                                    selectedTreatment?.price ||
                                    item?.estimated_price ||
                                    '0',
                            ) ?? 0,
                        )}
                        . Priority is independent of item order.
                    </p>
                    <label className="block text-sm font-bold">
                        Order number (optional)
                        <input
                            name="sequence"
                            aria-label="Item order number"
                            inputMode="numeric"
                            className={inputClass}
                            value={sequence}
                            placeholder="Append after the last item"
                            aria-invalid={Boolean(errors.sequence?.length)}
                            aria-describedby="planning-sequence-error"
                            onChange={event => {
                                touch()
                                setSequence(event.target.value)
                            }}
                        />
                        {fieldError('sequence')}
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                            type="checkbox"
                            checked={toothSpecific}
                            onChange={event => {
                                touch()
                                setToothSpecific(event.target.checked)
                            }}
                        />
                        Tooth-specific procedure
                    </label>
                    {toothSpecific && (
                        <section
                            className="min-w-0 space-y-4 rounded border border-clinic-line p-3"
                            aria-label="Planned tooth context">
                            <p className="text-xs text-clinic-muted">
                                Choose a planning location. This does not record
                                clinical findings or change the patient’s dental
                                chart.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-sm font-bold">
                                    Dentition
                                    <select
                                        aria-label="Planning dentition"
                                        className={inputClass}
                                        value={context.dentition}
                                        onChange={event => {
                                            touch()
                                            setContext({
                                                dentition: event.target
                                                    .value as TreatmentToothContext['dentition'],
                                                numbering_system: 'fdi',
                                                tooth: '',
                                                surfaces: [],
                                            })
                                        }}>
                                        <option value="adult">Adult</option>
                                        <option value="primary">Primary</option>
                                    </select>
                                </label>
                                <label className="text-sm font-bold">
                                    Numbering
                                    <select
                                        aria-label="Planning numbering"
                                        className={inputClass}
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
                                </label>
                            </div>
                            {!metadata.data && !metadata.error && (
                                <p role="status" className="text-sm">
                                    Loading tooth positions...
                                </p>
                            )}
                            {metadata.error && (
                                <p
                                    role="alert"
                                    className="text-sm text-red-700">
                                    Tooth positions could not be loaded.{' '}
                                    <button
                                        type="button"
                                        className={buttonClass}
                                        onClick={() => void metadata.mutate()}>
                                        Retry planning tooth positions
                                    </button>
                                </p>
                            )}
                            {metadata.data && (
                                <>
                                    <DentalOdontogram
                                        selectionOnly
                                        metadata={metadata.data}
                                        dentition={context.dentition}
                                        numbering={numbering}
                                        teeth={[]}
                                        selected={position?.fdi}
                                        onSelect={tooth => {
                                            touch()
                                            setContext(current => ({
                                                ...current,
                                                numbering_system: 'fdi',
                                                tooth,
                                                surfaces: [],
                                            }))
                                        }}
                                    />
                                    <label className="block text-sm font-bold">
                                        Tooth
                                        <select
                                            name="tooth_context.tooth"
                                            aria-label="Planned tooth"
                                            className={inputClass}
                                            value={position?.fdi ?? ''}
                                            onChange={event => {
                                                touch()
                                                setContext(current => ({
                                                    ...current,
                                                    numbering_system: 'fdi',
                                                    tooth: event.target.value,
                                                    surfaces: [],
                                                }))
                                            }}>
                                            <option value="">
                                                Select a tooth
                                            </option>
                                            {metadata.data.dentitions[
                                                context.dentition
                                            ].map(position => (
                                                <option
                                                    key={position.fdi}
                                                    value={position.fdi}>
                                                    {numbering === 'fdi'
                                                        ? position.fdi
                                                        : position.tooth}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    {position && (
                                        <fieldset>
                                            <legend className="text-sm font-bold">
                                                Planned surfaces (optional)
                                            </legend>
                                            <div className="mt-2 flex flex-wrap gap-3">
                                                {position.surfaces.map(
                                                    surface => (
                                                        <label
                                                            key={surface}
                                                            className="flex items-center gap-2 rounded border border-clinic-line p-3 text-sm">
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`Plan surface ${surface}`}
                                                                checked={context.surfaces.includes(
                                                                    surface,
                                                                )}
                                                                onChange={event => {
                                                                    touch()
                                                                    setContext(
                                                                        current => ({
                                                                            ...current,
                                                                            surfaces: event
                                                                                .target
                                                                                .checked
                                                                                ? [
                                                                                      ...current.surfaces,
                                                                                      surface,
                                                                                  ]
                                                                                : current.surfaces.filter(
                                                                                      item =>
                                                                                          item !==
                                                                                          surface,
                                                                                  ),
                                                                        }),
                                                                    )
                                                                }}
                                                            />
                                                            {surface} ·{' '}
                                                            {
                                                                metadata.data
                                                                    .surfaces[
                                                                    surface
                                                                ]
                                                            }
                                                        </label>
                                                    ),
                                                )}
                                            </div>
                                            <p className="mt-2 text-xs text-clinic-muted">
                                                No surfaces selected means whole
                                                tooth.
                                            </p>
                                        </fieldset>
                                    )}
                                </>
                            )}
                        </section>
                    )}
                    <label className="block text-sm font-bold">
                        Item notes (optional)
                        <textarea
                            name="notes"
                            aria-label="Planned item notes"
                            className={inputClass}
                            value={notes}
                            maxLength={10000}
                            rows={3}
                            aria-invalid={Boolean(errors.notes?.length)}
                            aria-describedby="planning-notes-error"
                            onChange={event => {
                                touch()
                                setNotes(event.target.value)
                            }}
                        />
                        {fieldError('notes')}
                    </label>
                </fieldset>
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={saving}
                        onClick={close}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className={primaryClass}
                        disabled={
                            saving ||
                            !canWrite ||
                            denied ||
                            !providers.data ||
                            Boolean(providers.error) ||
                            (!item &&
                                (!catalog.data ||
                                    Boolean(catalog.error) ||
                                    catalog.isValidating))
                        }>
                        {saving
                            ? 'Saving...'
                            : item
                            ? 'Save planned treatment'
                            : 'Add treatment to plan'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}
export default TreatmentPlanItemForm
