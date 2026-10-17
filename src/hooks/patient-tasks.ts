import { useRef, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import { useSWRConfig } from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError, normalizeAxiosError } from '../lib/api'
import { getUserPermissionSet } from '../lib/permissions'
import { isOpenTask } from '../lib/tasks'
import {
    Task,
    TaskPage,
    TaskPayload,
    completeTask,
    createTask,
    getTasks,
} from '../services/tasks'
import { dashboardSummaryKey } from '../services/dashboard'

export const usePatientTasks = (patientId: number) => {
    const { user, status } = useAuthSession()
    const permissions = getUserPermissionSet(
        status === 'authenticated' ? user : null,
    )
    const canView =
        permissions.has('tasks.view') && permissions.has('patients.view')
    const [createDenied, setCreateDenied] = useState(false)
    const [updateDenied, setUpdateDenied] = useState(false)
    const [pendingId, setPendingId] = useState<number | null>(null)
    const [actionError, setActionError] = useState<{
        id: number
        message: string
    } | null>(null)
    const [notice, setNotice] = useState('')
    const lock = useRef(false)
    const refreshFailed = useRef(false)
    const { mutate } = useSWRConfig()
    const feed = useSWRInfinite<TaskPage, ApiError>(
        (index, previous: TaskPage | null) =>
            !canView ||
            (previous && index >= Number(previous.meta.lastPage ?? 1))
                ? null
                : ['patient-tasks', user, patientId, index + 1],
        async (_key, _user, id, page) => {
            try {
                return await getTasks({ patient_id: id, page })
            } catch (error) {
                refreshFailed.current = true
                throw error
            }
        },
        {
            shouldRetryOnError: false,
            revalidateAll: true,
            revalidateOnMount: true,
        },
    )
    const canCreate =
        canView &&
        permissions.has('tasks.create') &&
        !createDenied &&
        !feed.error
    const canUpdate =
        canView &&
        permissions.has('tasks.update') &&
        !updateDenied &&
        !feed.error
    const pages =
        canView && feed.error?.statusCode !== 403 ? feed.data : undefined
    const tasks = Array.from(
        new Map(
            pages
                ?.flatMap(page => page.tasks)
                .filter(task => task.patient_id === patientId)
                .map(task => [task.id, task]),
        ).values(),
    ).sort(
        (a, b) =>
            (Date.parse(b.completed_at ?? b.created_at ?? '') || 0) -
                (Date.parse(a.completed_at ?? a.created_at ?? '') || 0) ||
            b.id - a.id,
    )
    const sync = async (saved: Task) => {
        await feed.mutate(current => {
            if (!current?.length)
                return [{ tasks: [saved], meta: { lastPage: 1 } }]
            const exists = current.some(page =>
                page.tasks.some(task => task.id === saved.id),
            )
            return current.map((page, index) => ({
                ...page,
                tasks: [
                    ...(index === 0 && !exists ? [saved] : []),
                    ...page.tasks.map(task =>
                        task.id === saved.id ? saved : task,
                    ),
                ],
            }))
        }, false)
        refreshFailed.current = false
        const results = await Promise.allSettled([
            feed.mutate(),
            ...(permissions.has('dashboard.view')
                ? [mutate(dashboardSummaryKey(user), undefined, true)]
                : []),
        ])
        return !refreshFailed.current && results[0].status === 'fulfilled'
    }
    const create = async (payload: TaskPayload) => {
        if (lock.current || !canCreate)
            throw new Error(
                'You cannot create follow-ups right now. Refresh and try again.',
            )
        lock.current = true
        setNotice('')
        setActionError(null)
        try {
            let saved: Task
            try {
                saved = await createTask({ ...payload, patient_id: patientId })
            } catch (error) {
                if (normalizeAxiosError(error).statusCode === 403)
                    setCreateDenied(true)
                throw error
            }
            const refreshed = await sync(saved)
            setNotice(
                refreshed
                    ? 'Follow-up created.'
                    : 'Follow-up created. Refresh failed; retry to check for other changes.',
            )
        } finally {
            lock.current = false
        }
    }
    const complete = async (task: Task) => {
        if (
            lock.current ||
            !canUpdate ||
            task.patient_id !== patientId ||
            !isOpenTask(task)
        )
            return
        lock.current = true
        setPendingId(task.id)
        setActionError(null)
        setNotice('')
        try {
            const saved = await completeTask(task.id)
            const refreshed = await sync(saved)
            setNotice(
                refreshed
                    ? 'Follow-up completed.'
                    : 'Follow-up completed. Refresh failed; retry to check for other changes.',
            )
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setActionError({
                id: task.id,
                message: [
                    failure.message,
                    ...Object.values(failure.errors).flat(),
                ]
                    .filter(Boolean)
                    .join(' '),
            })
            if (failure.statusCode === 403) setUpdateDenied(true)
            if ([404, 409, 422].includes(failure.statusCode))
                await feed.mutate().catch(() => undefined)
        } finally {
            lock.current = false
            setPendingId(null)
        }
    }
    return {
        canView,
        canCreate,
        canUpdate,
        tasks,
        notice,
        actionError,
        pendingId,
        error: canView ? feed.error : undefined,
        isLoading: canView && !pages && !feed.error,
        isValidating: feed.isValidating,
        hasMore: Boolean(
            pages?.length && pages.length < Number(pages[0].meta.lastPage),
        ),
        retry: () => (canView ? feed.mutate() : Promise.resolve()),
        loadMore: () =>
            canView ? feed.setSize(feed.size + 1) : Promise.resolve(),
        create,
        complete,
    }
}
