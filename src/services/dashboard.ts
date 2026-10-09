import { apiClient } from '../lib/api'

type DashboardTone = 'sky' | 'amber' | 'mint' | 'rose'

export interface DashboardMetric {
    label: string
    value: string
    detail: string
    tone: DashboardTone
}

export interface DashboardAppointment {
    id: number
    time: string
    patient: string
    treatment: string
    status: string
    statusTone: DashboardTone
}

interface BackendDashboardAppointment {
    id: number
    appointment_date_time?: string
    appointment_type?: string
    description?: string
    status?: string
    patientName?: string
    treatmentName?: string | null
    startsAt?: string
    appointmentStatus?: string
    paymentStatus?: string
}

interface BackendStaffWorklistItem {
    dentistId: number
    dentistName: string
    scheduled: number
    checkedIn: number
    completed: number
}

interface BackendDashboardSummary {
    bookedToday: number
    waitingRoom: number
    treatmentsDone: number
    unpaidInvoiceAmount: number
    collectionRate: number
    todayAppointments: BackendDashboardAppointment[]
    staffWorklist: BackendStaffWorklistItem[]
}

export interface DashboardSummary {
    bookedToday: number
    waitingRoom: number
    treatmentsDone: number
    unpaidInvoiceAmount: number
    collectionRate: number
    metrics: DashboardMetric[]
    todayAppointments: DashboardAppointment[]
    staffWorklist: string[]
}

const toneClasses: Record<DashboardTone, string> = {
    sky: 'bg-clinic-sky text-clinic-blue',
    amber: 'bg-clinic-amber text-amber-700',
    mint: 'bg-clinic-mint text-emerald-700',
    rose: 'bg-clinic-rose text-rose-700',
}

export const getDashboardToneClass = (tone: DashboardTone) =>
    toneClasses[tone] ?? toneClasses.sky

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(value)

const formatTime = (dateTime?: string) => {
    if (!dateTime) {
        return '--:--'
    }

    const date = new Date(dateTime)

    if (Number.isNaN(date.getTime())) {
        return dateTime
    }

    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
}

const formatStatus = (status?: string, paymentStatus?: string) => {
    if (
        status === 'completed' &&
        (paymentStatus === 'unpaid' || paymentStatus === 'partial')
    ) {
        return 'Payment due'
    }

    switch (status) {
        case 'checked_in':
            return 'Checked in'
        case 'in_progress':
            return 'In progress'
        case 'completed':
            return 'Finished'
        case 'cancelled':
            return 'Cancelled'
        case 'no_show':
            return 'No show'
        case 'scheduled':
            return 'Scheduled'
        default:
            return 'Scheduled'
    }
}

const getAppointmentTone = (
    status?: string,
    paymentStatus?: string,
): DashboardTone => {
    if (
        status === 'completed' &&
        (paymentStatus === 'unpaid' || paymentStatus === 'partial')
    ) {
        return 'rose'
    }

    switch (status) {
        case 'completed':
            return 'mint'
        case 'checked_in':
        case 'in_progress':
            return 'sky'
        case 'cancelled':
        case 'no_show':
            return 'rose'
        case 'scheduled':
        default:
            return 'amber'
    }
}

const buildMetrics = (summary: BackendDashboardSummary): DashboardMetric[] => [
    {
        label: 'Booked today',
        value: summary.bookedToday.toString().padStart(2, '0'),
        detail: `${summary.bookedToday} appointments today`,
        tone: 'sky',
    },
    {
        label: 'Waiting room',
        value: summary.waitingRoom.toString().padStart(2, '0'),
        detail: `${summary.waitingRoom} patients checked in`,
        tone: 'amber',
    },
    {
        label: 'Treatments done',
        value: summary.treatmentsDone.toString().padStart(2, '0'),
        detail: `${summary.treatmentsDone} completed today`,
        tone: 'mint',
    },
    {
        label: 'Unpaid invoices',
        value: formatCurrency(summary.unpaidInvoiceAmount),
        detail: 'Open balance',
        tone: 'rose',
    },
]

const formatStaffWorklist = (item: BackendStaffWorklistItem) =>
    `${item.dentistName}: ${item.scheduled} scheduled, ${item.checkedIn} checked in, ${item.completed} completed`

const normalizeDashboardSummary = (
    summary: BackendDashboardSummary,
): DashboardSummary => ({
    ...summary,
    metrics: buildMetrics(summary),
    todayAppointments: summary.todayAppointments.map(appointment => {
        const appointmentStatus =
            appointment.appointmentStatus ?? appointment.status
        const startsAt =
            appointment.startsAt ?? appointment.appointment_date_time

        return {
            id: appointment.id,
            time: formatTime(startsAt),
            patient: appointment.patientName ?? 'Unknown patient',
            treatment:
                appointment.treatmentName ??
                appointment.appointment_type ??
                appointment.description ??
                'Treatment',
            status: formatStatus(appointmentStatus, appointment.paymentStatus),
            statusTone: getAppointmentTone(
                appointmentStatus,
                appointment.paymentStatus,
            ),
        }
    }),
    staffWorklist: summary.staffWorklist.map(formatStaffWorklist),
})

export const getDashboardSummary = async () => {
    const summary = await apiClient.getData<BackendDashboardSummary>(
        '/api/dashboard/summary',
    )

    return normalizeDashboardSummary(summary)
}
