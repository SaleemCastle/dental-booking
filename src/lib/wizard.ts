export interface WizardStepDefinition {
    id: string
    fields: string[]
}

export type WizardFieldErrors = Record<string, string[]>

export const getWizardStepForFieldError = (
    steps: WizardStepDefinition[],
    errors: WizardFieldErrors,
) => {
    const errorFields = Object.keys(errors)

    return steps.findIndex(step =>
        step.fields.some(field => errorFields.includes(field)),
    )
}

export const hasWizardStepErrors = (
    step: WizardStepDefinition,
    errors: WizardFieldErrors,
) => step.fields.some(field => Boolean(errors[field]?.length))

export const isWizardStepComplete = (
    step: WizardStepDefinition,
    values: Record<string, unknown>,
    requiredFields: string[],
) =>
    requiredFields
        .filter(field => step.fields.includes(field))
        .every(field => {
            const value = values[field]

            return typeof value === 'string'
                ? value.trim().length > 0
                : value != null
        })
