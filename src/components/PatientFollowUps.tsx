import React, { useState } from 'react'
import { usePatientTasks } from '../hooks/patient-tasks'
import { utcToday } from '../lib/appointment-workflow'
import { formatNoteDate } from '../lib/clinical-notes'
import {
    isOpenTask,
    taskDueState,
    taskPriorityLabels,
    taskStatusLabels,
} from '../lib/tasks'
import FollowUpForm from './FollowUpForm'
import {
    appointmentButtonClass as buttonClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'

const PatientFollowUps = ({ patient }: { patient: Patient }) => {
    const feed = usePatientTasks(patient.id)
    const [creating, setCreating] = useState(false)
    const today = utcToday()
    return (
        <section
            aria-label="Patient follow-ups"
            className="border-t border-clinic-line pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-extrabold text-clinic-ink">
                        Follow-ups &amp; tasks
                    </h3>
                    <p className="mt-1 text-xs text-clinic-muted">
                        Patient timeline · completed follow-ups stay in this
                        history
                    </p>
                </div>
                {feed.canView && (
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={feed.isValidating || feed.pendingId !== null}
                        onClick={() =>
                            void feed.retry().catch(() => undefined)
                        }>
                        Refresh follow-ups
                    </button>
                )}
                {feed.canCreate && (
                    <button
                        type="button"
                        className={primaryClass}
                        disabled={feed.pendingId !== null}
                        onClick={() => setCreating(true)}>
                        Create follow-up
                    </button>
                )}
            </div>
            {!feed.canView ? (
                <p role="status" className="mt-4 text-sm text-clinic-muted">
                    You do not have permission to view follow-ups.
                </p>
            ) : (
                <>
                    {!feed.canCreate && !feed.canUpdate && !feed.error && (
                        <p className="mt-3 text-xs text-clinic-muted">
                            Read-only. Creating or completing follow-ups
                            requires task permissions.
                        </p>
                    )}
                    {feed.notice && (
                        <p
                            role="status"
                            className="mt-3 text-sm text-clinic-ink">
                            {feed.notice}
                        </p>
                    )}
                    {feed.isLoading && (
                        <p
                            role="status"
                            className="mt-4 text-sm text-clinic-muted">
                            Loading follow-ups...
                        </p>
                    )}
                    {feed.error && (
                        <div role="alert" className="mt-4 text-sm text-red-700">
                            {feed.error.statusCode === 403
                                ? 'You do not have permission to view follow-ups.'
                                : `Follow-ups could not be refreshed. ${feed.error.message}`}{' '}
                            <button
                                type="button"
                                className={`${buttonClass} mt-2`}
                                disabled={feed.isValidating}
                                onClick={() =>
                                    void feed.retry().catch(() => undefined)
                                }>
                                Retry follow-ups
                            </button>
                        </div>
                    )}
                    {feed.actionError && (
                        <p role="alert" className="mt-3 text-sm text-red-700">
                            Follow-up #{feed.actionError.id}:{' '}
                            {feed.actionError.message}
                        </p>
                    )}
                    {!feed.isLoading && !feed.error && !feed.tasks.length && (
                        <p className="mt-4 text-sm text-clinic-muted">
                            No follow-ups for this patient yet.
                        </p>
                    )}
                    {feed.error?.statusCode !== 403 && (
                        <ol
                            aria-label="Patient follow-up timeline"
                            className="mt-4 space-y-4">
                            {feed.tasks.map(task => {
                                const dueState = taskDueState(task, today)
                                return (
                                    <li
                                        key={task.id}
                                        className="rounded-md border border-clinic-line bg-clinic-canvas/40 p-4">
                                        <article
                                            aria-label={`Follow-up ${task.id}`}>
                                            <div className="flex flex-wrap gap-2 text-xs font-bold">
                                                <span
                                                    className={`rounded px-2 py-1 ${
                                                        task.status ===
                                                        'completed'
                                                            ? 'bg-clinic-mint text-emerald-700'
                                                            : 'bg-clinic-sky text-clinic-blue'
                                                    }`}>
                                                    {
                                                        taskStatusLabels[
                                                            task.status
                                                        ]
                                                    }
                                                </span>
                                                <span className="rounded bg-white px-2 py-1 text-clinic-ink">
                                                    {
                                                        taskPriorityLabels[
                                                            task.priority
                                                        ]
                                                    }{' '}
                                                    priority
                                                </span>
                                                {(dueState === 'overdue' ||
                                                    dueState === 'today') && (
                                                    <span className="rounded bg-clinic-rose px-2 py-1 text-rose-700">
                                                        {dueState === 'overdue'
                                                            ? 'Overdue'
                                                            : 'Due today'}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-clinic-ink">
                                                {task.description}
                                            </p>
                                            <p className="mt-2 text-xs text-clinic-muted">
                                                Assigned to{' '}
                                                {task.assigneeName ??
                                                    `Staff #${task.assignee_id}`}{' '}
                                                · Due {task.due_date} (UTC)
                                            </p>
                                            <p className="mt-1 text-xs text-clinic-muted">
                                                {task.appointment_id == null
                                                    ? 'Patient-level follow-up'
                                                    : `Appointment #${task.appointment_id}`}
                                                {task.appointmentStartsAt &&
                                                task.appointment_id != null
                                                    ? ` · ${formatNoteDate(
                                                          task.appointmentStartsAt,
                                                      )}`
                                                    : ''}
                                            </p>
                                            <p className="mt-2 text-xs text-clinic-muted">
                                                {task.status === 'completed'
                                                    ? `Completed ${formatNoteDate(
                                                          task.completed_at,
                                                      )}`
                                                    : `Created ${formatNoteDate(
                                                          task.created_at,
                                                      )}`}
                                            </p>
                                            {feed.canUpdate &&
                                                isOpenTask(task) && (
                                                    <button
                                                        type="button"
                                                        aria-label={`Complete follow-up ${task.id}`}
                                                        className={`${buttonClass} mt-3`}
                                                        disabled={
                                                            feed.pendingId !==
                                                                null || creating
                                                        }
                                                        onClick={() =>
                                                            void feed.complete(
                                                                task,
                                                            )
                                                        }>
                                                        {feed.pendingId ===
                                                        task.id
                                                            ? 'Completing...'
                                                            : 'Mark complete'}
                                                    </button>
                                                )}
                                        </article>
                                    </li>
                                )
                            })}
                        </ol>
                    )}
                    {feed.hasMore && feed.error?.statusCode !== 403 && (
                        <button
                            type="button"
                            className={`${buttonClass} mt-4 w-full`}
                            disabled={
                                feed.isValidating || feed.pendingId !== null
                            }
                            onClick={() =>
                                void feed.loadMore().catch(() => undefined)
                            }>
                            {feed.isValidating
                                ? 'Loading follow-ups...'
                                : 'Load more follow-ups'}
                        </button>
                    )}
                </>
            )}
            {creating && (
                <FollowUpForm
                    patient={patient}
                    canCreate={feed.canCreate}
                    onClose={() => setCreating(false)}
                    onSave={async payload => {
                        await feed.create(payload)
                        setCreating(false)
                    }}
                />
            )}
        </section>
    )
}
export default PatientFollowUps
