-- Начальная схема мини-CRM: пользователи, объекты, задачи, история и права доступа.
-- Для запуска вручную откройте Supabase Dashboard -> SQL Editor и выполните файл целиком.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
	CREATE TYPE public.app_role AS ENUM ('requester', 'executor');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
	CREATE TYPE public.task_status AS ENUM (
		'new',
		'in_progress',
		'review',
		'accepted',
		'rework'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END;
$$;

-- Профили связаны один-к-одному с пользователями Supabase Auth.
CREATE TABLE IF NOT EXISTS public.profiles (
	id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	full_name TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE,
	role public.app_role NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Объект строительной компании.
CREATE TABLE IF NOT EXISTS public.projects (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name TEXT NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
	address TEXT NOT NULL CHECK (LENGTH(TRIM(address)) > 0),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Задача всегда относится к объекту, постановщику и одному исполнителю.
CREATE TABLE IF NOT EXISTS public.tasks (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	title TEXT NOT NULL CHECK (LENGTH(TRIM(title)) > 0),
	description TEXT NOT NULL DEFAULT '',
	project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
	assignee_id UUID NOT NULL REFERENCES public.profiles(id),
	author_id UUID NOT NULL REFERENCES public.profiles(id),
	status public.task_status NOT NULL DEFAULT 'new',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON public.tasks (assignee_id);
CREATE INDEX IF NOT EXISTS tasks_project_idx ON public.tasks (project_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks (status);

-- История заполняется триггером. Клиентская запись запрещена политиками и GRANT.
CREATE TABLE IF NOT EXISTS public.task_status_history (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	task_id UUID NOT NULL REFERENCES public.tasks(id),
	actor_id UUID NOT NULL REFERENCES public.profiles(id),
	from_status public.task_status,
	to_status public.task_status NOT NULL,
	comment TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_history_task_created_idx
	ON public.task_status_history (task_id, created_at DESC);

-- Возвращает роль текущего пользователя. SECURITY DEFINER нужен для безопасного чтения
-- профиля внутри RLS-политик без рекурсивной проверки profiles.
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT role
	FROM public.profiles
	WHERE id = auth.uid();
$$;

-- Запись истории выполняется только триггером, а не напрямую из браузера.
CREATE OR REPLACE FUNCTION public.write_task_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		INSERT INTO public.task_status_history (
			task_id,
			actor_id,
			from_status,
			to_status,
			comment
		)
		VALUES (
			NEW.id,
			COALESCE(auth.uid(), NEW.author_id),
			NULL,
			NEW.status,
			NULL
		);
	ELSE
		INSERT INTO public.task_status_history (
			task_id,
			actor_id,
			from_status,
			to_status,
			comment
		)
		VALUES (
			NEW.id,
			auth.uid(),
			OLD.status,
			NEW.status,
			NULLIF(current_setting('app.task_transition_comment', TRUE), '')
		);
	END IF;

	RETURN NEW;
END;
$$;

-- Проверяет полномочия и защищает поля задачи от прямого изменения через REST API.
CREATE OR REPLACE FUNCTION public.guard_task_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_role public.app_role;
BEGIN
	v_role := public.current_app_role();

	IF TG_OP = 'INSERT' THEN
		IF v_role IS DISTINCT FROM 'requester'
			OR NEW.author_id <> auth.uid()
			OR NEW.status <> 'new'
		THEN
			RAISE EXCEPTION 'Only a requester can create a task in New status';
		END IF;

		IF NOT EXISTS (
			SELECT 1
			FROM public.profiles AS profile
			WHERE profile.id = NEW.assignee_id
				AND profile.role = 'executor'
		) THEN
			RAISE EXCEPTION 'Assignee must be an executor';
		END IF;

		RETURN NEW;
	END IF;

	IF TG_OP = 'UPDATE' THEN
		IF NEW.id <> OLD.id
			OR NEW.created_at <> OLD.created_at
			OR NEW.author_id <> OLD.author_id
		THEN
			RAISE EXCEPTION 'Task identity and author are immutable';
		END IF;

		IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
			AND NOT EXISTS (
				SELECT 1
				FROM public.profiles AS profile
				WHERE profile.id = NEW.assignee_id
					AND profile.role = 'executor'
			)
		THEN
			RAISE EXCEPTION 'Assignee must be an executor';
		END IF;

		IF v_role = 'executor' THEN
			IF OLD.assignee_id <> auth.uid() THEN
				RAISE EXCEPTION 'You can only update your own assigned tasks';
			END IF;

			IF NEW.title IS DISTINCT FROM OLD.title
				OR NEW.description IS DISTINCT FROM OLD.description
				OR NEW.project_id IS DISTINCT FROM OLD.project_id
				OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
			THEN
				RAISE EXCEPTION 'Executors cannot edit task details';
			END IF;

			IF NOT (
				(OLD.status = 'new' AND NEW.status = 'in_progress')
				OR (OLD.status = 'in_progress' AND NEW.status = 'review')
				OR (OLD.status = 'rework' AND NEW.status = 'in_progress')
			) THEN
				RAISE EXCEPTION 'Forbidden status transition for executor';
			END IF;

		ELSIF v_role = 'requester' THEN
			IF NEW.status IS DISTINCT FROM OLD.status
				AND NOT (OLD.status = 'review' AND NEW.status IN ('accepted', 'rework'))
			THEN
				RAISE EXCEPTION 'Forbidden status transition for requester';
			END IF;

			IF OLD.status = 'review'
				AND NEW.status = 'rework'
				AND LENGTH(TRIM(COALESCE(current_setting('app.task_transition_comment', TRUE), ''))) = 0
			THEN
				RAISE EXCEPTION 'A comment is required when returning a task for rework';
			END IF;
		ELSE
			RAISE EXCEPTION 'No permission to update task';
		END IF;

		NEW.updated_at := NOW();
		RETURN NEW;
	END IF;

	RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tasks_guard_mutation ON public.tasks;
CREATE TRIGGER tasks_guard_mutation
	BEFORE INSERT OR UPDATE ON public.tasks
	FOR EACH ROW
	EXECUTE FUNCTION public.guard_task_mutation();

DROP TRIGGER IF EXISTS tasks_status_history_insert ON public.tasks;
CREATE TRIGGER tasks_status_history_insert
	AFTER INSERT ON public.tasks
	FOR EACH ROW
	EXECUTE FUNCTION public.write_task_status_history();

DROP TRIGGER IF EXISTS tasks_status_history_update ON public.tasks;
CREATE TRIGGER tasks_status_history_update
	AFTER UPDATE OF status ON public.tasks
	FOR EACH ROW
	WHEN (OLD.status IS DISTINCT FROM NEW.status)
	EXECUTE FUNCTION public.write_task_status_history();

-- Единая серверная точка перехода статуса. Комментарий сохраняется в той же транзакции.
CREATE OR REPLACE FUNCTION public.transition_task(
	p_task_id UUID,
	p_to_status public.task_status,
	p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_task public.tasks%ROWTYPE;
	v_role public.app_role;
BEGIN
	v_role := public.current_app_role();

	SELECT *
	INTO v_task
	FROM public.tasks
	WHERE id = p_task_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Task not found';
	END IF;

	IF v_role = 'executor' AND v_task.assignee_id <> auth.uid() THEN
		RAISE EXCEPTION 'Task is not assigned to you';
	END IF;

	IF v_role = 'requester'
		AND NOT (v_task.status = 'review' AND p_to_status IN ('accepted', 'rework'))
	THEN
		RAISE EXCEPTION 'Forbidden status transition';
	END IF;

	IF v_role = 'executor'
		AND NOT (
			(v_task.status = 'new' AND p_to_status = 'in_progress')
			OR (v_task.status = 'in_progress' AND p_to_status = 'review')
			OR (v_task.status = 'rework' AND p_to_status = 'in_progress')
		)
	THEN
		RAISE EXCEPTION 'Forbidden status transition';
	END IF;

	IF v_role IS DISTINCT FROM 'requester'
		AND v_role IS DISTINCT FROM 'executor' THEN
		RAISE EXCEPTION 'No permission';
	END IF;

	IF p_to_status = 'rework' AND LENGTH(TRIM(COALESCE(p_comment, ''))) = 0 THEN
		RAISE EXCEPTION 'A comment is required when returning a task for rework';
	END IF;

	PERFORM set_config('app.task_transition_comment', COALESCE(p_comment, ''), TRUE);
	UPDATE public.tasks
	SET status = p_to_status
	WHERE id = p_task_id;
	PERFORM set_config('app.task_transition_comment', '', TRUE);
END;
$$;

-- RLS является границей безопасности. Фильтрация в React нужна только для удобства.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_read_authenticated ON public.profiles;
CREATE POLICY profiles_read_authenticated
	ON public.profiles
	FOR SELECT
	TO authenticated
	USING (
		id = auth.uid()
		OR public.current_app_role() = 'requester'
		OR EXISTS (
			SELECT 1
			FROM public.tasks AS task
			WHERE task.assignee_id = auth.uid()
				AND (
					task.author_id = profiles.id
					OR EXISTS (
						SELECT 1
						FROM public.task_status_history AS history
						WHERE history.task_id = task.id
							AND history.actor_id = profiles.id
					)
				)
		)
	);

-- Профили и роли назначаются администратором; клиент не может их менять.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;

DROP POLICY IF EXISTS projects_read_visible ON public.projects;
CREATE POLICY projects_read_visible
	ON public.projects
	FOR SELECT
	TO authenticated
	USING (
		public.current_app_role() = 'requester'
		OR EXISTS (
			SELECT 1
			FROM public.tasks AS task
			WHERE task.project_id = projects.id
				AND task.assignee_id = auth.uid()
		)
	);

DROP POLICY IF EXISTS projects_requester_insert ON public.projects;
CREATE POLICY projects_requester_insert
	ON public.projects
	FOR INSERT
	TO authenticated
	WITH CHECK (public.current_app_role() = 'requester');

DROP POLICY IF EXISTS projects_requester_update ON public.projects;
CREATE POLICY projects_requester_update
	ON public.projects
	FOR UPDATE
	TO authenticated
	USING (public.current_app_role() = 'requester')
	WITH CHECK (public.current_app_role() = 'requester');

DROP POLICY IF EXISTS projects_requester_delete ON public.projects;
CREATE POLICY projects_requester_delete
	ON public.projects
	FOR DELETE
	TO authenticated
	USING (public.current_app_role() = 'requester');

DROP POLICY IF EXISTS tasks_read_visible ON public.tasks;
CREATE POLICY tasks_read_visible
	ON public.tasks
	FOR SELECT
	TO authenticated
	USING (public.current_app_role() = 'requester' OR assignee_id = auth.uid());

DROP POLICY IF EXISTS tasks_requester_insert ON public.tasks;
CREATE POLICY tasks_requester_insert
	ON public.tasks
	FOR INSERT
	TO authenticated
	WITH CHECK (
		public.current_app_role() = 'requester'
		AND author_id = auth.uid()
	);

DROP POLICY IF EXISTS tasks_update_visible ON public.tasks;
CREATE POLICY tasks_update_visible
	ON public.tasks
	FOR UPDATE
	TO authenticated
	USING (public.current_app_role() = 'requester' OR assignee_id = auth.uid())
	WITH CHECK (public.current_app_role() = 'requester' OR assignee_id = auth.uid());

DROP POLICY IF EXISTS tasks_requester_delete ON public.tasks;
CREATE POLICY tasks_requester_delete
	ON public.tasks
	FOR DELETE
	TO authenticated
	USING (public.current_app_role() = 'requester');

DROP POLICY IF EXISTS history_read_visible ON public.task_status_history;
CREATE POLICY history_read_visible
	ON public.task_status_history
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1
			FROM public.tasks AS task
			WHERE task.id = task_id
				AND (
					public.current_app_role() = 'requester'
					OR task.assignee_id = auth.uid()
				)
		)
	);

-- Историю можно читать в рамках доступа к задаче; менять её клиент не может.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.task_status_history FROM anon, authenticated;
GRANT SELECT ON public.profiles, public.projects, public.tasks, public.task_status_history TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.projects, public.tasks TO authenticated;

GRANT EXECUTE ON FUNCTION public.transition_task(UUID, public.task_status, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.transition_task(UUID, public.task_status, TEXT) FROM PUBLIC, anon;

-- Открытая регистрация не реализуется в приложении. Пользователей создают вручную
-- в Supabase Auth, после чего администратор добавляет строки в public.profiles.
