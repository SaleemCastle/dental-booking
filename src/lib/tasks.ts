import type { Task, TaskStatus } from '../services/tasks'

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
