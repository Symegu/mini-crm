import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { Toast } from './components/common/Toast';
import { LoginPage } from './features/auth/LoginPage';
import { ProfileSetupScreen, SupabaseSetupScreen } from './features/auth/SetupScreens';
import { signInWithPassword, signOut } from './features/auth/authService';
import { useAuthSession } from './features/auth/useAuthSession';
import { CrmContent } from './features/crm/CrmContent';
import { CrmModals } from './features/crm/CrmModals';
import { loadCrmData } from './features/crm/crmDataService';
import { archiveProjectRecord, saveProjectRecord } from './features/projects/projectService';
import {
	archiveTaskRecord,
	loadTaskHistory,
	saveTaskRecord,
	transitionTaskStatus,
} from './features/tasks/taskService';
import { getErrorMessage } from './lib/format';
import { isSupabaseConfigured } from './lib/supabase';
import {
	STATUS_LABELS,
	type AppView,
	type HistoryItem,
	type ModalType,
	type Profile,
	type Project,
	type Task,
	type TaskStatus,
} from './types';

function App() {
	const [profile, setProfile] = useState<Profile | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [people, setPeople] = useState<Profile[]>([]);
	const [history, setHistory] = useState<HistoryItem[]>([]);

	const [view, setView] = useState<AppView>('projects');
	const [selectedProject, setSelectedProject] = useState<Project | null>(null);
	const [selectedTask, setSelectedTask] = useState<Task | null>(null);

	const [modal, setModal] = useState<ModalType>(null);
	const [editingProject, setEditingProject] = useState<Project | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');

	const [search, setSearch] = useState('');
	const [comment, setComment] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');

	const { sessionUser, authReady } = useAuthSession(setError);

	/** Загружает профиль и разрешённые RLS данные через слой CRM-сервисов. */
	const loadData = useCallback(async (): Promise<Task[] | null> => {
		if (!sessionUser?.id) return null;

		setBusy(true);
		setError('');

		try {
			const data = await loadCrmData(sessionUser.id);

			setProfile(data.profile);
			setProjects(data.projects);
			setTasks(data.tasks);
			setPeople(data.people);

			if (data.profile.role === 'superadmin') {
				setView('users');
			}

			return data.tasks;
		} catch (loadError) {
			setError(getErrorMessage(loadError));
			return null;
		} finally {
			setBusy(false);
		}
	}, [sessionUser?.id]);

	// Сбрасываем данные при выходе, загружаем при входе.
	useEffect(() => {
		if (sessionUser) {
			void loadData();
			return;
		}

		setProfile(null);
		setProjects([]);
		setTasks([]);
		setPeople([]);
		setHistory([]);
		setSelectedProject(null);
		setSelectedTask(null);
		setView('projects');
	}, [sessionUser?.id, loadData]);

	// Авторизация

	async function handleSignIn(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		setBusy(true);
		setError('');

		try {
			await signInWithPassword(email.trim(), password);
		} catch (signInError) {
			setError(getErrorMessage(signInError));
		} finally {
			setBusy(false);
		}
	}

	async function handleSignOut() {
		try {
			await signOut();
		} catch (signOutError) {
			setError(getErrorMessage(signOutError));
		}
	}

	// Объекты

	async function saveProject(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const formData = new FormData(event.currentTarget);

		const payload = {
			name: String(formData.get('name') ?? '').trim(),
			address: String(formData.get('address') ?? '').trim(),
		};

		if (!payload.name || !payload.address) return;

		setBusy(true);
		setError('');

		try {
			await saveProjectRecord(payload, editingProject?.id);

			setModal(null);
			setNotice(editingProject ? 'Объект обновлён.' : 'Объект создан.');

			if (editingProject) {
				setSelectedProject((current) =>
					current?.id === editingProject.id
						? { ...current, ...payload }
						: current,
				);
			}

			setEditingProject(null);
			await loadData();
		} catch (saveError) {
			setError(getErrorMessage(saveError));
		} finally {
			setBusy(false);
		}
	}

	async function archiveProject(project: Project) {
		if (!window.confirm(`Удалить объект «${project.name}» из рабочих списков?`)) {
			return;
		}

		setBusy(true);
		setError('');

		try {
			await archiveProjectRecord(project.id);

			setSelectedProject(null);
			setSelectedTask(null);
			setNotice('Объект удалён из рабочих списков. История задач сохранена.');

			await loadData();
		} catch (archiveError) {
			setError(getErrorMessage(archiveError));
		} finally {
			setBusy(false);
		}
	}

	// Задачи

	async function saveTask(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!profile) return;

		const formData = new FormData(event.currentTarget);

		const payload = {
			title: String(formData.get('title') ?? '').trim(),
			description: String(formData.get('description') ?? '').trim(),
			project_id: String(formData.get('project_id') ?? ''),
			assignee_id: String(formData.get('assignee_id') ?? ''),
		};

		if (!payload.title || !payload.project_id || !payload.assignee_id) {
			return;
		}

		setBusy(true);
		setError('');

		try {
			const editedTaskId = editingTask?.id;

			await saveTaskRecord(payload, profile.id, editedTaskId);

			setModal(null);
			setNotice(editedTaskId ? 'Задача обновлена.' : 'Задача создана.');
			setEditingTask(null);

			const refreshedTasks = await loadData();

			if (editedTaskId) {
				const refreshedTask = refreshedTasks?.find(
					(task) => task.id === editedTaskId,
				);

				if (refreshedTask) {
					setSelectedTask(refreshedTask);
				}
			}
		} catch (saveError) {
			setError(getErrorMessage(saveError));
		} finally {
			setBusy(false);
		}
	}

	async function archiveTask(task: Task) {
		if (!window.confirm(`Удалить задачу «${task.title}» из рабочих списков?`)) {
			return;
		}

		setBusy(true);
		setError('');

		try {
			await archiveTaskRecord(task.id);

			setSelectedTask(null);
			setNotice('Задача удалена из рабочих списков. История сохранена.');

			await loadData();
		} catch (archiveError) {
			setError(getErrorMessage(archiveError));
		} finally {
			setBusy(false);
		}
	}

	async function openTask(task: Task) {
		setSelectedTask(task);
		setComment('');
		setHistory([]);

		try {
			const taskHistory = await loadTaskHistory(task.id);
			setHistory(taskHistory);
		} catch (historyError) {
			setError(getErrorMessage(historyError));
		}
	}

	async function transitionTask(nextStatus: TaskStatus) {
		if (!selectedTask) return;

		if (nextStatus === 'rework' && !comment.trim()) {
			setError('Для возврата на доработку обязателен комментарий.');
			return;
		}

		setBusy(true);
		setError('');

		try {
			const taskId = selectedTask.id;

			await transitionTaskStatus(
				taskId,
				nextStatus,
				comment.trim() || null,
			);

			setComment('');
			setNotice(`Статус изменён: ${STATUS_LABELS[nextStatus]}.`);

			const refreshedTasks = await loadData();

			const refreshedTask = refreshedTasks?.find(
				(task) => task.id === taskId,
			);

			if (refreshedTask) {
				await openTask(refreshedTask);
			}
		} catch (transitionError) {
			setError(getErrorMessage(transitionError));
		} finally {
			setBusy(false);
		}
	}

	// Заголовок текущего экрана.

	const pageTitle = selectedTask?.title
		|| selectedProject?.name
		|| (
			view === 'projects'
				? 'Объекты'
				: view === 'my-tasks'
					? 'Мои задачи'
					: 'Пользователи'
		);

	// Служебные экраны.

	if (!isSupabaseConfigured) {
		return <SupabaseSetupScreen />;
	}

	if (!authReady) {
		return <ProfileSetupScreen message="Проверяем сессию…" />;
	}

	if (!sessionUser) {
		return (
			<LoginPage
				busy={busy}
				error={error}
				email={email}
				password={password}
				onEmailChange={setEmail}
				onPasswordChange={setPassword}
				onSubmit={handleSignIn}
			/>
		);
	}

	if (!profile) {
		return (
			<ProfileSetupScreen
				message={error || 'Загружаем профиль…'}
				onRetry={() => void loadData()}
				onSignOut={handleSignOut}
			/>
		);
	}

	// Основной интерфейс.

	return (
		<div className="app-shell">
			<Sidebar
				profile={profile}
				view={view}
				activeTaskCount={tasks.filter(
					(task) => task.status !== 'accepted',
				).length}
				onChangeView={(nextView) => {
					setView(nextView);
					setSelectedProject(null);
					setSelectedTask(null);
					setSearch('');
				}}
				onSignOut={handleSignOut}
			/>

			<main className="main-area">
				<Topbar
					profile={profile}
					view={view}
					title={pageTitle}
					onRefresh={() => void loadData()}
				/>

				<Toast
					error={error}
					notice={notice}
					onDismiss={() => {
						setError('');
						setNotice('');
					}}
				/>

				<CrmContent
					profile={profile}
					view={view}
					projects={projects}
					tasks={tasks}
					people={people}
					selectedProject={selectedProject}
					selectedTask={selectedTask}
					history={history}
					comment={comment}
					search={search}
					busy={busy}
					onNotice={setNotice}
					onError={setError}
					onCommentChange={setComment}
					onTransition={(status) => void transitionTask(status)}
					onEditTask={() => {
						setEditingTask(selectedTask);
						setModal('task');
					}}
					onArchiveTask={() => {
						if (selectedTask) void archiveTask(selectedTask);
					}}
					onBackFromTask={() => setSelectedTask(null)}
					onBackFromProject={() => setSelectedProject(null)}
					onEditProject={() => {
						setEditingProject(selectedProject);
						setModal('project');
					}}
					onArchiveProject={() => {
						if (selectedProject) void archiveProject(selectedProject);
					}}
					onCreateTask={() => {
						setEditingTask(null);
						setModal('task');
					}}
					onOpenTask={(task) => void openTask(task)}
					onOpenProject={setSelectedProject}
					onSearchChange={setSearch}
					onCreateProject={() => {
						setEditingProject(null);
						setModal('project');
					}}
				/>
			</main>

			<CrmModals
				modal={modal}
				editingProject={editingProject}
				editingTask={editingTask}
				selectedProject={selectedProject}
				projects={projects}
				people={people}
				busy={busy}
				onClose={() => setModal(null)}
				onSaveProject={(event) => void saveProject(event)}
				onSaveTask={(event) => void saveTask(event)}
			/>
		</div>
	);
}

export default App;