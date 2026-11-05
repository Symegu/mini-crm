import { ProjectsPage } from '../projects/ProjectsPage';
import { ProjectDetails } from '../projects/ProjectDetails';
import { TaskDetails } from '../tasks/TaskDetails';
import { MyTasksPage } from '../tasks/MyTasksPage';
import { getAvailableActions } from '../tasks/taskPermissions';
import { AdminUsersPage } from '../admin/AdminUsersPage';
import type {
	AppView,
	HistoryItem,
	Profile,
	Project,
	Task,
	TaskStatus,
} from '../../types';

interface CrmContentProps {
	profile: Profile;
	view: AppView;
	projects: Project[];
	tasks: Task[];
	people: Profile[];
	selectedProject: Project | null;
	selectedTask: Task | null;
	history: HistoryItem[];
	comment: string;
	search: string;
	busy: boolean;
	onNotice: (message: string) => void;
	onError: (message: string) => void;
	onCommentChange: (value: string) => void;
	onTransition: (status: TaskStatus) => void;
	onEditTask: () => void;
	onArchiveTask: () => void;
	onBackFromTask: () => void;
	onBackFromProject: () => void;
	onEditProject: () => void;
	onArchiveProject: () => void;
	onCreateTask: () => void;
	onOpenTask: (task: Task) => void;
	onOpenProject: (project: Project) => void;
	onSearchChange: (value: string) => void;
	onCreateProject: () => void;
}

export function CrmContent({
	profile,
	view,
	projects,
	tasks,
	people,
	selectedProject,
	selectedTask,
	history,
	comment,
	search,
	busy,
	onNotice,
	onError,
	onCommentChange,
	onTransition,
	onEditTask,
	onArchiveTask,
	onBackFromTask,
	onBackFromProject,
	onEditProject,
	onArchiveProject,
	onCreateTask,
	onOpenTask,
	onOpenProject,
	onSearchChange,
	onCreateProject,
}: CrmContentProps) {
	const isRequester = profile.role === 'requester';

	const visibleTasks = tasks.filter(
		(task) =>
			profile.role === 'requester' ||
			task.assignee_id === profile.id,
	);

	const selectedProjectTasks = selectedProject
		? visibleTasks.filter(
				(task) => task.project_id === selectedProject.id,
			)
		: [];

	if (view === 'users' && profile.role === 'superadmin') {
		return (
			<AdminUsersPage
				currentUserId={profile.id}
				onNotice={onNotice}
				onError={onError}
			/>
		);
	}

	if (selectedTask) {
		return (
			<TaskDetails
				task={selectedTask}
				projectName={
					selectedTask.projects?.name ||
					projects.find(
						(project) => project.id === selectedTask.project_id,
					)?.name ||
					'—'
				}
				assigneeName={
					selectedTask.assignee?.full_name ||
					people.find(
						(person) => person.id === selectedTask.assignee_id,
					)?.full_name ||
					'—'
				}
				authorName={
					selectedTask.author?.full_name ||
					people.find(
						(person) => person.id === selectedTask.author_id,
					)?.full_name ||
					'—'
				}
				history={history}
				availableActions={getAvailableActions(selectedTask, profile)}
				comment={comment}
				busy={busy}
				canManage={isRequester}
				onCommentChange={onCommentChange}
				onTransition={onTransition}
				onEdit={onEditTask}
				onArchive={onArchiveTask}
				onBack={onBackFromTask}
			/>
		);
	}

	if (selectedProject) {
		return (
			<ProjectDetails
				project={selectedProject}
				tasks={selectedProjectTasks}
				canManage={isRequester}
				onBack={onBackFromProject}
				onEdit={onEditProject}
				onArchive={onArchiveProject}
				onCreateTask={onCreateTask}
				onOpenTask={onOpenTask}
			/>
		);
	}

	if (view === 'projects') {
		return (
			<ProjectsPage
				projects={projects}
				tasks={visibleTasks}
				search={search}
				busy={busy}
				canManage={isRequester}
				onSearchChange={onSearchChange}
				onCreateProject={onCreateProject}
				onOpenProject={onOpenProject}
			/>
		);
	}

	return (
		<MyTasksPage
			tasks={visibleTasks}
			search={search}
			onSearchChange={onSearchChange}
			onOpenTask={onOpenTask}
		/>
	);
}