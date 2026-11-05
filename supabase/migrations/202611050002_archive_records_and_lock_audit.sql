-- Безопасное удаление: архивируем записи, чтобы не терять историю статусов.
-- Применять ПОСЛЕ 202611050001_initial_schema.sql.

ALTER TABLE public.projects
	ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.tasks
	ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS projects_active_created_idx
	ON public.projects (created_at DESC)
	WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS tasks_active_assignee_idx
	ON public.tasks (assignee_id, created_at DESC)
	WHERE archived_at IS NULL;

-- Повторно объявляем все SECURITY DEFINER-функции из первой миграции с пустым
-- search_path. Это важно и для тех баз, где первая версия схемы уже применена.
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT profile.role
	FROM public.profiles AS profile
	WHERE profile.id = auth.uid();
$$;

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

	IF v_role IS DISTINCT FROM 'requester'
		AND v_role IS DISTINCT FROM 'executor' THEN
		RAISE EXCEPTION 'No permission';
	END IF;

	SELECT *
	INTO v_task
	FROM public.tasks
	WHERE id = p_task_id
	FOR UPDATE;

	IF NOT FOUND OR v_task.archived_at IS NOT NULL THEN
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

-- Архивную карточку нельзя восстановить или отредактировать через клиентский API.
CREATE OR REPLACE FUNCTION public.guard_project_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	IF OLD.archived_at IS NOT NULL THEN
		RAISE EXCEPTION 'Archived projects are immutable';
	END IF;

	IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
		AND public.current_app_role() IS DISTINCT FROM 'requester'
	THEN
		RAISE EXCEPTION 'Only a requester can archive a project';
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_guard_archive ON public.projects;
CREATE TRIGGER projects_guard_archive
	BEFORE UPDATE ON public.projects
	FOR EACH ROW
	EXECUTE FUNCTION public.guard_project_archive();

-- Архивирование объекта архивирует и все его задачи в той же транзакции.
CREATE OR REPLACE FUNCTION public.archive_project_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
		UPDATE public.tasks
		SET archived_at = NEW.archived_at
		WHERE project_id = NEW.id
			AND archived_at IS NULL;
	END IF;

	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_archive_tasks ON public.projects;
CREATE TRIGGER projects_archive_tasks
	AFTER UPDATE OF archived_at ON public.projects
	FOR EACH ROW
	WHEN (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL)
	EXECUTE FUNCTION public.archive_project_tasks();

-- Обновляем проверку задач: роль и допустимый статус по-прежнему проверяются БД,
-- а поле archived_at может один раз установить только постановщик.
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

		IF NEW.archived_at IS NOT NULL THEN
			RAISE EXCEPTION 'New tasks cannot be created in archived state';
		END IF;

		IF NOT EXISTS (
			SELECT 1
			FROM public.projects AS project
			WHERE project.id = NEW.project_id
				AND project.archived_at IS NULL
		) THEN
			RAISE EXCEPTION 'Tasks can only belong to active projects';
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

		IF NEW.archived_at IS DISTINCT FROM OLD.archived_at
			AND (
				v_role IS DISTINCT FROM 'requester'
				OR OLD.archived_at IS NOT NULL
				OR NEW.archived_at IS NULL
			)
		THEN
			RAISE EXCEPTION 'Only a requester can archive an active task';
		END IF;

		IF OLD.archived_at IS NOT NULL THEN
			RAISE EXCEPTION 'Archived tasks are immutable';
		END IF;

		IF NEW.project_id IS DISTINCT FROM OLD.project_id
			AND NOT EXISTS (
				SELECT 1
				FROM public.projects AS project
				WHERE project.id = NEW.project_id
					AND project.archived_at IS NULL
			) THEN
			RAISE EXCEPTION 'Tasks can only belong to active projects';
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

-- Архивные задачи и объекты не попадают в рабочие выборки.
DROP POLICY IF EXISTS projects_read_visible ON public.projects;
CREATE POLICY projects_read_visible
	ON public.projects
	FOR SELECT
	TO authenticated
	USING (
		archived_at IS NULL
		AND (
			public.current_app_role() = 'requester'
			OR EXISTS (
				SELECT 1
				FROM public.tasks AS task
				WHERE task.project_id = projects.id
					AND task.assignee_id = auth.uid()
					AND task.archived_at IS NULL
			)
		)
	);

DROP POLICY IF EXISTS projects_requester_insert ON public.projects;
CREATE POLICY projects_requester_insert
	ON public.projects
	FOR INSERT
	TO authenticated
	WITH CHECK (
		public.current_app_role() = 'requester'
		AND archived_at IS NULL
	);

DROP POLICY IF EXISTS projects_requester_update ON public.projects;
CREATE POLICY projects_requester_update
	ON public.projects
	FOR UPDATE
	TO authenticated
	USING (
		archived_at IS NULL
		AND public.current_app_role() = 'requester'
	)
	WITH CHECK (public.current_app_role() = 'requester');

DROP POLICY IF EXISTS projects_requester_delete ON public.projects;

DROP POLICY IF EXISTS tasks_requester_insert ON public.tasks;
CREATE POLICY tasks_requester_insert
	ON public.tasks
	FOR INSERT
	TO authenticated
	WITH CHECK (
		public.current_app_role() = 'requester'
		AND author_id = auth.uid()
		AND archived_at IS NULL
	);

DROP POLICY IF EXISTS tasks_read_visible ON public.tasks;
CREATE POLICY tasks_read_visible
	ON public.tasks
	FOR SELECT
	TO authenticated
	USING (
		archived_at IS NULL
		AND (
			public.current_app_role() = 'requester'
			OR assignee_id = auth.uid()
		)
	);

DROP POLICY IF EXISTS tasks_update_visible ON public.tasks;
CREATE POLICY tasks_update_visible
	ON public.tasks
	FOR UPDATE
	TO authenticated
	USING (
		archived_at IS NULL
		AND (
			public.current_app_role() = 'requester'
			OR assignee_id = auth.uid()
		)
	)
	WITH CHECK (
		public.current_app_role() = 'requester'
		OR assignee_id = auth.uid()
	);

DROP POLICY IF EXISTS tasks_requester_delete ON public.tasks;

-- Минимальные права клиентских ролей. Удаление заменено архивацией.
REVOKE ALL ON public.profiles, public.projects, public.tasks, public.task_status_history
	FROM PUBLIC, anon, authenticated;

-- Клиенту не нужен email из профилей; оставляем только отображаемые поля.
GRANT SELECT (id, full_name, role) ON public.profiles TO authenticated;
GRANT SELECT ON public.projects, public.tasks, public.task_status_history TO authenticated;
GRANT INSERT, UPDATE ON public.projects, public.tasks TO authenticated;

-- SECURITY DEFINER-функции и trigger-функции доступны только авторизованной роли.
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.write_task_status_history() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_task_mutation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_project_archive() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_project_tasks() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_task_status_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_task_mutation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_project_archive() TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_project_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_task(UUID, public.task_status, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.transition_task(UUID, public.task_status, TEXT) FROM PUBLIC, anon;
