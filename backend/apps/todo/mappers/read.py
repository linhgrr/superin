"""Mappings from todo persistence models to response schemas."""

from apps.todo.models import RecurringRule, SubTask, Task
from apps.todo.schemas import TodoRecurringRuleRead, TodoSubTaskRead, TodoTaskRead


def task_to_read(task: Task) -> TodoTaskRead:
    return TodoTaskRead(
        id=str(task.id),
        title=task.title,
        description=task.description,
        due_date=task.due_date,
        due_time=task.due_time,
        reminder_minutes=task.reminder_minutes,
        priority=task.priority,
        status=task.status,
        tags=task.tags,
        is_archived=task.is_archived,
        parent_task_id=str(task.parent_task_id) if task.parent_task_id else None,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )


def subtask_to_read(subtask: SubTask) -> TodoSubTaskRead:
    return TodoSubTaskRead(
        id=str(subtask.id),
        parent_task_id=str(subtask.parent_task_id),
        title=subtask.title,
        completed=subtask.completed,
        created_at=subtask.created_at,
        completed_at=subtask.completed_at,
    )


def recurring_rule_to_read(rule: RecurringRule) -> TodoRecurringRuleRead:
    return TodoRecurringRuleRead(
        id=str(rule.id),
        task_template_id=str(rule.task_template_id),
        frequency=rule.frequency,
        interval=rule.interval,
        days_of_week=rule.days_of_week,
        end_date=rule.end_date,
        max_occurrences=rule.max_occurrences,
        occurrence_count=rule.occurrence_count,
        is_active=rule.is_active,
        last_generated_date=rule.last_generated_date,
        created_at=rule.created_at,
    )
