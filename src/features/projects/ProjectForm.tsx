import type { FormEvent } from 'react';
import type { Project } from '../../types';

interface ProjectFormProps {
	project: Project | null;
	busy: boolean;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onCancel: () => void;
}

export function ProjectForm({ project, busy, onSubmit, onCancel }: ProjectFormProps) {
	return (
		<form onSubmit={onSubmit}>
			<label>
				Название объекта
				<input name="name" defaultValue={project?.name ?? ''} required maxLength={160} placeholder="ЖК Северный квартал" />
			</label>
			<label>
				Адрес
				<input name="address" defaultValue={project?.address ?? ''} required maxLength={300} placeholder="г. Москва, ул. Примерная, 10" />
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
