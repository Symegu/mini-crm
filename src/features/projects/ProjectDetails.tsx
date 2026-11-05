import { Building2, Plus } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import { TaskTable } from '../tasks/TaskTable';
import type { Project, Task } from '../../types';

interface ProjectDetailsProps {
	project: Project;
	tasks: Task[];
	canManage: boolean;
	onBack: () => void;
	onEdit: () => void;
	onArchive: () => void;
	onCreateTask: () => void;
	onOpenTask: (task: Task) => void;
}

export function ProjectDetails({
	project,
	tasks,
	canManage,
	onBack,
	onEdit,
	onArchive,
	onCreateTask,
	onOpenTask,
}: ProjectDetailsProps) {
	return (
		<section className="content">
			<button type="button" className="back-link" onClick={onBack}>← Все объекты</button>

			<div className="project-banner">
				<div className="project-icon"><Building2 size={23} /></div>
				<div className="project-banner-info">
					<span className="eyebrow">Объект</span>
					<h2>{project.name}</h2>
					<p>{project.address}</p>
				</div>
				{canManage && (
					<div className="inline-actions push">
						<button type="button" className="secondary" onClick={onEdit}>Изменить</button>
						<button type="button" className="danger-ghost" onClick={onArchive}>Удалить</button>
					</div>
				)}
			</div>

			<div className="section-title">
				<div>
					<span className="eyebrow">Рабочий процесс</span>
					<h2>Задачи объекта <span className="sub-count">{tasks.length}</span></h2>
				</div>
				{canManage && (
					<button type="button" className="primary" onClick={onCreateTask}>
						<Plus size={17} /> Новая задача
					</button>
				)}
			</div>

			{tasks.length > 0
				? <TaskTable tasks={tasks} onOpen={onOpenTask} />
				: <EmptyState>В этом объекте пока нет задач.</EmptyState>}
		</section>
	);
}
