-- Исправляет чрезмерно широкое право SELECT на profiles и фиксирует модель доступа.
-- Суперадмин управляет пользователями только через Edge Function с проверкой JWT.
-- Он не получает доступ к объектам, задачам и истории.

-- В миграциях 001/002 общий GRANT SELECT на таблицу отменял ограничение по колонкам.
-- Сначала отзываем именно табличное право, затем выдаём доступ только к безопасным полям.
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE SELECT (email) ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, full_name, role) ON TABLE public.profiles TO authenticated;

-- Роль нельзя менять через PostgREST ни одной пользовательской ролью.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

-- Не выдаём клиенту EXECUTE на trigger-функции. Они запускаются только триггерами.
REVOKE ALL ON FUNCTION public.write_task_status_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_task_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_project_archive() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_project_tasks() FROM PUBLIC, anon, authenticated;

-- Функция роли нужна политикам RLS; переход статуса доступен авторизованным пользователям,
-- но сама функция повторно проверяет роль, назначение задачи и допустимый переход.
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_task(UUID, public.task_status, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.transition_task(UUID, public.task_status, TEXT) FROM PUBLIC, anon;

-- Суперадмин не получает доступ к CRM-данным. Политики projects/tasks/history
-- намеренно оставляют доступ только постановщику и назначенному исполнителю.
-- Чтение полного списка пользователей и изменение ролей выполняет Edge Function
-- с service_role после проверки роли вызывающего пользователя.
