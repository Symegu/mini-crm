import type { FormEvent } from 'react';
import type { Profile, Project, Task } from '../../types';

interface TaskFormProps {
	task: Task | null;
	projects: Project[];
	executors: Profile[];
	defaultProjectId?: string;
	busy: boolean;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onCancel: () => void;
}

export function TaskForm({
	task,
	projects,
	executors,
	defaultProjectId,
	busy,
	onSubmit,
	onCancel,
}: TaskFormProps) {
	return (
		<form onSubmit={onSubmit}>
			<label>
				Название задачи
				<input name="title" defaultValue={task?.title ?? ''} required maxLength={200} placeholder="Проверить монтаж перекрытий" />
			</label>
			<label>
				Описание
				<textarea name="description" defaultValue={task?.description ?? ''} rows={4} placeholder="Детали и ожидаемый результат" />
			</label>
			<label>
				Объект
				<select name="project_id" defaultValue={task?.project_id ?? defaultProjectId ?? ''} required>
					<option value="" disabled>Выберите объект</option>
					{projects.map((project) => (
						<option key={project.id} value={project.id}>{project.name}</option>
					))}
				</select>
			</label>
			<label>
				Исполнитель
				<select name="assignee_id" defaultValue={task?.assignee_id ?? ''} required>
					<option value="" disabled>Выберите исполнителя</option>
					{executors.map((executor) => (
						<option key={executor.id} value={executor.id}>{executor.full_name}</option>
					))}
				</select>
			</label>
			<div className="modal-actions">
				<button type="button" className="secondary" onClick={onCancel}>Отмена</button>
				<button className="primary" type="submit" disabled={busy}>
					{busy ? 'Сохранение…' : 'Сохранить'}
				</button>
			</div>
		</form>
	);
}
