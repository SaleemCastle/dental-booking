import { useEffect, useRef, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError, normalizeAxiosError } from '../lib/api'
import { getReportingPermissions } from '../lib/permissions'
import { ReportFilters, ReportKind } from '../lib/reporting'
import { getReport, ReportResult } from '../services/reporting'

// Private report results stay in component memory, outside the shared SWR cache.
export const useReport = (
    kind: ReportKind,
    filters: ReportFilters,
    page: number,
    perPage: number,
) => {
    const { user, status, currentTenant } = useAuthSession()
    const access = getReportingPermissions(user)
    const enabled =
        status === 'authenticated' && Boolean(currentTenant) && access[kind]
    const [revision, setRevision] = useState(0)
    const key = JSON.stringify([
        kind,
        filters,
        page,
        perPage,
        currentTenant?.id,
        access,
        revision,
    ])
    const active = useRef({ user, key, enabled })
    active.current = { user, key, enabled }
    const [result, setResult] = useState<{
        owner: typeof user
        key: string
        data?: ReportResult<ReportKind>
        error?: ApiError
    } | null>(null)
    useEffect(() => {
        if (!enabled) {
            setResult(null)
            return
        }
        const controller = new AbortController()
        setResult(null)
        const current = () =>
            !controller.signal.aborted &&
            active.current.enabled &&
            active.current.user === user &&
            active.current.key === key
        void getReport(kind, filters, {
            tenantId: currentTenant.id,
            page,
            perPage,
            signal: controller.signal,
        })
            .then(data => {
                if (current()) setResult({ owner: user, key, data })
            })
            .catch(error => {
                if (current() && error?.name !== 'AbortError')
                    setResult({
                        owner: user,
                        key,
                        error: normalizeAxiosError(error),
                    })
            })
        return () => controller.abort()
        // key includes every query value and permission; owner comparison blocks stale sessions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, user, key])
    const visible =
        enabled && result?.owner === user && result.key === key
            ? result
            : undefined
    return {
        data: visible?.data,
        error: visible?.error,
        isLoading: enabled && !visible,
        retry: () => setRevision(value => value + 1),
    }
}
