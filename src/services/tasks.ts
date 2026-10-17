import { apiClient, PaginationMeta } from '../lib/api'

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export interface Task {
    id: number
    patient_id: number | null
    appointment_id: number | null
    assignee_id: number
    due_date: string
    priority: TaskPriority
    status: TaskStatus
    description: string
    patientName: string | null
    assigneeName: string | null
    appointmentStartsAt: string | null
    is_overdue: boolean
    completed_at: string | null
    created_at: string | null
    updated_at: string | null
}
export interface TaskListFilters {
    assigned_to_me?: boolean
    overdue?: boolean
    due_today?: boolean
    patient_id?: number
    status?: TaskStatus
    page?: number
    per_page?: number
}
export interface TaskPage {
    tasks: Task[]
    meta: PaginationMeta
}
export interface TaskPayload {
    patient_id: number
    appointment_id: number | null
    assignee_id: number
    due_date: string
    priority: TaskPriority
    description: string
}
export interface TaskAssignee {
    id: number
    name: string
}
export const getTaskAssignees = async (): Promise<TaskAssignee[]> => {
    const data = await apiClient.getData<{ users: TaskAssignee[] }>(
        '/api/users',
    )
    // Keep only the directory fields needed by the task form in its cache.
    return data.users.map(({ id, name }) => ({ id, name }))
}
export const createTask = async (payload: TaskPayload): Promise<Task> =>
    (await apiClient.postData<{ task: Task }>('/api/tasks', payload)).task

export const getTasks = async ({
    assigned_to_me,
    overdue,
    due_today,
    patient_id,
    status,
    page = 1,
    per_page = 15,
}: TaskListFilters = {}): Promise<TaskPage> => {
    const toggles = Object.fromEntries(
        Object.entries({ assigned_to_me, overdue, due_today })
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, value ? 1 : 0]),
    )
    const response = await apiClient.get<{ tasks: Task[] }>('/api/tasks', {
        params: { ...toggles, patient_id, status, page, per_page },
    })
    const envelope = response.meta as PaginationMeta & {
        pagination?: PaginationMeta
    }
    return {
        tasks: response.data.tasks,
        meta: envelope?.pagination ?? envelope ?? {},
    }
}
export const completeTask = async (id: number) =>
    (
        await apiClient.patchData<{ task: Task }>(`/api/tasks/${id}/status`, {
            status: 'completed',
        })
    ).task
