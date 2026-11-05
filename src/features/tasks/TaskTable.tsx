import { ChevronRight } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatDateTime } from '../../lib/format';
import type { Task } from '../../types';

interface TaskTableProps {
	tasks: Task[];
	onOpen: (task: Task) => void;
}

export function TaskTable({ tasks, onOpen }: TaskTableProps) {
	if (tasks.length === 0) {
		return <EmptyState>Задач пока нет.</EmptyState>;
	}

	return (
		<div className="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">Задача</th>
						<th scope="col">Объект</th>
						<th scope="col">Исполнитель</th>
						<th scope="col">Статус</th>
						<th scope="col">Создана</th>
						<th scope="col"><span className="visually-hidden">Открыть</span></th>
					</tr>
				</thead>
				<tbody>
					{tasks.map((task) => (
						<tr key={task.id}>
							<td>
								<button type="button" className="table-row-trigger" onClick={() => onOpen(task)}>
									<strong className="task-name">{task.title}</strong>
									<small>{task.description || 'Без описания'}</small>
								</button>
							</td>
							<td>{task.projects?.name || '—'}</td>
							<td>{task.assignee?.full_name || '—'}</td>
							<td><StatusBadge status={task.status} /></td>
							<td>{formatDateTime(task.created_at)}</td>
							<td><ChevronRight size={17} className="muted-icon" /></td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
