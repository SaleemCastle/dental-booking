const range = (start, end) =>
    Array.from(
        { length: Math.abs(end - start) + 1 },
        (_, index) => start + index * (end > start ? 1 : -1),
    )
const ids = {
    adult: [
        ...range(18, 11),
        ...range(21, 28),
        ...range(38, 31),
        ...range(41, 48),
    ],
    primary: [
        ...range(55, 51),
        ...range(61, 65),
        ...range(75, 71),
        ...range(81, 85),
    ],
}
const metadata = {
    numbering_system: 'universal',
    numbering_systems: ['universal', 'fdi'],
    dentitions: Object.fromEntries(
        Object.entries(ids).map(([dentition, positions]) => [
            dentition,
            positions.map((fdi, index) => ({
                tooth:
                    dentition === 'adult'
                        ? String(index + 1)
                        : String.fromCharCode(65 + index),
                fdi: String(fdi),
                surfaces: ['M', 'D', 'B', 'L', fdi % 10 <= 3 ? 'I' : 'O'],
            })),
        ]),
    ),
    tooth_statuses: ['present', 'missing', 'extracted', 'unerupted'],
    finding_statuses: ['active', 'resolved'],
    surfaces: {
        M: 'Mesial',
        D: 'Distal',
        B: 'Buccal/facial',
        L: 'Lingual/palatal',
        O: 'Occlusal',
        I: 'Incisal',
    },
    surface_aliases: { F: 'B', P: 'L' },
    suggested_conditions: [
        'caries',
        'restored',
        'fracture',
        'sealant',
        'crown',
        'implant',
    ],
    custom_condition_codes: true,
}
const emptyChart = (patient_id = 4, dentition = 'adult') => ({
    id: null,
    patient_id,
    dentition,
    numbering_system: 'fdi',
    version: 0,
    dentist_id: null,
    author_user_id: null,
    clinical_note_id: null,
    recorded_at: null,
    reason: null,
    teeth: [],
})
const finding = (code = 'caries', surfaces = ['M', 'O']) => ({
    code,
    status: 'active',
    surfaces,
    note: null,
    treatment_id: null,
})
const tooth = (tooth = '16', findings = [finding()], status = 'present') => ({
    tooth,
    status,
    findings,
})
module.exports = { metadata, emptyChart, finding, tooth }
