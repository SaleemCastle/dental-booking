import type {
    DentalChartMetadata,
    DentalFinding,
    DentalPosition,
    DentalTooth,
    ToothNumbering,
    ToothSurface,
} from '../services/dental-charts'

export const toothLabel = (position: DentalPosition, system: ToothNumbering) =>
    system === 'fdi' ? position.fdi : position.tooth

// Patient's right is on the viewer's left, in both jaws. Metadata supplies all IDs.
export const dentalArches = (positions: DentalPosition[]) => {
    const ordered = (quadrants: number[]) =>
        quadrants.flatMap((quadrant, index) =>
            positions
                .filter(position => Number(position.fdi[0]) === quadrant)
                .sort((a, b) =>
                    index === 0
                        ? Number(b.fdi) - Number(a.fdi)
                        : Number(a.fdi) - Number(b.fdi),
                ),
        )
    const primary = positions.some(position => Number(position.fdi[0]) >= 5)
    return [
        ordered(primary ? [5, 6] : [1, 2]),
        ordered(primary ? [8, 7] : [4, 3]),
    ]
}

export const canonicalSurfaces = (surfaces: string[]): ToothSurface[] =>
    surfaces
        .map(
            surface =>
                (({ F: 'B', P: 'L' }[surface] ?? surface) as ToothSurface),
        )
        .sort()

export const validateDentalFinding = (
    finding: DentalFinding,
    position: DentalPosition,
    existing: DentalFinding[],
    editingIndex = -1,
) => {
    if (!/^[a-z][a-z0-9_]{0,49}$/.test(finding.code))
        return 'Use a condition code starting with a lowercase letter, followed by lowercase letters, numbers or underscores (maximum 50 characters).'
    if (!['active', 'resolved'].includes(finding.status))
        return 'Select an active or resolved finding status.'
    const surfaces = canonicalSurfaces(finding.surfaces)
    if (
        surfaces.length > 5 ||
        new Set(surfaces).size !== surfaces.length ||
        surfaces.some(surface => !position.surfaces.includes(surface))
    )
        return 'Select distinct surfaces allowed for this tooth.'
    if (Array.from(finding.note ?? '').length > 1000)
        return 'Finding notes must be 1,000 characters or fewer.'
    if (
        finding.treatment_id != null &&
        (!Number.isSafeInteger(finding.treatment_id) ||
            finding.treatment_id <= 0)
    )
        return 'Select a valid treatment.'
    if (editingIndex < 0 && existing.length >= 20)
        return 'A tooth can have up to 20 findings.'
    if (
        existing.some(
            (item, index) =>
                index !== editingIndex &&
                item.code === finding.code &&
                canonicalSurfaces(item.surfaces).join(',') ===
                    surfaces.join(','),
        )
    )
        return 'This condition and surface set is already recorded on this tooth.'
    return ''
}

export const validateDentalSnapshot = (
    teeth: DentalTooth[],
    metadata: DentalChartMetadata,
    dentition: 'adult' | 'primary',
) => {
    const positions = metadata.dentitions[dentition]
    if (teeth.length > positions.length)
        return 'Too many teeth for this dentition.'
    if (new Set(teeth.map(tooth => tooth.tooth)).size !== teeth.length)
        return 'Each tooth can be charted only once.'
    for (const tooth of teeth) {
        const position = positions.find(
            position => position.fdi === tooth.tooth,
        )
        if (!position || !metadata.tooth_statuses.includes(tooth.status))
            return 'Select valid teeth and presence statuses.'
        if (tooth.findings.length > 20)
            return 'A tooth can have up to 20 findings.'
        for (let index = 0; index < tooth.findings.length; index++) {
            const error = validateDentalFinding(
                tooth.findings[index],
                position,
                tooth.findings,
                index,
            )
            if (error) return error
        }
    }
    return ''
}

export const cloneDentalTeeth = (teeth: DentalTooth[]): DentalTooth[] =>
    JSON.parse(JSON.stringify(teeth))

export const replaceDentalTooth = (
    teeth: DentalTooth[],
    id: string,
    next?: DentalTooth,
) =>
    [
        ...teeth.filter(tooth => tooth.tooth !== id),
        ...(next ? [next] : []),
    ].sort((a, b) => Number(a.tooth) - Number(b.tooth))

const signature = (tooth?: DentalTooth) =>
    tooth
        ? JSON.stringify({
              status: tooth.status,
              findings: tooth.findings
                  .map(finding => ({
                      code: finding.code,
                      status: finding.status,
                      surfaces: canonicalSurfaces(finding.surfaces),
                      note: finding.note ?? null,
                      treatment_id: finding.treatment_id ?? null,
                  }))
                  .sort((a, b) =>
                      JSON.stringify(a).localeCompare(JSON.stringify(b)),
                  ),
          })
        : 'uncharted'

// Three-way merge: preserve remote changes on teeth the local draft did not edit.
// Conflicting tooth observations always require a deliberate choice.
export const reconcileDentalTeeth = (
    base: DentalTooth[],
    local: DentalTooth[],
    latest: DentalTooth[],
    choices: Record<string, 'local' | 'latest'> = {},
) => {
    const ids = Array.from(
        new Set([...base, ...local, ...latest].map(tooth => tooth.tooth)),
    ).sort()
    const conflicts: string[] = []
    const teeth: DentalTooth[] = []
    ids.forEach(id => {
        const original = base.find(tooth => tooth.tooth === id)
        const mine = local.find(tooth => tooth.tooth === id)
        const theirs = latest.find(tooth => tooth.tooth === id)
        let selected: DentalTooth | undefined
        if (signature(mine) === signature(original)) selected = theirs
        else if (
            signature(theirs) === signature(original) ||
            signature(mine) === signature(theirs)
        )
            selected = mine
        else {
            conflicts.push(id)
            if (!choices[id]) return
            selected = choices[id] === 'local' ? mine : theirs
        }
        if (selected) teeth.push(selected)
    })
    return {
        teeth: cloneDentalTeeth(teeth),
        conflicts,
        unresolved: conflicts.filter(id => !choices[id]),
    }
}

export const findingColor = (finding: DentalFinding) =>
    finding.status === 'resolved'
        ? '#64748b'
        : finding.code === 'caries'
        ? '#be123c'
        : finding.code === 'restored'
        ? '#2563eb'
        : '#b45309'

export const describeDentalTooth = (tooth?: DentalTooth) =>
    !tooth
        ? 'Uncharted'
        : `${tooth.status}${
              tooth.findings.length
                  ? ': ' +
                    tooth.findings
                        .map(
                            finding =>
                                `${finding.code} (${finding.status}; ${
                                    finding.surfaces.join(', ') || 'whole tooth'
                                })${
                                    finding.treatment_id
                                        ? `; treatment #${finding.treatment_id}`
                                        : ''
                                }${finding.note ? `; ${finding.note}` : ''}`,
                        )
                        .join('; ')
                  : ', no findings recorded'
          }`
