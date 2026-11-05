import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { Modal } from './components/common/Modal';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { LoginPage } from './features/auth/LoginPage';
import { ProfileSetupScreen, SupabaseSetupScreen } from './features/auth/SetupScreens';
import { ProjectDetails } from './features/projects/ProjectDetails';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { ProjectForm } from './features/projects/ProjectForm';
import { TaskDetails } from './features/tasks/TaskDetails';
import { MyTasksPage } from './features/tasks/MyTasksPage';
import { getAvailableActions } from './features/tasks/taskPermissions';
import { TaskForm } from './features/tasks/TaskForm';
import { getErrorMessage } from './lib/format';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import {
	STATUS_LABELS,
	type AppView,
	type HistoryItem,
	type Profile,
	type Project,
	type Task,
	type TaskStatus,
} from './types';

interface SessionUser {
	id: string;
}

function App() {
	const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
	const [authReady, setAuthReady] = useState(false);
	const [profile, setProfile] = useState<Profile | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [people, setPeople] = useState<Profile[]>([]);
	const [history, setHistory] = useState<HistoryItem[]>([]);

	const [view, setView] = useState<AppView>('projects');
	const [selectedProject, setSelectedProject] = useState<Project | null>(null);
	const [selectedTask, setSelectedTask] = useState<Task | null>(null);
	const [modal, setModal] = useState<'project' | 'task' | null>(null);
	const [editingProject, setEditingProject] = useState<Project | null>(null);
	const [editingTask, setEditingTask] = useState<Task | null>(null);

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [search, setSearch] = useState('');
	const [comment, setComment] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');

	// Восстанавливаем сессию при загрузке и подписываемся на последующие изменения Auth.
	useEffect(() => {
		if (!supabase) {
			setAuthReady(true);
			return;
		}

		let isMounted = true;
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
			setSessionUser(session
				? { id: session.user.id }
				: null);
			setAuthReady(true);
		});

		void supabase.auth.getSession().then(({ data, error: sessionError }) => {
			if (!isMounted) return;

			if (sessionError) {
				setError(getErrorMessage(sessionError));
			}

			if (data.session) {
				setSessionUser({
					id: data.session.user.id,
				});
			}
			setAuthReady(true);
		});

		return () => {
			isMounted = false;
			subscription.unsubscribe();
		};
	}, []);

	/** Загружает только доступные текущему пользователю строки; окончательный доступ обеспечивает RLS. */
	const loadData = useCallback(async (): Promise<Task[] | null> => {
		if (!supabase || !sessionUser?.id) return null;

		setBusy(true);
		setError('');

		try {
			const [profileResult, projectsResult, tasksResult, peopleResult] = await Promise.all([
				supabase
					.from('profiles')
					.select('id, full_name, role')
					.eq('id', sessionUser.id)
					.single(),
				supabase
					.from('projects')
					.select('id, name, address, created_at, archived_at')
					.order('created_at', { ascending: false }),
				supabase
					.from('tasks')
					.select([
						'id',
						'title',
						'description',
						'project_id',
						'assignee_id',
						'author_id',
						'status',
						'created_at',
						'updated_at',
						'archived_at',
						'projects(name)',
						'assignee:profiles!tasks_assignee_id_fkey(full_name)',
						'author:profiles!tasks_author_id_fkey(full_name)',
					].join(', '))
					.order('created_at', { ascending: false }),
				supabase
					.from('profiles')
					.select('id, full_name, role')
					.order('full_name'),
			]);

			if (profileResult.error) {
				if (profileResult.error.code === 'PGRST116') {
					throw new Error('Профиль не найден. Администратор должен добавить пользователя в public.profiles.');
				}
				throw profileResult.error;
			}

			if (projectsResult.error) throw projectsResult.error;
			if (tasksResult.error) throw tasksResult.error;
			if (peopleResult.error) throw peopleResult.error;

			const nextProfile = profileResult.data as Profile;
			const nextProjects = (projectsResult.data ?? []) as Project[];
			const nextTasks = (tasksResult.data ?? []) as Task[];
			const nextPeople = (peopleResult.data ?? []) as Profile[];

			setProfile(nextProfile);
			setProjects(nextProjects);
			setTasks(nextTasks);
			setPeople(nextPeople);

			return nextTasks;
		} catch (loadError) {
			setError(getErrorMessage(loadError));
			return null;
		} finally {
			setBusy(false);
		}
	}, [sessionUser?.id]);

	// Сбрасываем данные при выходе; при входе загружаем профиль и доступные ему записи.
	useEffect(() => {
		if (!sessionUser) {
			setProfile(null);
			setProjects([]);
			setTasks([]);
			setPeople([]);
			setHistory([]);
			setSelectedProject(null);
			setSelectedTask(null);
			return;
		}

		void loadData();
	}, [sessionUser?.id, loadData]);

	async function handleSignIn(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!supabase) return;

		setBusy(true);
		setError('');
		try {
			const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
			if (signInError) throw signInError;
		} catch (signInError) {
			setError(getErrorMessage(signInError));
		} finally {
			setBusy(false);
		}
	}

	async function handleSignOut() {
		if (!supabase) return;

		const { error: signOutError } = await supabase.auth.signOut();
		if (signOutError) setError(getErrorMessage(signOutError));
	}

	async function saveProject(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!supabase) return;

		const formData = new FormData(event.currentTarget);
		const payload = {
			name: String(formData.get('name') ?? '').trim(),
			address: String(formData.get('address') ?? '').trim(),
		};

		if (!payload.name || !payload.address) return;

		setBusy(true);
		setError('');
		try {
			const result = editingProject
				? await supabase.from('projects').update(payload).eq('id', editingProject.id)
				: await supabase.from('projects').insert(payload);

			if (result.error) throw result.error;

			setModal(null);
			setEditingProject(null);
			setNotice(editingProject ? 'Объект обновлён.' : 'Объект создан.');

			// Если объект редактировали из его карточки, сразу обновляем открытую карточку.
			if (editingProject) {
				setSelectedProject((current) =>
					current?.id === editingProject.id ? { ...current, ...payload } : current,
				);
			}

			await loadData();
		} catch (saveError) {
			setError(getErrorMessage(saveError));
		} finally {
			setBusy(false);
		}
	}

	async function saveTask(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!supabase || !profile) return;

		const formData = new FormData(event.currentTarget);
		const payload = {
			title: String(formData.get('title') ?? '').trim(),
			description: String(formData.get('description') ?? '').trim(),
			project_id: String(formData.get('project_id') ?? ''),
			assignee_id: String(formData.get('assignee_id') ?? ''),
		};

		if (!payload.title || !payload.project_id || !payload.assignee_id) return;

		setBusy(true);
		setError('');
		try {
			const result = editingTask
				? await supabase.from('tasks').update(payload).eq('id', editingTask.id)
				: await supabase.from('tasks').insert({
						...payload,
						author_id: profile.id,
						status: 'new',
					});

			if (result.error) throw result.error;

			setModal(null);
			setEditingTask(null);
			setNotice(editingTask ? 'Задача обновлена.' : 'Задача создана.');

			const refreshedTasks = await loadData();
			if (editingTask) {
				const refreshedTask = refreshedTasks?.find((task) => task.id === editingTask.id);
				if (refreshedTask) setSelectedTask(refreshedTask);
			}
		} catch (saveError) {
			setError(getErrorMessage(saveError));
		} finally {
			setBusy(false);
		}
	}

	/** Архивация скрывает запись из рабочих списков, но сохраняет аудит переходов. */
	async function archiveProject(project: Project) {
		if (!supabase || !window.confirm(`Удалить объект «${project.name}» из рабочих списков?`)) return;

		setBusy(true);
		setError('');
		try {
			const { error: archiveError } = await supabase
				.from('projects')
				.update({ archived_at: new Date().toISOString() })
				.eq('id', project.id);

			if (archiveError) throw archiveError;

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

	async function archiveTask(task: Task) {
		if (!supabase || !window.confirm(`Удалить задачу «${task.title}» из рабочих списков?`)) return;

		setBusy(true);
		setError('');
		try {
			const { error: archiveError } = await supabase
				.from('tasks')
				.update({ archived_at: new Date().toISOString() })
				.eq('id', task.id);

			if (archiveError) throw archiveError;

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
		if (!supabase) return;

		const { data, error: historyError } = await supabase
			.from('task_status_history')
			.select('id, task_id, actor_id, from_status, to_status, comment, created_at, actor:profiles!task_status_history_actor_id_fkey(full_name)')
			.eq('task_id', task.id)
			.order('created_at', { ascending: false });

		if (historyError) {
			setError(getErrorMessage(historyError));
			return;
		}

		setHistory((data ?? []) as HistoryItem[]);
	}

	async function transitionTask(nextStatus: TaskStatus) {
		if (!supabase || !selectedTask) return;
		if (nextStatus === 'rework' && !comment.trim()) {
			setError('Для возврата на доработку обязателен комментарий.');
			return;
		}

		setBusy(true);
		setError('');
		try {
			const { error: transitionError } = await supabase.rpc('transition_task', {
				p_task_id: selectedTask.id,
				p_to_status: nextStatus,
				p_comment: comment.trim() || null,
			});

			if (transitionError) throw transitionError;

			setComment('');
			setNotice(`Статус изменён: ${STATUS_LABELS[nextStatus]}.`);

			const refreshedTasks = await loadData();
			const refreshedTask = refreshedTasks?.find((task) => task.id === selectedTask.id);
			if (refreshedTask) await openTask(refreshedTask);
		} catch (transitionError) {
			setError(getErrorMessage(transitionError));
		} finally {
			setBusy(false);
		}
	}

	const isRequester = profile?.role === 'requester';
	const visibleTasks = useMemo(
		() => tasks.filter((task) => profile?.role === 'requester' || task.assignee_id === profile?.id),
		[tasks, profile],
	);

	const selectedProjectTasks = selectedProject
		? visibleTasks.filter((task) => task.project_id === selectedProject.id)
		: [];
	const activeTaskCount = visibleTasks.filter((task) => task.status !== 'accepted').length;
	const pageTitle = selectedTask?.title
		|| selectedProject?.name
		|| (view === 'projects' ? 'Объекты' : 'Мои задачи');

	if (!isSupabaseConfigured) return <SupabaseSetupScreen />;
	if (!authReady) return <ProfileSetupScreen message="Проверяем сессию…" />;
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

	return (
		<div className="app-shell">
			<Sidebar
				profile={profile}
				view={view}
				activeTaskCount={activeTaskCount}
				onChangeView={(nextView) => {
					setView(nextView);
					setSelectedProject(null);
					setSelectedTask(null);
					setSearch('');
				}}
				onSignOut={handleSignOut}
			/>

			<main className="main-area">
				<Topbar profile={profile} view={view} title={pageTitle} onRefresh={() => void loadData()} />

				{(error || notice) && (
					<div className={`toast ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
						<span>{error || notice}</span>
						<button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Закрыть уведомление">
							<X size={15} />
						</button>
					</div>
				)}

				{selectedTask ? (
					<TaskDetails
						task={selectedTask}
						projectName={selectedTask.projects?.name || projects.find((project) => project.id === selectedTask.project_id)?.name || '—'}
						assigneeName={selectedTask.assignee?.full_name || people.find((person) => person.id === selectedTask.assignee_id)?.full_name || '—'}
						authorName={selectedTask.author?.full_name || people.find((person) => person.id === selectedTask.author_id)?.full_name || '—'}
						history={history}
						availableActions={getAvailableActions(selectedTask, profile)}
						comment={comment}
						busy={busy}
						canManage={isRequester}
						onCommentChange={setComment}
						onTransition={(status) => void transitionTask(status)}
						onEdit={() => { setEditingTask(selectedTask); setModal('task'); }}
						onArchive={() => void archiveTask(selectedTask)}
						onBack={() => setSelectedTask(null)}
					/>
				) : selectedProject ? (
					<ProjectDetails
						project={selectedProject}
						tasks={selectedProjectTasks}
						canManage={isRequester}
						onBack={() => setSelectedProject(null)}
						onEdit={() => { setEditingProject(selectedProject); setModal('project'); }}
						onArchive={() => void archiveProject(selectedProject)}
						onCreateTask={() => { setEditingTask(null); setModal('task'); }}
						onOpenTask={(task) => void openTask(task)}
					/>
				) : view === 'projects' ? (
					<ProjectsPage
						projects={projects}
						tasks={visibleTasks}
						search={search}
						busy={busy}
						canManage={isRequester}
						onSearchChange={setSearch}
						onCreateProject={() => { setEditingProject(null); setModal('project'); }}
						onOpenProject={setSelectedProject}
					/>
				) : (
					<MyTasksPage
						tasks={visibleTasks}
						search={search}
						onSearchChange={setSearch}
						onOpenTask={(task) => void openTask(task)}
					/>
				)}
			</main>

			{modal && (
				<Modal
					eyebrow={modal === 'project' ? 'Управление объектами' : 'Управление задачами'}
					title={modal === 'project'
						? editingProject ? 'Редактировать объект' : 'Новый объект'
						: editingTask ? 'Редактировать задачу' : 'Новая задача'}
					onClose={() => setModal(null)}
				>
					{modal === 'project' ? (
						<ProjectForm
							project={editingProject}
							busy={busy}
							onSubmit={saveProject}
							onCancel={() => setModal(null)}
						/>
					) : (
						<TaskForm
							task={editingTask}
							projects={projects}
							executors={people.filter((person) => person.role === 'executor')}
							defaultProjectId={selectedProject?.id}
							busy={busy}
							onSubmit={saveTask}
							onCancel={() => setModal(null)}
						/>
					)}
				</Modal>
			)}
		</div>
	);
}


export default App;
