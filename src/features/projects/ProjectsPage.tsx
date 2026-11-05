import { Plus } from 'lucide-react';
import { SearchToolbar } from '../../components/common/SearchToolbar';
import { ProjectCard } from './ProjectCard';
import type { Project, Task } from '../../types';

interface ProjectsPageProps {
	projects: Project[];
	tasks: Task[];
	search: string;
	busy: boolean;
	canManage: boolean;
	onSearchChange: (value: string) => void;
	onCreateProject: () => void;
	onOpenProject: (project: Project) => void;
}

/** Страница списка объектов. Данные и права на них приходят из App и Supabase RLS. */
export function ProjectsPage({
	projects,
	tasks,
	search,
	busy,
	canManage,
	onSearchChange,
	onCreateProject,
	onOpenProject,
}: ProjectsPageProps) {
	const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
	const visibleProjects = projects.filter((project) =>
		project.name.toLocaleLowerCase('ru-RU').includes(normalizedSearch)
		|| project.address.toLocaleLowerCase('ru-RU').includes(normalizedSearch));

	return (
		<section className="content">
			<div className="section-title">
				<div>
					<span className="eyebrow">Строительные площадки</span>
					<h2>Все объекты <span className="sub-count">{visibleProjects.length}</span></h2>
					<p className="muted">Объекты и связанные с ними задачи</p>
				</div>
				{canManage && (
					<button type="button" className="primary" onClick={onCreateProject}>
						<Plus size={17} /> Добавить объект
					</button>
				)}
			</div>

			<SearchToolbar
				value={search}
				placeholder="Поиск по названию или адресу"
				onChange={onSearchChange}
			/>

			{visibleProjects.length > 0 ? (
				<div className="project-grid">
					{visibleProjects.map((project) => (
						<ProjectCard
							key={project.id}
							project={project}
							taskCount={tasks.filter((task) => task.project_id === project.id).length}
							onOpen={onOpenProject}
						/>
					))}
				</div>
			) : (
				<div className="empty">{busy ? 'Загрузка…' : 'Объекты не найдены.'}</div>
			)}
		</section>
	);
}
