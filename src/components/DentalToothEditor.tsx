import React, { useState } from 'react'
import {
    DentalChartMetadata,
    DentalFinding,
    DentalPosition,
    DentalTooth,
    ToothSurface,
} from '../services/dental-charts'
import { Treatment } from '../services/treatments'
import {
    canonicalSurfaces,
    describeDentalTooth,
    validateDentalFinding,
} from '../lib/dental-charts'
import {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'

const blankFinding = (): DentalFinding => ({
    code: 'caries',
    status: 'active',
    surfaces: [],
    treatment_id: null,
    note: '',
})

const DentalToothEditor = ({
    position,
    label,
    tooth,
    metadata,
    treatments,
    canLinkTreatment,
    onChange,
    onPendingChange,
}: {
    position: DentalPosition
    label: string
    tooth?: DentalTooth
    metadata: DentalChartMetadata
    treatments: Treatment[]
    canLinkTreatment: boolean
    onChange: (tooth?: DentalTooth) => void
    onPendingChange: (pending: boolean) => void
}) => {
    const [finding, setFinding] = useState(blankFinding)
    const [editing, setEditing] = useState(-1)
    const [error, setError] = useState('')
    const update = (changes: Partial<DentalFinding>) => {
        setFinding(current => ({ ...current, ...changes }))
        setError('')
        onPendingChange(true)
    }
    const reset = () => {
        setFinding(blankFinding())
        setEditing(-1)
        setError('')
        onPendingChange(false)
    }
    const apply = () => {
        const next = {
            ...finding,
            code: finding.code.trim(),
            surfaces: canonicalSurfaces(finding.surfaces),
            note: finding.note?.trim() || null,
        }
        const failure = validateDentalFinding(
            next,
            position,
            tooth?.findings ?? [],
            editing,
        )
        if (failure) {
            setError(failure)
            return
        }
        const findings = [...(tooth?.findings ?? [])]
        if (editing < 0) findings.push(next)
        else findings[editing] = next
        onChange({
            tooth: position.fdi,
            status: tooth?.status ?? 'present',
            findings,
        })
        reset()
    }
    // Mesial points towards the midline; buccal points away from the arch.
    const upper = [1, 2, 5, 6].includes(Number(position.fdi[0]))
    const mesialRight = [1, 4, 5, 8].includes(Number(position.fdi[0]))
    const center = position.surfaces.find(
        surface => surface === 'O' || surface === 'I',
    )!
    const slots: Array<ToothSurface | null> = [
        null,
        upper ? 'B' : 'L',
        null,
        mesialRight ? 'D' : 'M',
        center,
        mesialRight ? 'M' : 'D',
        null,
        upper ? 'L' : 'B',
        null,
    ]
    return (
        <section
            aria-label={`Edit tooth ${label}`}
            className="space-y-4 rounded-md border border-clinic-line p-4">
            <h4 className="font-extrabold text-clinic-ink">Tooth {label}</h4>
            <label className="block text-sm font-bold">
                Presence status
                <select
                    aria-label="Tooth presence status"
                    className={inputClass}
                    value={tooth?.status ?? ''}
                    onChange={event => {
                        if (!event.target.value) {
                            onChange(undefined)
                            reset()
                        } else
                            onChange({
                                tooth: position.fdi,
                                status: event.target
                                    .value as DentalTooth['status'],
                                findings: tooth?.findings ?? [],
                            })
                    }}>
                    <option value="">Uncharted</option>
                    {metadata.tooth_statuses.map(status => (
                        <option key={status} value={status}>
                            {status}
                        </option>
                    ))}
                </select>
            </label>
            <p className="text-xs text-clinic-muted">
                Uncharted records no presence or health assessment. Applying a
                finding to an uncharted tooth records it as present. Returning
                to uncharted omits it from this new snapshot; earlier revisions
                remain available.
            </p>
            <ul className="space-y-3" aria-label="Tooth findings">
                {(tooth?.findings ?? []).map((item, index) => (
                    <li
                        key={index}
                        className="rounded border border-clinic-line bg-clinic-canvas p-3 text-sm">
                        <p className="font-bold">
                            {item.code} · {item.status}
                        </p>
                        <p>{item.surfaces.join(', ') || 'Whole tooth'}</p>
                        {item.treatment_id && (
                            <p>
                                Treatment #{item.treatment_id}
                                {treatments.find(
                                    treatment =>
                                        treatment.id === item.treatment_id,
                                )?.name
                                    ? ` · ${
                                          treatments.find(
                                              treatment =>
                                                  treatment.id ===
                                                  item.treatment_id,
                                          ).name
                                      }`
                                    : ''}
                            </p>
                        )}
                        {item.note && (
                            <p className="whitespace-pre-wrap break-words">
                                {item.note}
                            </p>
                        )}
                        <div className="mt-2 flex gap-2">
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => {
                                    setFinding({
                                        ...item,
                                        surfaces: [...item.surfaces],
                                    })
                                    setEditing(index)
                                    setError('')
                                    onPendingChange(true)
                                }}>
                                Edit finding {index + 1}
                            </button>
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => {
                                    onChange({
                                        ...tooth,
                                        findings: tooth.findings.filter(
                                            (_, itemIndex) =>
                                                itemIndex !== index,
                                        ),
                                    })
                                    reset()
                                }}>
                                Remove finding {index + 1}
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
            <div className="space-y-4 border-t border-clinic-line pt-4">
                <h5 className="text-sm font-extrabold">
                    {editing < 0
                        ? 'Add finding'
                        : `Edit finding ${editing + 1}`}
                </h5>
                <label className="block text-sm font-bold">
                    Condition code
                    <input
                        aria-label="Condition code"
                        className={inputClass}
                        list="dental-condition-codes"
                        value={finding.code}
                        maxLength={50}
                        onChange={event => update({ code: event.target.value })}
                    />
                    <datalist id="dental-condition-codes">
                        {metadata.suggested_conditions.map(code => (
                            <option key={code} value={code} />
                        ))}
                    </datalist>
                </label>
                <label className="block text-sm font-bold">
                    Finding status
                    <select
                        aria-label="Finding status"
                        className={inputClass}
                        value={finding.status}
                        onChange={event =>
                            update({
                                status: event.target
                                    .value as DentalFinding['status'],
                            })
                        }>
                        {metadata.finding_statuses.map(status => (
                            <option key={status} value={status}>
                                {status}
                            </option>
                        ))}
                    </select>
                </label>
                <fieldset>
                    <legend className="text-sm font-bold">
                        Affected surfaces
                    </legend>
                    <p className="mt-1 text-xs text-clinic-muted">
                        Leave all surfaces unselected for a whole-tooth finding.
                        F is B (facial); P is L (palatal).
                    </p>
                    <div
                        className="my-3 grid w-48 grid-cols-3 gap-1"
                        aria-label="Surface selector">
                        {slots.map((surface, index) =>
                            surface ? (
                                <button
                                    type="button"
                                    key={surface}
                                    aria-label={`${surface} — ${metadata.surfaces[surface]}`}
                                    aria-pressed={finding.surfaces.includes(
                                        surface,
                                    )}
                                    className={`h-14 rounded-md border text-sm font-extrabold focus:ring-2 focus:ring-clinic-blue ${
                                        finding.surfaces.includes(surface)
                                            ? 'border-clinic-blue bg-clinic-blue text-white'
                                            : 'border-clinic-line bg-white text-clinic-ink'
                                    }`}
                                    onClick={() =>
                                        update({
                                            surfaces: finding.surfaces.includes(
                                                surface,
                                            )
                                                ? finding.surfaces.filter(
                                                      item => item !== surface,
                                                  )
                                                : [
                                                      ...finding.surfaces,
                                                      surface,
                                                  ],
                                        })
                                    }>
                                    {surface}
                                </button>
                            ) : (
                                <span key={index} aria-hidden="true" />
                            ),
                        )}
                    </div>
                    <p className="text-sm" role="status">
                        {finding.surfaces.length
                            ? `Selected: ${finding.surfaces.join(', ')}`
                            : 'Whole tooth'}
                    </p>
                </fieldset>
                <label className="block text-sm font-bold">
                    Treatment (optional)
                    <select
                        aria-label="Finding treatment"
                        className={inputClass}
                        disabled={!canLinkTreatment}
                        value={finding.treatment_id ?? ''}
                        onChange={event =>
                            update({
                                treatment_id: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                            })
                        }>
                        <option value="">No treatment link</option>
                        {finding.treatment_id &&
                            !treatments.some(
                                item => item.id === finding.treatment_id,
                            ) && (
                                <option value={finding.treatment_id}>
                                    Treatment #{finding.treatment_id} (existing
                                    link)
                                </option>
                            )}
                        {treatments.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                                {item.active ? '' : ' (inactive)'}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block text-sm font-bold">
                    Finding note (optional)
                    <textarea
                        aria-label="Finding note"
                        className={inputClass}
                        rows={3}
                        maxLength={1000}
                        value={finding.note ?? ''}
                        onChange={event => update({ note: event.target.value })}
                    />
                </label>
                {error && (
                    <p role="alert" className="text-sm text-red-700">
                        {error}
                    </p>
                )}
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={primaryClass}
                        onClick={apply}>
                        {editing < 0 ? 'Apply finding' : 'Update finding'}
                    </button>
                    <button
                        type="button"
                        className={buttonClass}
                        onClick={reset}>
                        Reset finding entry
                    </button>
                </div>
            </div>
            <span className="sr-only">{describeDentalTooth(tooth)}</span>
        </section>
    )
}
export default DentalToothEditor
