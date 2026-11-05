import type { FormEvent } from 'react';
import { Modal } from '../../components/common/Modal';
import { ProjectForm } from '../projects/ProjectForm';
import { TaskForm } from '../tasks/TaskForm';
import type {
	ModalType,
	Profile,
	Project,
	Task,
} from '../../types';

interface CrmModalsProps {
	modal: ModalType;
	editingProject: Project | null;
	editingTask: Task | null;
	selectedProject: Project | null;
	projects: Project[];
	people: Profile[];
	busy: boolean;
	onClose: () => void;
	onSaveProject: (event: FormEvent<HTMLFormElement>) => void;
	onSaveTask: (event: FormEvent<HTMLFormElement>) => void;
}

export function CrmModals({
	modal,
	editingProject,
	editingTask,
	selectedProject,
	projects,
	people,
	busy,
	onClose,
	onSaveProject,
	onSaveTask,
}: CrmModalsProps) {
	if (!modal) return null;

	return (
		<Modal
			eyebrow={
				modal === 'project'
					? 'Управление объектами'
					: 'Управление задачами'
			}
			title={
				modal === 'project'
					? editingProject
						? 'Редактировать объект'
						: 'Новый объект'
					: editingTask
						? 'Редактировать задачу'
						: 'Новая задача'
			}
			onClose={onClose}
		>
			{modal === 'project' ? (
				<ProjectForm
					project={editingProject}
					busy={busy}
					onSubmit={onSaveProject}
					onCancel={onClose}
				/>
			) : (
				<TaskForm
					task={editingTask}
					projects={projects}
					executors={people.filter(
						(person) => person.role === 'executor',
					)}
					defaultProjectId={selectedProject?.id}
					busy={busy}
					onSubmit={onSaveTask}
					onCancel={onClose}
				/>
			)}
		</Modal>
	);
}