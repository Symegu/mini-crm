import type { MouseEvent, ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
	eyebrow: string;
	title: string;
	children: ReactNode;
	onClose: () => void;
}

export function Modal({ eyebrow, title, children, onClose }: ModalProps) {
	function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	return (
		<div className="modal-backdrop" onMouseDown={handleBackdropClick}>
			<section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
				<header className="modal-head">
					<div>
						<span className="eyebrow">{eyebrow}</span>
						<h2 id="modal-title">{title}</h2>
					</div>
					<button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть окно">
						<X size={18} />
					</button>
				</header>
				{children}
			</section>
		</div>
	);
}
