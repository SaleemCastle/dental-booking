import useSWR, { useSWRConfig } from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError } from '../lib/api'
import { getUserPermissionSet } from '../lib/permissions'
import { getTreatments, Treatment } from '../services/treatments'

export const useTreatments = (active?: boolean) => {
    const { user, status } = useAuthSession()
    const { mutate } = useSWRConfig()
    const permissions = getUserPermissionSet(user)
    const canView =
        status === 'authenticated' && permissions.has('treatments.view')
    // Include the session identity and permissions to isolate cached catalogs.
    const listKey = (filter?: boolean) => [
        'treatments',
        user,
        filter === undefined ? 'all' : filter ? 'active' : 'inactive',
    ]
    const { data, error, isValidating, mutate: retry } = useSWR<
        Treatment[],
        ApiError
    >(canView ? listKey(active) : null, () => getTreatments(active), {
        shouldRetryOnError: false,
    })

    return {
        treatments: canView ? data : undefined,
        error: canView ? error : undefined,
        isLoading: canView && !data && !error,
        isValidating,
        canView,
        canCreate: canView && permissions.has('treatments.create'),
        canUpdate: canView && permissions.has('treatments.update'),
        canDeactivate: canView && permissions.has('treatments.delete'),
        retry,
        refreshLists: (changed: Treatment) =>
            Promise.allSettled(
                [undefined, true, false].map(filter =>
                    mutate(
                        listKey(filter),
                        (current?: Treatment[]) => {
                            if (!current) return current

                            const next = current.filter(
                                item => item.id !== changed.id,
                            )
                            if (
                                filter === undefined ||
                                changed.active === filter
                            ) {
                                next.push(changed)
                            }
                            return next.sort(
                                (a, b) =>
                                    a.name.localeCompare(b.name) || a.id - b.id,
                            )
                        },
                        true,
                    ),
                ),
            ),
    }
}
