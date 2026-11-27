import { apiRequestWithSignal, PaginationMeta } from '../lib/api'

export interface InsuranceOptions {
    tenantId: number
    signal?: AbortSignal
}

export interface InsuranceRecord {
    id: number
    [key: string]: unknown
}

export interface InsurancePage<T> {
    records: T[]
    meta: PaginationMeta
}

const assertId = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 1)
        throw new Error('A valid record and clinic are required.')
}

const request = async <T>(
    options: InsuranceOptions,
    method: 'get' | 'post' | 'patch' | 'delete',
    url: string,
    data?: unknown,
    params?: Record<string, unknown>,
    idempotencyKey?: string,
) => {
    assertId(options.tenantId)
    return apiRequestWithSignal<T>(
        {
            method,
            url,
            data,
            params,
            headers: {
                'X-Tenant-Id': options.tenantId,
                ...(idempotencyKey
                    ? { 'Idempotency-Key': idempotencyKey }
                    : {}),
            },
        },
        options.signal,
    )
}

const list = async <T>(
    options: InsuranceOptions,
    url: string,
    params: Record<string, unknown> = {},
) => {
    const response = await request<T[]>(options, 'get', url, undefined, {
        page: 1,
        per_page: 15,
        ...params,
    })
    if (!Array.isArray(response.data))
        throw new Error('The insurance records could not be read.')
    return {
        records: response.data,
        meta: (response.meta?.pagination ?? response.meta ?? {}) as PaginationMeta,
    }
}

const object = <T>(value: unknown, key: string): T => {
    if (!value || typeof value !== 'object' || !(key in value))
        throw new Error('The insurance response could not be read.')
    return (value as Record<string, unknown>)[key] as T
}

const idPath = (base: string, id: number) => {
    assertId(id)
    return `${base}/${id}`
}

export const insuranceApi = {
    catalog: {
        insurers: (options: InsuranceOptions, params: Record<string, unknown> = {}) =>
            list<InsuranceRecord>(options, '/api/insurance/insurers', params),
        createInsurer: async (options: InsuranceOptions, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'post', '/api/insurance/insurers', input)).data,
                'insurer',
            ),
        updateInsurer: async (options: InsuranceOptions, id: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'patch', idPath('/api/insurance/insurers', id), input)).data,
                'insurer',
            ),
        archiveInsurer: (options: InsuranceOptions, id: number, expectedVersion: number) =>
            request(options, 'delete', idPath('/api/insurance/insurers', id), undefined, { expected_version: expectedVersion }),
        plans: (options: InsuranceOptions, insurerId: number, params: Record<string, unknown> = {}) =>
            list<InsuranceRecord>(options, `${idPath('/api/insurance/insurers', insurerId)}/plans`, params),
        createPlan: async (options: InsuranceOptions, insurerId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath('/api/insurance/insurers', insurerId)}/plans`, input)).data,
                'plan',
            ),
        updatePlan: async (options: InsuranceOptions, id: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'patch', idPath('/api/insurance/plans', id), input)).data,
                'plan',
            ),
        archivePlan: (options: InsuranceOptions, id: number, expectedVersion: number) =>
            request(options, 'delete', idPath('/api/insurance/plans', id), undefined, { expected_version: expectedVersion }),
        versions: (options: InsuranceOptions, planId: number, params: Record<string, unknown> = {}) =>
            list<InsuranceRecord>(options, `${idPath('/api/insurance/plans', planId)}/versions`, params),
        createVersion: async (options: InsuranceOptions, planId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath('/api/insurance/plans', planId)}/versions`, input)).data,
                'plan_version',
            ),
        updateVersion: async (options: InsuranceOptions, id: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'patch', idPath('/api/insurance/plan-versions', id), input)).data,
                'plan_version',
            ),
        withdrawVersion: (options: InsuranceOptions, id: number, expectedVersion: number) =>
            request(options, 'delete', idPath('/api/insurance/plan-versions', id), undefined, { expected_version: expectedVersion }),
        versionCommand: (options: InsuranceOptions, id: number, command: 'review' | 'publish', expectedVersion: number) =>
            request(options, 'post', `${idPath('/api/insurance/plan-versions', id)}/${command}`, { expected_version: expectedVersion }),
        planBenefits: (options: InsuranceOptions, versionId: number, params: Record<string, unknown> = {}) =>
            list<InsuranceRecord>(options, `${idPath('/api/insurance/plan-versions', versionId)}/benefits`, params),
        recordPlanBenefit: async (options: InsuranceOptions, versionId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath('/api/insurance/plan-versions', versionId)}/benefits`, input)).data,
                'benefit',
            ),
        planBenefitDetails: async (options: InsuranceOptions, versionId: number, benefitId: number) =>
            object<InsuranceRecord>(
                (await request(options, 'get', `${idPath('/api/insurance/plan-versions', versionId)}/benefits/${benefitId}/details`)).data,
                'details',
            ),
    },
    patient: {
        associations: (options: InsuranceOptions, patientId: number, params: Record<string, unknown> = {}) =>
            list<InsuranceRecord>(options, `${idPath('/api/patients', patientId)}/insurance-associations`, params),
        createAssociation: async (options: InsuranceOptions, patientId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath('/api/patients', patientId)}/insurance-associations`, input)).data,
                'association',
            ),
        updateAssociation: async (options: InsuranceOptions, patientId: number, associationId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'patch', `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}`, input)).data,
                'association',
            ),
        associationHistory: (options: InsuranceOptions, patientId: number, associationId: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/history`),
        policies: (options: InsuranceOptions, patientId: number, associationId: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/policy-revisions`),
        createPolicyRevision: async (options: InsuranceOptions, patientId: number, associationId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/policy-revisions`, input)).data,
                'revision',
            ),
        revealPolicy: async (options: InsuranceOptions, patientId: number, associationId: number, revisionId: number) =>
            object<InsuranceRecord>(
                (await request(options, 'get', `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/policy-revisions/${revisionId}/identifiers`)).data,
                'identifiers',
            ),
        checks: (options: InsuranceOptions, patientId: number, associationId: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/checks`),
        createCheck: async (options: InsuranceOptions, patientId: number, associationId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/checks`, input)).data,
                'check',
            ),
        revealCheck: async (options: InsuranceOptions, patientId: number, associationId: number, checkId: number) =>
            object<InsuranceRecord>(
                (await request(options, 'get', `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/checks/${checkId}/details`)).data,
                'details',
            ),
        benefits: (options: InsuranceOptions, patientId: number, associationId: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/benefits`),
        createBenefit: async (options: InsuranceOptions, patientId: number, associationId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/benefits`, input)).data,
                'benefit',
            ),
        benefitDetails: async (options: InsuranceOptions, patientId: number, associationId: number, benefitId: number) =>
            object<InsuranceRecord>(
                (await request(options, 'get', `${idPath(`/api/patients/${patientId}/insurance-associations`, associationId)}/benefits/${benefitId}/details`)).data,
                'details',
            ),
        estimates: (options: InsuranceOptions, patientId: number) =>
            list<InsuranceRecord>(options, `${idPath('/api/patients', patientId)}/insurance-estimates`, { latest_only: false, per_page: 100 }),
        documents: (options: InsuranceOptions, patientId: number) =>
            list<InsuranceRecord>(options, `${idPath('/api/patients', patientId)}/insurance-documents`, { per_page: 100 }),
    },
    claims: {
        list: (options: InsuranceOptions, patientId: number) =>
            list<InsuranceRecord>(options, `${idPath('/api/patients', patientId)}/insurance-claims`, { per_page: 100 }),
        create: async (options: InsuranceOptions, patientId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath('/api/patients', patientId)}/insurance-claims`, input)).data,
                'claim',
            ),
        show: async (options: InsuranceOptions, patientId: number, claimId: number) =>
            object<InsuranceRecord>(
                (await request(options, 'get', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}`)).data,
                'claim',
            ),
        update: async (options: InsuranceOptions, patientId: number, claimId: number, input: unknown) =>
            object<InsuranceRecord>(
                (await request(options, 'patch', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}`, input)).data,
                'claim',
            ),
        addLine: (options: InsuranceOptions, patientId: number, claimId: number, input: unknown) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/lines`, input),
        readiness: (options: InsuranceOptions, patientId: number, claimId: number, expectedVersion: number) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/readiness`, { expected_version: expectedVersion }),
        cancel: (options: InsuranceOptions, patientId: number, claimId: number, expectedVersion: number, reason: string) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/cancel`, { expected_version: expectedVersion, reason }),
        correct: async (options: InsuranceOptions, patientId: number, claimId: number, correctionReason: string) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/corrections`, { correction_reason: correctionReason })).data,
                'claim',
            ),
        submissions: (options: InsuranceOptions, patientId: number, claimId: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/submissions`),
        submit: (options: InsuranceOptions, patientId: number, claimId: number, input: unknown, key: string) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/submissions`, input, undefined, key),
        events: (options: InsuranceOptions, patientId: number, claimId: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/events`),
        responses: (options: InsuranceOptions, patientId: number, claimId: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/responses`),
        recordResponse: (options: InsuranceOptions, patientId: number, claimId: number, input: unknown) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/responses`, input),
        appeals: (options: InsuranceOptions, patientId: number, claimId: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/appeals`),
        createAppeal: (options: InsuranceOptions, patientId: number, claimId: number, input: unknown) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/appeals`, input),
        submitAppeal: (options: InsuranceOptions, patientId: number, claimId: number, appealId: number, input: unknown) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/appeals/${appealId}/submissions`, input),
        recordAppealResponse: (options: InsuranceOptions, patientId: number, claimId: number, appealId: number, input: unknown) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/appeals/${appealId}/responses`, input),
        withdrawAppeal: (options: InsuranceOptions, patientId: number, claimId: number, appealId: number) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-claims`, claimId)}/appeals/${appealId}/withdraw`, {}),
    },
    authorizations: {
        list: (options: InsuranceOptions, patientId: number) =>
            list<InsuranceRecord>(options, `${idPath('/api/patients', patientId)}/insurance-prior-authorizations`, { per_page: 100 }),
        create: async (options: InsuranceOptions, patientId: number, input: unknown, key: string) =>
            object<InsuranceRecord>(
                (await request(options, 'post', `${idPath('/api/patients', patientId)}/insurance-prior-authorizations`, input, undefined, key)).data,
                'authorization',
            ),
        show: async (options: InsuranceOptions, patientId: number, id: number) =>
            object<InsuranceRecord>(
                (await request(options, 'get', `${idPath(`/api/patients/${patientId}/insurance-prior-authorizations`, id)}`)).data,
                'authorization',
            ),
        update: (options: InsuranceOptions, patientId: number, id: number, input: unknown) =>
            request(options, 'patch', `${idPath(`/api/patients/${patientId}/insurance-prior-authorizations`, id)}`, input),
        recordRequest: (options: InsuranceOptions, patientId: number, id: number, input: unknown) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-prior-authorizations`, id)}/requests`, input),
        decision: (options: InsuranceOptions, patientId: number, id: number, input: unknown) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-prior-authorizations`, id)}/decisions`, input),
        linkClaim: (options: InsuranceOptions, patientId: number, id: number, claimId: number) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-prior-authorizations`, id)}/claim`, { claim_id: claimId }),
        cancel: (options: InsuranceOptions, patientId: number, id: number, expectedVersion: number, reason: string) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-prior-authorizations`, id)}/cancel`, { expected_version: expectedVersion, reason }),
        expire: (options: InsuranceOptions, patientId: number, id: number) =>
            request(options, 'post', `${idPath(`/api/patients/${patientId}/insurance-prior-authorizations`, id)}/expire`, {}),
        history: (options: InsuranceOptions, patientId: number, id: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-prior-authorizations`, id)}/history`),
        evidence: (options: InsuranceOptions, patientId: number, id: number) =>
            list<InsuranceRecord>(options, `${idPath(`/api/patients/${patientId}/insurance-prior-authorizations`, id)}/evidence`),
    },
    remittances: {
        list: (options: InsuranceOptions, params: Record<string, unknown> = {}) =>
            list<InsuranceRecord>(options, '/api/insurance/remittances', params),
        create: (options: InsuranceOptions, input: unknown, key: string) =>
            request(options, 'post', '/api/insurance/remittances', input, undefined, key),
        show: (options: InsuranceOptions, id: number) =>
            request(options, 'get', idPath('/api/insurance/remittances', id)),
        lines: (options: InsuranceOptions, id: number) =>
            list<InsuranceRecord>(options, `${idPath('/api/insurance/remittances', id)}/lines`, { per_page: 100 }),
        correct: (options: InsuranceOptions, id: number, input: unknown, key: string) =>
            request(options, 'post', `${idPath('/api/insurance/remittances', id)}/corrections`, input, undefined, key),
    },
    receipts: {
        list: (options: InsuranceOptions, params: Record<string, unknown> = {}) =>
            list<InsuranceRecord>(options, '/api/insurance/receipts', params),
        create: (options: InsuranceOptions, input: unknown, key: string) =>
            request(options, 'post', '/api/insurance/receipts', input, undefined, key),
        show: (options: InsuranceOptions, id: number) =>
            request(options, 'get', idPath('/api/insurance/receipts', id)),
        verify: (options: InsuranceOptions, id: number, input: unknown) =>
            request(options, 'post', `${idPath('/api/insurance/receipts', id)}/verification`, input),
    },
    obligations: {
        list: (options: InsuranceOptions, params: Record<string, unknown> = {}) =>
            list<InsuranceRecord>(options, '/api/insurance/obligations', params),
        create: (options: InsuranceOptions, input: unknown, key: string) =>
            request(options, 'post', '/api/insurance/obligations', input, undefined, key),
        show: (options: InsuranceOptions, id: number) =>
            request(options, 'get', idPath('/api/insurance/obligations', id)),
        approve: (options: InsuranceOptions, id: number, approvalReason: string, key: string) =>
            request(options, 'post', `${idPath('/api/insurance/obligations', id)}/approve`, { approval_reason: approvalReason }, undefined, key),
    },
    report: (options: InsuranceOptions, dateFrom: string, dateTo: string) =>
        request<InsuranceRecord>(options, 'get', '/api/reports/insurance', undefined, { date_from: dateFrom, date_to: dateTo }),
}
