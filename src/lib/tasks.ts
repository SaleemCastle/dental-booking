import type {
    Task,
    TaskPayload,
    TaskPriority,
    TaskStatus,
} from '../services/tasks'
import type { ApiFieldErrors } from './api'

export const taskPriorityLabels: Record<TaskPriority, string> = {
    low: 'Low',
    normal: 'Normal',
    high: 'High',
    urgent: 'Urgent',
}
export interface TaskValues {
    appointment_id: string
    assignee_id: string
    due_date: string
    priority: TaskPriority
    description: string
}
export const validateTask = (values: TaskValues): ApiFieldErrors => {
    const errors: ApiFieldErrors = {}
    const validId = (value: string) =>
        /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
    if (!validId(values.assignee_id))
        errors.assignee_id = ['Select an assignee.']
    if (values.appointment_id && !validId(values.appointment_id))
        errors.appointment_id = [
            'Select an appointment or leave the follow-up unlinked.',
        ]
    const date = new Date(`${values.due_date}T00:00:00Z`)
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(values.due_date) ||
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== values.due_date
    )
        errors.due_date = ['Enter a valid due date.']
    if (
        !Object.prototype.hasOwnProperty.call(
            taskPriorityLabels,
            values.priority,
        )
    )
        errors.priority = ['Select a priority.']
    if (!values.description.trim())
        errors.description = ['Enter a follow-up description.']
    else if (Array.from(values.description).length > 16000)
        errors.description = [
            'Descriptions must be 16,000 characters or fewer.',
        ]
    return errors
}
export const taskPayload = (
    patientId: number,
    values: TaskValues,
): TaskPayload => ({
    patient_id: patientId,
    appointment_id: values.appointment_id
        ? Number(values.appointment_id)
        : null,
    assignee_id: Number(values.assignee_id),
    due_date: values.due_date,
    priority: values.priority,
    description: values.description.trim(),
})

export type TaskDueFilter = 'all' | 'today' | 'overdue'
export const taskStatusLabels: Record<TaskStatus, string> = {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
}
export const isOpenTask = (task: Task) =>
    task.status === 'pending' || task.status === 'in_progress'

// Compare calendar dates directly. Date-only values must never shift to the
// browser's local day or be treated as a rolling 24-hour deadline.
export const taskDueState = (task: Task, today: string) => {
    if (!isOpenTask(task)) return 'closed'
    if (task.due_date < today) return 'overdue'
    if (task.due_date === today) return 'today'
    return 'upcoming'
}
export const taskMatchesFilters = (
    task: Task,
    due: TaskDueFilter,
    status: TaskStatus | '',
    today: string,
) =>
    (!status || task.status === status) &&
    (due === 'all' ||
        taskDueState(task, today) === (due === 'today' ? 'today' : 'overdue'))
