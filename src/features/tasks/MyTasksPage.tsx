import { useMemo } from 'react';
import { SearchToolbar } from '../../components/common/SearchToolbar';
import { TaskTable } from './TaskTable';
import type { Task } from '../../types';

interface MyTasksPageProps {
	tasks: Task[];
	search: string;
	onSearchChange: (value: string) => void;
	onOpenTask: (task: Task) => void;
}

/** Исполнительский список. Видимость строк дополнительно ограничена RLS в Supabase. */
export function MyTasksPage({ tasks, search, onSearchChange, onOpenTask }: MyTasksPageProps) {
	const filteredTasks = useMemo(() => {
		const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
		return tasks.filter((task) =>
			task.title.toLocaleLowerCase('ru-RU').includes(normalizedSearch));
	}, [tasks, search]);

	return (
		<section className="content">
			<div className="section-title">
				<div>
					<span className="eyebrow">Назначенные вам</span>
					<h2>Мои задачи <span className="sub-count">{tasks.length}</span></h2>
					<p className="muted">Задачи, в которых вы назначены исполнителем</p>
				</div>
			</div>

			<SearchToolbar value={search} placeholder="Поиск по задачам" onChange={onSearchChange} />
			<TaskTable tasks={filteredTasks} onOpen={onOpenTask} />
		</section>
	);
}
