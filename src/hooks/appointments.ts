import useSWR, { useSWRConfig } from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError } from '../lib/api'
import { getUserPermissionSet } from '../lib/permissions'
import { sortAppointments } from '../lib/appointment-workflow'
import {
    Appointment,
    getAppointments,
    getAppointment,
} from '../services/appointments'
import { dashboardSummaryKey } from '../services/dashboard'

export const useAppointmentPermissions = () => {
    const { user, status } = useAuthSession()
    const permissions = getUserPermissionSet(user)
    const canView =
        status === 'authenticated' && permissions.has('appointments.view')
    return {
        user,
        canView,
        canCreate: canView && permissions.has('appointments.create'),
        canUpdate: canView && permissions.has('appointments.update'),
    }
}
export const useAppointments = (date: string) => {
    const access = useAppointmentPermissions()
    const syncAppointment = useAppointmentMutationSync(date)
    const key = (day: string) => ['appointments', access.user, day]
    const list = useSWR<Appointment[], ApiError>(
        access.canView ? key(date) : null,
        () => getAppointments(date),
        { shouldRetryOnError: false },
    )
    return {
        ...access,
        appointments: access.canView ? list.data : undefined,
        error: access.canView ? list.error : undefined,
        isLoading: access.canView && !list.data && !list.error,
        isValidating: list.isValidating,
        retry: list.mutate,
        syncAppointment,
    }
}

export const useAppointmentMutationSync = (date?: string) => {
    const { user } = useAuthSession()
    const { mutate } = useSWRConfig()
    return async (saved: Appointment, previous?: Appointment | null) => {
        const days = Array.from(
            new Set(
                [
                    date,
                    saved.startsAt.slice(0, 10),
                    previous?.startsAt.slice(0, 10),
                ].filter(Boolean),
            ),
        )
        await Promise.allSettled([
            mutate(['appointment', user, saved.id], saved, false),
            ...(getUserPermissionSet(user).has('dashboard.view')
                ? [mutate(dashboardSummaryKey(user), undefined, true)]
                : []),
            ...days.map(day =>
                mutate(
                    ['appointments', user, day],
                    (current?: Appointment[]) => {
                        if (!current) return current
                        const next = current.filter(
                            item => item.id !== saved.id,
                        )
                        if (saved.startsAt.slice(0, 10) === day)
                            next.push(saved)
                        return sortAppointments(next)
                    },
                    true,
                ),
            ),
        ])
    }
}
export const useAppointment = (id: number) => {
    const access = useAppointmentPermissions()
    const detail = useSWR<Appointment, ApiError>(
        access.canView ? ['appointment', access.user, id] : null,
        () => getAppointment(id),
        { shouldRetryOnError: false },
    )
    return { ...access, ...detail }
}
