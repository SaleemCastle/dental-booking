import React from 'react'
import type { AssignedTaskWorklist } from '../hooks/tasks'
import {
    isOpenTask,
    taskDueState,
    taskStatusLabels,
    TaskDueFilter,
} from '../lib/tasks'
import { formatNoteDate } from '../lib/clinical-notes'
import type { TaskStatus } from '../services/tasks'
import {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'

const AssignedTasks = ({
    worklist,
    onOpenPatient,
    onOpenAppointment,
}: {
    worklist: AssignedTaskWorklist
    onOpenPatient?: (id: number) => void
    onOpenAppointment: (id: number) => void
}) => {
    const {
        canView,
        canUpdate,
        tasks,
        error,
        isLoading,
        isValidating,
        pendingId,
        actionError,
        notice,
        meta,
        today,
    } = worklist
    const busy = pendingId !== null
    const filtered = worklist.due !== 'all' || Boolean(worklist.taskStatus)
    return (
        <section
            aria-label="Assigned tasks"
            className="mt-6 rounded-md border border-clinic-line bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-clinic-line p-5">
                <div>
                    <h2 className="text-lg font-extrabold text-clinic-ink">
                        My tasks
                    </h2>
                    <p className="mt-1 text-xs text-clinic-muted">
                        Assigned to you · {today} · Due dates use UTC
                    </p>
                </div>
                {canView && (
                    <button
                        type="button"
                        disabled={isValidating || busy}
                        className={buttonClass}
                        onClick={() =>
                            void worklist.retry().catch(() => undefined)
                        }>
                        {isValidating ? 'Refreshing tasks…' : 'Refresh tasks'}
                    </button>
                )}
            </div>
            {!canView ? (
                <p role="status" className="p-5 text-sm text-clinic-muted">
                    You do not have permission to view tasks.
                </p>
            ) : (
                <div className="space-y-4 p-5">
                    <div className="flex flex-wrap items-end gap-3">
                        <label
                            className="text-xs font-bold text-clinic-muted"
                            htmlFor="task-due-filter">
                            Due date
                            <select
                                id="task-due-filter"
                                className={inputClass}
                                disabled={busy}
                                value={worklist.due}
                                onChange={event =>
                                    worklist.changeFilters(
                                        event.target.value as TaskDueFilter,
                                        worklist.taskStatus,
                                    )
                                }>
                                <option value="all">All due dates</option>
                                <option value="today">Due today</option>
                                <option value="overdue">Overdue</option>
                            </select>
                        </label>
                        <label
                            className="text-xs font-bold text-clinic-muted"
                            htmlFor="task-status-filter">
                            Status
                            <select
                                id="task-status-filter"
                                className={inputClass}
                                disabled={busy}
                                value={worklist.taskStatus}
                                onChange={event =>
                                    worklist.changeFilters(
                                        worklist.due,
                                        event.target.value as TaskStatus | '',
                                    )
                                }>
                                <option value="">All statuses</option>
                                {Object.entries(taskStatusLabels).map(
                                    ([status, label]) => (
                                        <option key={status} value={status}>
                                            {label}
                                        </option>
                                    ),
                                )}
                            </select>
                        </label>
                        {filtered && (
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy}
                                onClick={() =>
                                    worklist.changeFilters('all', '')
                                }>
                                Clear task filters
                            </button>
                        )}
                    </div>
                    {!canUpdate && !error && (
                        <p className="text-xs text-clinic-muted">
                            Read-only. Task update permission is required to
                            complete work.
                        </p>
                    )}
                    {notice && (
                        <p
                            role="status"
                            className="rounded-md bg-clinic-mint p-3 text-sm text-clinic-ink">
                            {notice}
                        </p>
                    )}
                    {isLoading && (
                        <p role="status" className="text-sm text-clinic-muted">
                            Loading assigned tasks…
                        </p>
                    )}
                    {error && (
                        <div role="alert" className="text-sm text-red-700">
                            <p>
                                {error.statusCode === 403
                                    ? 'You do not have permission to view tasks.'
                                    : `Tasks could not be refreshed. ${error.message}`}
                            </p>
                            <button
                                type="button"
                                disabled={isValidating || busy}
                                className={`${buttonClass} mt-2`}
                                onClick={() =>
                                    void worklist.retry().catch(() => undefined)
                                }>
                                Retry tasks
                            </button>
                        </div>
                    )}
                    {actionError && (
                        <p role="alert" className="text-sm text-red-700">
                            Task #{actionError.id}: {actionError.message}
                        </p>
                    )}
                    {!isLoading && !error && tasks?.length === 0 && (
                        <p className="text-sm text-clinic-muted">
                            {filtered
                                ? 'No assigned tasks match these filters.'
                                : 'No tasks assigned to you.'}
                        </p>
                    )}
                    {tasks && (
                        <ul
                            aria-label="Task worklist"
                            className="grid gap-4 lg:grid-cols-2">
                            {tasks.map(task => {
                                const dueState = taskDueState(task, today)
                                return (
                                    <li
                                        key={task.id}
                                        className={`rounded-md border p-4 ${
                                            dueState === 'overdue'
                                                ? 'border-rose-200 bg-clinic-rose/20'
                                                : 'border-clinic-line'
                                        }`}>
                                        <article aria-label={`Task ${task.id}`}>
                                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                                <span
                                                    className={`rounded px-2 py-1 ${
                                                        task.status ===
                                                        'completed'
                                                            ? 'bg-clinic-mint text-emerald-700'
                                                            : 'bg-clinic-canvas text-clinic-muted'
                                                    }`}>
                                                    {
                                                        taskStatusLabels[
                                                            task.status
                                                        ]
                                                    }
                                                </span>
                                                <span
                                                    className={
                                                        task.priority ===
                                                            'urgent' ||
                                                        task.priority === 'high'
                                                            ? 'text-rose-700'
                                                            : 'text-clinic-muted'
                                                    }>
                                                    {task.priority
                                                        .charAt(0)
                                                        .toUpperCase() +
                                                        task.priority.slice(
                                                            1,
                                                        )}{' '}
                                                    priority
                                                </span>
                                                {dueState === 'overdue' && (
                                                    <span className="rounded bg-clinic-rose px-2 py-1 text-rose-700">
                                                        Overdue
                                                    </span>
                                                )}
                                                {dueState === 'today' && (
                                                    <span className="rounded bg-clinic-amber px-2 py-1 text-amber-800">
                                                        Due today
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold text-clinic-ink">
                                                {task.description}
                                            </p>
                                            <p className="mt-2 text-xs text-clinic-muted">
                                                Due {task.due_date} · Assigned
                                                to {task.assigneeName ?? 'you'}
                                            </p>
                                            {task.patient_id == null &&
                                                task.appointment_id == null && (
                                                    <p className="mt-2 text-xs text-clinic-muted">
                                                        General task
                                                    </p>
                                                )}
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                {task.patient_id != null &&
                                                    (worklist.canViewPatients &&
                                                    onOpenPatient ? (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            className={
                                                                buttonClass
                                                            }
                                                            aria-label={`Open patient ${task.patient_id} for task ${task.id}`}
                                                            onClick={() =>
                                                                onOpenPatient(
                                                                    task.patient_id,
                                                                )
                                                            }>
                                                            {task.patientName ??
                                                                `Patient #${task.patient_id}`}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-clinic-muted">
                                                            {task.patientName ??
                                                                `Patient #${task.patient_id}`}{' '}
                                                            · Patient access
                                                            required
                                                        </span>
                                                    ))}
                                                {task.appointment_id != null &&
                                                    (worklist.canViewAppointments ? (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            className={
                                                                buttonClass
                                                            }
                                                            aria-label={`Open appointment ${task.appointment_id} for task ${task.id}`}
                                                            onClick={() =>
                                                                onOpenAppointment(
                                                                    task.appointment_id,
                                                                )
                                                            }>
                                                            Appointment #
                                                            {
                                                                task.appointment_id
                                                            }
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-clinic-muted">
                                                            Appointment #
                                                            {
                                                                task.appointment_id
                                                            }{' '}
                                                            · Appointment access
                                                            required
                                                        </span>
                                                    ))}
                                            </div>
                                            {task.appointmentStartsAt && (
                                                <p className="mt-2 text-xs text-clinic-muted">
                                                    Visit:{' '}
                                                    {formatNoteDate(
                                                        task.appointmentStartsAt,
                                                    )}
                                                </p>
                                            )}
                                            {task.status === 'completed' &&
                                                task.completed_at && (
                                                    <p className="mt-2 text-xs text-clinic-muted">
                                                        Completed{' '}
                                                        {formatNoteDate(
                                                            task.completed_at,
                                                        )}
                                                    </p>
                                                )}
                                            {canUpdate && isOpenTask(task) && (
                                                <button
                                                    type="button"
                                                    className={`${primaryClass} mt-3`}
                                                    disabled={
                                                        busy || isValidating
                                                    }
                                                    aria-label={`Complete task ${task.id}`}
                                                    onClick={() =>
                                                        void worklist.complete(
                                                            task,
                                                        )
                                                    }>
                                                    {pendingId === task.id
                                                        ? 'Completing…'
                                                        : 'Mark complete'}
                                                </button>
                                            )}
                                        </article>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                    {meta && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-clinic-line pt-4 text-xs text-clinic-muted">
                            <span>
                                Page {worklist.page} of {meta.lastPage ?? 1}
                                {typeof meta.total === 'number'
                                    ? ` · ${meta.total} assigned tasks`
                                    : ''}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={
                                        busy ||
                                        isValidating ||
                                        worklist.page <= 1
                                    }
                                    onClick={() =>
                                        worklist.changePage(worklist.page - 1)
                                    }>
                                    Previous tasks
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass}
                                    disabled={
                                        busy ||
                                        isValidating ||
                                        worklist.page >=
                                            Number(meta.lastPage ?? 1)
                                    }
                                    onClick={() =>
                                        worklist.changePage(worklist.page + 1)
                                    }>
                                    Next tasks
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    )
}
export default AssignedTasks
