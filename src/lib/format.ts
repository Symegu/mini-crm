/** Форматирует дату и время в локали интерфейса. */
export function formatDateTime(value: string): string {
	return new Intl.DateTimeFormat('ru-RU', {
		dateStyle: 'short',
		timeStyle: 'short',
	}).format(new Date(value));
}

/** Приводит неизвестную ошибку к тексту, пригодному для показа пользователю. */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'object' && error !== null && 'message' in error) {
		return String(error.message);
	}

	return 'Произошла непредвиденная ошибка. Попробуйте ещё раз.';
}
