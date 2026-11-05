import { X } from 'lucide-react';

interface ToastProps {
	error: string;
	notice: string;
	onDismiss: () => void;
}

export function Toast({
	error,
	notice,
	onDismiss,
}: ToastProps) {
	if (!error && !notice) return null;

	return (
		<div
			className={`toast ${error ? 'error' : ''}`}
			role={error ? 'alert' : 'status'}
		>
			<span>{error || notice}</span>

			<button
				type="button"
				onClick={onDismiss}
				aria-label="Закрыть уведомление"
			>
				<X size={15} />
			</button>
		</div>
	);
}