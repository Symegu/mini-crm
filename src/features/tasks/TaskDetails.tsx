import { ChevronRight } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import { MetaItem } from '../../components/common/MetaItem';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatDateTime } from '../../lib/format';
import { STATUS_LABELS, type HistoryItem, type Task, type TaskStatus } from '../../types';

interface TaskDetailsProps {
	task: Task;
	projectName: string;
	assigneeName: string;
	authorName: string;
	history: HistoryItem[];
	availableActions: TaskStatus[];
	comment: string;
	busy: boolean;
	canManage: boolean;
	onCommentChange: (value: string) => void;
	onTransition: (status: TaskStatus) => void;
	onEdit: () => void;
	onArchive: () => void;
	onBack: () => void;
}

export function TaskDetails({
	task,
	projectName,
	assigneeName,
	authorName,
	history,
	availableActions,
	comment,
	busy,
	canManage,
	onCommentChange,
	onTransition,
	onEdit,
	onArchive,
	onBack,
}: TaskDetailsProps) {
	const canReturnForRework = availableActions.includes('rework');

	return (
		<section className="content">
			<button type="button" className="back-link" onClick={onBack}>← Назад к списку</button>

			<div className="detail-grid">
				<div className="panel task-detail">
					<div className="panel-heading">
						<div>
							<StatusBadge status={task.status} />
							<h2>{task.title}</h2>
						</div>
						{canManage && (
							<div className="inline-actions">
								<button type="button" className="secondary" onClick={onEdit}>Изменить</button>
								<button type="button" className="danger-ghost" onClick={onArchive}>Удалить</button>
							</div>
						)}
					</div>

					<p className="description">{task.description || 'Описание не указано.'}</p>

					<div className="meta-grid">
						<MetaItem label="Объект" value={projectName} />
						<MetaItem label="Исполнитель" value={assigneeName} />
						<MetaItem label="Постановщик" value={authorName} />
						<MetaItem label="Создана" value={formatDateTime(task.created_at)} />
					</div>

					<div className="action-area">
						{availableActions.length > 0 ? (
							<>
								<h3>Доступные действия</h3>
								{canReturnForRework && (
									<label>
										Комментарий к возврату (обязательно)
										<textarea
											value={comment}
											onChange={(event) => onCommentChange(event.target.value)}
											rows={3}
											maxLength={2000}
											placeholder="Что необходимо исправить?"
										/>
									</label>
								)}
								{availableActions.filter((status) => status !== 'rework').map((status) => (
									<button
										key={status}
										type="button"
										className="primary"
										disabled={busy}
										onClick={() => onTransition(status)}
									>
										{status === 'in_progress' && 'Взять в работу'}
										{status === 'review' && 'Отправить на проверку'}
										{status === 'accepted' && 'Принять'}
									</button>
								))}
								{canReturnForRework && (
									<button
										type="button"
										className="warning-btn"
										disabled={busy || !comment.trim()}
										onClick={() => onTransition('rework')}
									>
										Вернуть на доработку
									</button>
								)}
							</>
						) : (
							<p className="muted">Сейчас нет доступных действий для вашей роли.</p>
						)}
					</div>
				</div>

				<div className="panel history-panel">
					<div className="section-title">
						<div>
							<span className="eyebrow">Прозрачность процесса</span>
							<h3>История изменений</h3>
						</div>
					</div>

					{history.length === 0 ? (
						<EmptyState compact>Изменений пока нет.</EmptyState>
					) : (
						<div className="timeline">
							{history.map((item) => (
								<div className="timeline-item" key={item.id}>
									<div className="timeline-dot" />
									<div>
										<strong>
											{item.from_status ? STATUS_LABELS[item.from_status] : 'Создана'}
											<ChevronRight size={13} />
											{STATUS_LABELS[item.to_status]}
										</strong>
										<p>{item.actor?.full_name || 'Пользователь'} · {formatDateTime(item.created_at)}</p>
										{item.comment && <blockquote>{item.comment}</blockquote>}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
