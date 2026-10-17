import { useEffect, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError, normalizeAxiosError } from '../lib/api'
import { getUserPermissionSet } from '../lib/permissions'
import { utcToday } from '../lib/appointment-workflow'
import { TaskDueFilter, isOpenTask, taskMatchesFilters } from '../lib/tasks'
import {
    Task,
    TaskPage,
    TaskStatus,
    completeTask,
    getTasks,
} from '../services/tasks'
import { dashboardSummaryKey } from '../services/dashboard'

export const useAssignedTasks = (enabled = true) => {
    const { user, status } = useAuthSession()
    const permissions = getUserPermissionSet(user)
    const canView =
        enabled && status === 'authenticated' && permissions.has('tasks.view')
    const canUpdate = canView && permissions.has('tasks.update')
    const [due, setDue] = useState<TaskDueFilter>('all')
    const [taskStatus, setTaskStatus] = useState<TaskStatus | ''>('')
    const [page, setPage] = useState(1)
    const [pendingId, setPendingId] = useState<number | null>(null)
    const [actionError, setActionError] = useState<{
        id: number
        message: string
    } | null>(null)
    const [notice, setNotice] = useState('')
    const [forbidden, setForbidden] = useState(false)
    const lock = useRef(false)
    const refreshFailed = useRef(false)
    const today = utcToday()
    const { mutate } = useSWRConfig()
    const list = useSWR<TaskPage, ApiError>(
        canView ? ['assigned-tasks', user, due, taskStatus, page, today] : null,
        async () => {
            try {
                return await getTasks({
                    assigned_to_me: true,
                    overdue: due === 'overdue' ? true : undefined,
                    due_today: due === 'today' ? true : undefined,
                    status: taskStatus || undefined,
                    page,
                })
            } catch (error) {
                refreshFailed.current = true
                throw error
            }
        },
        {
            shouldRetryOnError: false,
            refreshInterval: 30000,
            refreshWhenHidden: false,
            refreshWhenOffline: false,
            revalidateOnMount: true,
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
        },
    )
    useEffect(() => {
        if (list.data?.meta.lastPage && page > Number(list.data.meta.lastPage))
            setPage(Math.max(1, Number(list.data.meta.lastPage)))
    }, [list.data, page])
    const changeFilters = (
        nextDue: TaskDueFilter,
        nextStatus: TaskStatus | '',
    ) => {
        if (lock.current) return
        setDue(nextDue)
        setTaskStatus(nextStatus)
        setPage(1)
        setActionError(null)
        setNotice('')
    }
    const complete = async (task: Task) => {
        if (
            lock.current ||
            !canUpdate ||
            forbidden ||
            list.error ||
            !isOpenTask(task)
        )
            return
        lock.current = true
        setPendingId(task.id)
        setActionError(null)
        setNotice('')
        try {
            const saved = await completeTask(task.id)
            await list.mutate(
                current =>
                    current
                        ? {
                              ...current,
                              tasks: current.tasks.flatMap(item =>
                                  item.id !== saved.id
                                      ? [item]
                                      : taskMatchesFilters(
                                            saved,
                                            due,
                                            taskStatus,
                                            utcToday(),
                                        )
                                      ? [saved]
                                      : [],
                              ),
                          }
                        : current,
                false,
            )
            refreshFailed.current = false
            await Promise.allSettled([
                list.mutate(),
                ...(permissions.has('dashboard.view')
                    ? [mutate(dashboardSummaryKey(user), undefined, true)]
                    : []),
            ])
            setNotice(
                refreshFailed.current
                    ? 'Task completed. Worklist refresh failed; retry to check for other changes.'
                    : 'Task completed.',
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
            if (failure.statusCode === 403) setForbidden(true)
            // Refresh changed/deleted records without claiming the write succeeded.
            if ([404, 409, 422].includes(failure.statusCode))
                await list.mutate()
        } finally {
            lock.current = false
            setPendingId(null)
        }
    }
    return {
        canView,
        canUpdate: canUpdate && !forbidden && !list.error,
        canViewPatients: permissions.has('patients.view'),
        canViewAppointments: permissions.has('appointments.view'),
        tasks:
            canView && list.error?.statusCode !== 403
                ? list.data?.tasks
                : undefined,
        meta:
            canView && list.error?.statusCode !== 403
                ? list.data?.meta
                : undefined,
        error: canView ? list.error : undefined,
        isLoading: canView && !list.data && !list.error,
        isValidating: list.isValidating,
        today,
        due,
        taskStatus,
        page,
        pendingId,
        actionError,
        notice,
        changeFilters,
        changePage: (next: number) => {
            if (!lock.current) {
                setPage(next)
                setActionError(null)
                setNotice('')
            }
        },
        retry: () => (canView ? list.mutate() : Promise.resolve()),
        complete,
    }
}
export type AssignedTaskWorklist = ReturnType<typeof useAssignedTasks>
