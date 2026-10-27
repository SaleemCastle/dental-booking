import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError } from '../lib/api'
import { getBillingPermissions, getUserPermissionSet } from '../lib/permissions'
import {
    DashboardSummary,
    dashboardSummaryKey,
    getDashboardSummary,
} from '../services/dashboard'

export const useDashboardSummary = () => {
    const { user, status } = useAuthSession()
    const canView =
        status === 'authenticated' &&
        getUserPermissionSet(user).has('dashboard.view')
    const { data, error, isValidating, mutate } = useSWR<
        DashboardSummary,
        ApiError
    >(
        canView ? dashboardSummaryKey(user) : null,
        () => getDashboardSummary(getBillingPermissions(user).canViewInvoices),
        {
            shouldRetryOnError: false,
            refreshInterval: 30000,
            refreshWhenHidden: false,
            refreshWhenOffline: false,
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
            revalidateIfStale: true,
        },
    )
    return {
        canView,
        summary: canView && !error ? data : undefined,
        error: canView ? error : undefined,
        isLoading: canView && !data && !error,
        isValidating,
        retry: mutate,
    }
}
