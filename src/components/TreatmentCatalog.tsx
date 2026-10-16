import React, { useRef, useState } from 'react'
import { FiPlus, FiRefreshCw } from 'react-icons/fi'
import { useTreatments } from '../hooks/treatments'
import { normalizeAxiosError } from '../lib/api'
import {
    activateTreatment,
    createTreatment,
    deactivateTreatment,
    Treatment,
    TreatmentPayload,
    updateTreatment,
} from '../services/treatments'
import TreatmentForm from './TreatmentForm'

const TreatmentCatalog = () => {
    const [filter, setFilter] = useState('all')
    const [search, setSearch] = useState('')
    const [editor, setEditor] = useState<{
        treatment: Treatment | null
    } | null>(null)
    const [busyId, setBusyId] = useState<number | null>(null)
    const [actionError, setActionError] = useState('')
    const [notice, setNotice] = useState('')
    const mutationRef = useRef(false)
    const {
        treatments,
        error,
        isLoading,
        isValidating,
        canView,
        canCreate,
        canUpdate,
        canDeactivate,
        retry,
        refreshLists,
    } = useTreatments(filter === 'all' ? undefined : filter === 'active')

    if (!canView) {
        return (
            <p role="alert" className="p-8 text-sm text-clinic-muted">
                You do not have permission to view the treatment catalog.
            </p>
        )
    }

    const save = async (payload: TreatmentPayload) => {
        if (
            mutationRef.current ||
            !editor ||
            (editor.treatment ? !canUpdate : !canCreate)
        ) {
            throw new Error('You cannot save this treatment.')
        }
        mutationRef.current = true
        setActionError('')
        setNotice('')
        try {
            const saved = editor.treatment
                ? await updateTreatment(editor.treatment.id, payload)
                : await createTreatment(payload)
            setEditor(null)
            setNotice(
                editor.treatment ? 'Treatment updated.' : 'Treatment created.',
            )
            await refreshLists(saved)
        } finally {
            mutationRef.current = false
        }
    }

    const toggleActive = async (treatment: Treatment) => {
        if (
            mutationRef.current ||
            (treatment.active ? !canDeactivate : !canUpdate)
        )
            return

        mutationRef.current = true
        setBusyId(treatment.id)
        setActionError('')
        setNotice('')
        try {
            let saved: Treatment
            if (treatment.active) {
                await deactivateTreatment(treatment.id)
                saved = { ...treatment, active: false }
            } else {
                saved = await activateTreatment(treatment.id)
            }
            setNotice(
                treatment.active
                    ? 'Treatment deactivated. Existing appointments are retained.'
                    : 'Treatment activated.',
            )
            await refreshLists(saved)
        } catch (cause) {
            setActionError(normalizeAxiosError(cause).message)
        } finally {
            mutationRef.current = false
            setBusyId(null)
        }
    }

    const query = search.trim().toLowerCase()
    const visible = (treatments ?? []).filter(treatment =>
        [
            treatment.name,
            treatment.category,
            treatment.description ?? '',
        ].some(value => value.toLowerCase().includes(query)),
    )
    const buttonClass =
        'rounded-md border border-clinic-line px-3 py-2 text-sm font-bold text-clinic-muted hover:border-clinic-blue hover:text-clinic-blue disabled:cursor-not-allowed disabled:opacity-50'

    return (
        <section aria-label="Treatment catalog" className="p-4 sm:p-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-extrabold text-clinic-ink">
                        Treatment catalog
                    </h1>
                    <p className="mt-1 text-sm text-clinic-muted">
                        Manage treatment details, appointment durations, and
                        prices.
                    </p>
                </div>
                {canCreate && (
                    <button
                        type="button"
                        disabled={
                            busyId !== null || isLoading || Boolean(error)
                        }
                        onClick={() => {
                            setNotice('')
                            setEditor({ treatment: null })
                        }}
                        className="flex items-center gap-2 rounded-md bg-clinic-blue px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                        <FiPlus /> Create treatment
                    </button>
                )}
            </div>
            <div className="mb-4 flex flex-wrap items-end gap-4">
                <label className="min-w-[200px] flex-1 text-sm font-bold text-clinic-ink">
                    Search treatments
                    <input
                        type="search"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Name, category, or description"
                        className="mt-2 block w-full rounded-md border-clinic-line bg-white text-sm focus:border-clinic-blue focus:ring-clinic-blue/20"
                    />
                </label>
                <label className="text-sm font-bold text-clinic-ink">
                    Status
                    <select
                        value={filter}
                        onChange={event => {
                            setFilter(event.target.value)
                            setActionError('')
                        }}
                        className="mt-2 block rounded-md border-clinic-line bg-white text-sm focus:border-clinic-blue focus:ring-clinic-blue/20">
                        <option value="all">All treatments</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </label>
                <button
                    type="button"
                    disabled={isValidating || busyId !== null}
                    onClick={() => void retry()}
                    className={`${buttonClass} flex items-center gap-2`}>
                    <FiRefreshCw /> {isValidating ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>
            {notice && (
                <p
                    role="status"
                    className="mb-4 rounded-md bg-clinic-mint p-3 text-sm text-clinic-ink">
                    {notice}
                </p>
            )}
            {actionError && (
                <p
                    role="alert"
                    className="mb-4 rounded-md bg-clinic-rose p-3 text-sm text-rose-700">
                    {actionError}
                </p>
            )}
            {error ? (
                <div
                    role="alert"
                    className="rounded-md border border-rose-200 bg-clinic-rose p-5 text-sm text-rose-700">
                    <p>{error.message}</p>
                    <button
                        type="button"
                        className={`${buttonClass} mt-3 bg-white`}
                        disabled={isValidating}
                        onClick={() => void retry()}>
                        Try again
                    </button>
                </div>
            ) : isLoading ? (
                <p
                    role="status"
                    className="p-8 text-center text-sm text-clinic-muted">
                    Loading treatments...
                </p>
            ) : visible.length === 0 ? (
                <div className="rounded-md border border-dashed border-clinic-line bg-white p-8 text-center text-sm text-clinic-muted">
                    {query
                        ? 'No treatments match your search.'
                        : filter === 'all'
                        ? 'No treatments yet.'
                        : `No ${filter} treatments.`}
                    {canCreate && !query && filter === 'all' && (
                        <p className="mt-2">
                            Create a treatment to start the catalog.
                        </p>
                    )}
                </div>
            ) : (
                <div
                    className="overflow-x-auto rounded-md border border-clinic-line bg-white"
                    aria-busy={isValidating}>
                    <table className="w-full text-left text-sm">
                        <caption className="sr-only">
                            Treatment catalog, {visible.length} treatments
                        </caption>
                        <thead className="border-b border-clinic-line bg-clinic-canvas text-xs uppercase text-clinic-muted">
                            <tr>
                                {[
                                    'Treatment',
                                    'Category',
                                    'Duration',
                                    'Price',
                                    'Status',
                                    'Actions',
                                ].map(heading => (
                                    <th
                                        key={heading}
                                        scope="col"
                                        className="px-4 py-3">
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-clinic-line">
                            {visible.map(treatment => (
                                <tr key={treatment.id}>
                                    <th
                                        scope="row"
                                        className="max-w-xs px-4 py-4">
                                        <span className="font-bold text-clinic-ink">
                                            {treatment.name}
                                        </span>
                                        {treatment.description && (
                                            <p className="mt-1 whitespace-pre-wrap break-words text-xs font-normal text-clinic-muted">
                                                {treatment.description}
                                            </p>
                                        )}
                                    </th>
                                    <td className="px-4 py-4 text-clinic-muted">
                                        {treatment.category}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-clinic-muted">
                                        {treatment.duration_minutes} min
                                    </td>
                                    <td className="px-4 py-4 tabular-nums text-clinic-ink">
                                        {Number(
                                            treatment.price,
                                        ).toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </td>
                                    <td className="px-4 py-4">
                                        <span
                                            className={`rounded-md px-2 py-1 text-xs font-bold ${
                                                treatment.active
                                                    ? 'bg-clinic-mint text-emerald-700'
                                                    : 'bg-clinic-canvas text-clinic-muted'
                                            }`}>
                                            {treatment.active
                                                ? 'Active'
                                                : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex gap-2">
                                            {canUpdate && (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        busyId !== null ||
                                                        isValidating
                                                    }
                                                    className={buttonClass}
                                                    aria-label={`Edit ${treatment.name}`}
                                                    onClick={() => {
                                                        setNotice('')
                                                        setEditor({ treatment })
                                                    }}>
                                                    Edit
                                                </button>
                                            )}
                                            {(treatment.active
                                                ? canDeactivate
                                                : canUpdate) && (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        busyId !== null ||
                                                        isValidating
                                                    }
                                                    className={buttonClass}
                                                    aria-label={`${
                                                        treatment.active
                                                            ? 'Deactivate'
                                                            : 'Activate'
                                                    } ${treatment.name}`}
                                                    onClick={() =>
                                                        void toggleActive(
                                                            treatment,
                                                        )
                                                    }>
                                                    {busyId === treatment.id
                                                        ? 'Updating...'
                                                        : treatment.active
                                                        ? 'Deactivate'
                                                        : 'Activate'}
                                                </button>
                                            )}
                                            {!canUpdate && !canDeactivate && (
                                                <span className="text-xs text-clinic-muted">
                                                    Read only
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {editor && (editor.treatment ? canUpdate : canCreate) && (
                <TreatmentForm
                    key={editor.treatment?.id ?? 'new'}
                    treatment={editor.treatment}
                    onClose={() => setEditor(null)}
                    onSave={save}
                />
            )}
        </section>
    )
}

export default TreatmentCatalog
