import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError, normalizeAxiosError } from '../lib/api'
import type { AuthUser } from '../lib/auth-session'
import { canViewAuditLogs } from '../lib/permissions'
import { emptyAuditFilters } from '../lib/audit-logs'
import {
    AuditFilters,
    getAuditLogs,
    getAuditFilterOptions,
    getAuditLog,
} from '../services/audit-logs'

// Audit responses deliberately stay outside SWR's shared cache. Every read owns
// its AbortController and discards results after a key/user/access change.
const useAuditRead = <T>(
    enabled: boolean,
    user: AuthUser | null,
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    onError: (error: ApiError) => void,
) => {
    const [revision, setRevision] = useState(0)
    const requestKey = `${key}:${revision}`
    const active = useRef({ enabled, user, requestKey, load, onError })
    active.current = { enabled, user, requestKey, load, onError }
    const [result, setResult] = useState<{
        user: AuthUser
        key: string
        data?: T
        error?: ApiError
        loading: boolean
        retryAt?: number
    } | null>(null)
    useEffect(() => {
        if (!enabled) {
            setResult(null)
            return
        }
        const controller = new AbortController()
        const current = () =>
            !controller.signal.aborted &&
            active.current.enabled &&
            active.current.user === user &&
            active.current.requestKey === requestKey
        setResult({ user, key: requestKey, loading: true })
        void active.current
            .load(controller.signal)
            .then(data => {
                if (current())
                    setResult({ user, key: requestKey, data, loading: false })
            })
            .catch(error => {
                if (!current() || error?.name === 'AbortError') return
                const failure = normalizeAxiosError(error)
                setResult({
                    user,
                    key: requestKey,
                    error: failure,
                    loading: false,
                    retryAt:
                        failure.statusCode === 429
                            ? Date.now() + 30000
                            : undefined,
                })
                active.current.onError(failure)
            })
        return () => controller.abort()
    }, [enabled, user, requestKey])
    const visible =
        enabled && result?.user === user && result.key === requestKey
            ? result
            : undefined
    useEffect(() => {
        if (!visible?.retryAt) return
        const timer = setTimeout(
            () =>
                setResult(current =>
                    current === result
                        ? { ...current, retryAt: undefined }
                        : current,
                ),
            Math.max(0, visible.retryAt - Date.now()),
        )
        return () => clearTimeout(timer)
    }, [visible?.retryAt, result])
    return {
        data: visible?.data,
        error: visible?.error,
        isLoading: enabled && (!visible || visible.loading),
        rateLimited: Boolean(visible?.retryAt && visible.retryAt > Date.now()),
        retry: () => {
            if (enabled && !(visible?.retryAt > Date.now()))
                setRevision(value => value + 1)
        },
    }
}

export const useAuditLogs = () => {
    const { user, status, refreshSession, clearSession } = useAuthSession()
    const permitted = status === 'authenticated' && canViewAuditLogs(user)
    const [deniedFor, setDeniedFor] = useState<AuthUser | null>(null)
    const [query, setQuery] = useState(() => ({
        owner: user,
        filters: emptyAuditFilters(),
        page: 1,
        revision: 0,
    }))
    const [selection, setSelection] = useState<{
        owner: AuthUser
        id: number
    } | null>(null)
    const canView = permitted && deniedFor !== user
    const filters = query.owner === user ? query.filters : emptyAuditFilters()
    const page = query.owner === user ? query.page : 1
    const selectedId = selection?.owner === user ? selection.id : null
    useEffect(() => {
        setQuery({
            owner: user,
            filters: emptyAuditFilters(),
            page: 1,
            revision: 0,
        })
        setSelection(null)
        setDeniedFor(null)
    }, [user])
    const handleError = useCallback(
        (error: ApiError) => {
            if (error.statusCode === 401 || error.statusCode === 403) {
                setDeniedFor(user)
                setSelection(null)
                setQuery({
                    owner: user,
                    filters: emptyAuditFilters(),
                    page: 1,
                    revision: 0,
                })
                if (error.statusCode === 401)
                    void clearSession().catch(() => undefined)
                else void refreshSession().catch(() => undefined)
            }
        },
        [user, clearSession, refreshSession],
    )
    const list = useAuditRead(
        canView,
        user,
        JSON.stringify([
            filters,
            page,
            query.owner === user ? query.revision : 0,
        ]),
        signal => getAuditLogs(user, filters, page, signal),
        handleError,
    )
    const options = useAuditRead(
        canView,
        user,
        'filter-options',
        signal => getAuditFilterOptions(user, signal),
        handleError,
    )
    const detail = useAuditRead(
        canView && selectedId !== null,
        user,
        String(selectedId),
        signal => getAuditLog(user, selectedId, signal),
        handleError,
    )
    const rateLimited =
        list.rateLimited || options.rateLimited || detail.rateLimited
    return {
        canView,
        session: user,
        filters,
        page,
        selectedId,
        rateLimited,
        records: canView ? list.data?.auditLogs : undefined,
        meta: canView ? list.data?.meta : undefined,
        error: canView ? list.error : undefined,
        isLoading: list.isLoading,
        options: canView ? options.data : undefined,
        optionsError: canView ? options.error : undefined,
        optionsLoading: options.isLoading,
        detail: canView ? detail.data : undefined,
        detailError: canView ? detail.error : undefined,
        detailLoading: detail.isLoading,
        retryOptions: () => {
            if (!rateLimited) options.retry()
        },
        retryDetail: () => {
            if (!rateLimited) detail.retry()
        },
        applyFilters: (next: AuditFilters) => {
            if (canView && !rateLimited)
                setQuery(current => ({
                    owner: user,
                    filters: next,
                    page: 1,
                    revision: current.revision,
                }))
        },
        changePage: (next: number) => {
            if (canView && !rateLimited)
                setQuery(current => ({
                    ...current,
                    owner: user,
                    page: Math.max(1, next),
                }))
        },
        retry: () => {
            if (canView && !rateLimited)
                setQuery(current => ({
                    ...current,
                    owner: user,
                    page: 1,
                    revision: current.revision + 1,
                }))
        },
        openDetail: (id: number) => {
            if (canView && !rateLimited) setSelection({ owner: user, id })
        },
        closeDetail: () => setSelection(null),
    }
}
