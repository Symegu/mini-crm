-- Демонстрационные данные для локальной/тестовой базы мини-CRM.
-- Запускать ПОСЛЕ supabase/setup.sql и создания профилей пользователей.
-- Выполнять целиком в Supabase Dashboard -> SQL Editor от имени postgres.
-- Повторный запуск не дублирует активные демо-объекты и задачи.
-- Не запускайте этот файл в production-базе с реальными данными.

BEGIN;

DO $seed$
DECLARE
    v_requester_id UUID;
    v_executor_one_id UUID;
    v_executor_two_id UUID;
    v_assignee_id UUID;
    v_project_id UUID;
    v_task_id UUID;
    v_demo RECORD;
BEGIN
    SELECT profile.id
    INTO v_requester_id
    FROM public.profiles AS profile
    WHERE profile.role = 'requester'
    ORDER BY profile.created_at, profile.id
    LIMIT 1;

    SELECT profile.id
    INTO v_executor_one_id
    FROM public.profiles AS profile
    WHERE profile.role = 'executor'
    ORDER BY profile.created_at, profile.id
    OFFSET 0
    LIMIT 1;

    SELECT profile.id
    INTO v_executor_two_id
    FROM public.profiles AS profile
    WHERE profile.role = 'executor'
    ORDER BY profile.created_at, profile.id
    OFFSET 1
    LIMIT 1;

    IF v_requester_id IS NULL THEN
        RAISE EXCEPTION 'Для демо-данных нужен хотя бы один профиль с ролью requester';
    END IF;

    IF v_executor_one_id IS NULL OR v_executor_two_id IS NULL THEN
        RAISE EXCEPTION 'Для демо-данных нужны два профиля с ролью executor';
    END IF;

    -- Создаём только те активные объекты, которых ещё нет.
    INSERT INTO public.projects (name, address)
    SELECT demo.name, demo.address
    FROM (
        VALUES
            ('ЖК Северный квартал', 'Москва, ул. Строителей, 12'),
            ('Бизнес-центр Парк', 'Москва, пр-т Мира, 45'),
            ('Складской комплекс Восток', 'Московская область, г. Балашиха, ул. Заводская, 8')
    ) AS demo(name, address)
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.projects AS project
        WHERE project.name = demo.name
            AND project.address = demo.address
            AND project.archived_at IS NULL
    );

    -- Создание задачи всегда проходит штатную проверку guard_task_mutation.
    -- Затем статусы меняются через transition_task, поэтому история отражает
    -- реальные переходы, а защитные триггеры остаются включёнными.
    FOR v_demo IN
        SELECT *
        FROM (
            VALUES
                (
                    'Подготовить строительную площадку',
                    'Проверить ограждение территории, временное электроснабжение и доступ техники.',
                    'ЖК Северный квартал',
                    1,
                    'new'::public.task_status
                ),
                (
                    'Смонтировать опалубку первого этажа',
                    'Завершить монтаж опалубки и подготовить участок к проверке геометрии.',
                    'ЖК Северный квартал',
                    1,
                    'in_progress'::public.task_status
                ),
                (
                    'Проверить армирование перекрытия',
                    'Проверить шаг арматуры, защитный слой и соответствие рабочим чертежам.',
                    'ЖК Северный квартал',
                    2,
                    'review'::public.task_status
                ),
                (
                    'Согласовать план электрики',
					 'Проверить итоговую схему прокладки кабельных трасс и расположение щитов.',
                    'Бизнес-центр Парк',
                    2,
                    'accepted'::public.task_status
                ),
                (
                    'Исправить разметку перегородок',
                    'Повторно выполнить разметку по актуальной версии архитектурного плана.',
                    'Бизнес-центр Парк',
                    1,
                    'rework'::public.task_status
                ),
                (
                    'Подготовить основание под стеллажи',
                    'Проверить отметки пола и подготовить зоны установки стеллажных конструкций.',
                    'Складской комплекс Восток',
                    2,
                    'in_progress'::public.task_status
                )
        ) AS demo(title, description, project_name, assignee_number, target_status)
    LOOP
        SELECT project.id
        INTO v_project_id
        FROM public.projects AS project
        WHERE project.name = v_demo.project_name
            AND project.archived_at IS NULL
        ORDER BY project.created_at, project.id
        LIMIT 1;

        IF v_project_id IS NULL THEN
            RAISE EXCEPTION 'Не найден активный объект: %', v_demo.project_name;
        END IF;

        v_assignee_id := CASE v_demo.assignee_number
            WHEN 1 THEN v_executor_one_id
            ELSE v_executor_two_id
        END;

        SELECT task.id
        INTO v_task_id
        FROM public.tasks AS task
        WHERE task.project_id = v_project_id
            AND task.title = v_demo.title
            AND task.assignee_id = v_assignee_id
            AND task.archived_at IS NULL
        ORDER BY task.created_at, task.id
        LIMIT 1;

        -- Уже существующие активные задачи не изменяем: seed безопасен для повторного запуска.
        IF v_task_id IS NOT NULL THEN
            CONTINUE;
        END IF;

        -- Имитируем JWT постановщика в рамках этой транзакции.
        PERFORM set_config('request.jwt.claim.sub', v_requester_id::TEXT, TRUE);
        PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
        PERFORM set_config(
            'request.jwt.claims',
            jsonb_build_object(
                'sub', v_requester_id::TEXT,
                'role', 'authenticated'
            )::TEXT,
            TRUE
        );

        IF auth.uid() IS DISTINCT FROM v_requester_id
            OR public.current_app_role() IS DISTINCT FROM 'requester'
        THEN
            RAISE EXCEPTION 'Не удалось установить JWT-контекст постановщика для seed';
        END IF;

        INSERT INTO public.tasks (
            title,
            description,
            project_id,
            assignee_id,
            author_id,
            status
        )
        VALUES (
            v_demo.title,
            v_demo.description,
            v_project_id,
            v_assignee_id,
            v_requester_id,
            'new'
        )
        RETURNING id INTO v_task_id;

        IF v_demo.target_status <> 'new' THEN
            -- Исполнитель переводит задачу в работу.
            PERFORM set_config('request.jwt.claim.sub', v_assignee_id::TEXT, TRUE);
            PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
            PERFORM set_config(
                'request.jwt.claims',
                jsonb_build_object(
                    'sub', v_assignee_id::TEXT,
                    'role', 'authenticated'
                )::TEXT,
                TRUE
            );

            IF auth.uid() IS DISTINCT FROM v_assignee_id
                OR public.current_app_role() IS DISTINCT FROM 'executor'
            THEN
                RAISE EXCEPTION 'Не удалось установить JWT-контекст исполнителя для seed';
            END IF;

            PERFORM public.transition_task(v_task_id, 'in_progress', NULL);
        END IF;

        IF v_demo.target_status IN ('review', 'accepted', 'rework') THEN
            PERFORM public.transition_task(v_task_id, 'review', NULL);
        END IF;
		IF v_demo.target_status IN ('accepted', 'rework') THEN
            -- Постановщик принимает задачу либо возвращает её с комментарием.
            PERFORM set_config('request.jwt.claim.sub', v_requester_id::TEXT, TRUE);
            PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
            PERFORM set_config(
                'request.jwt.claims',
                jsonb_build_object(
                    'sub', v_requester_id::TEXT,
                    'role', 'authenticated'
                )::TEXT,
                TRUE
            );

            IF auth.uid() IS DISTINCT FROM v_requester_id
                OR public.current_app_role() IS DISTINCT FROM 'requester'
            THEN
                RAISE EXCEPTION 'Не удалось восстановить JWT-контекст постановщика для seed';
            END IF;

            PERFORM public.transition_task(
                v_task_id,
                v_demo.target_status,
                CASE
                    WHEN v_demo.target_status = 'rework'
                        THEN 'Необходимо исправить разметку по актуальному плану.'
                    ELSE NULL
                END
            );
        END IF;
    END LOOP;

    -- Не оставляем подменённый JWT в текущей транзакции после загрузки.
    PERFORM set_config('request.jwt.claim.sub', '', TRUE);
    PERFORM set_config('request.jwt.claim.role', '', TRUE);
    PERFORM set_config('request.jwt.claims', '', TRUE);
END;
$seed$;

COMMIT;
 -- Контрольный результат: активные демо-объекты и распределение задач по статусам.
SELECT
    project.name AS object_name,
    COUNT(task.id) AS active_tasks,
    COUNT(task.id) FILTER (WHERE task.status = 'new') AS new_tasks,
    COUNT(task.id) FILTER (WHERE task.status = 'in_progress') AS in_progress_tasks,
    COUNT(task.id) FILTER (WHERE task.status = 'review') AS review_tasks,
    COUNT(task.id) FILTER (WHERE task.status = 'accepted') AS accepted_tasks,
    COUNT(task.id) FILTER (WHERE task.status = 'rework') AS rework_tasks
FROM public.projects AS project
LEFT JOIN public.tasks AS task
    ON task.project_id = project.id
    AND task.archived_at IS NULL
WHERE project.archived_at IS NULL
    AND project.name IN (
        'ЖК Северный квартал',
        'Бизнес-центр Парк',
        'Складской комплекс Восток'
    )
GROUP BY project.id, project.name
ORDER BY project.name;

-- Контроль полноты истории для активных демо-задач.
SELECT
    task.title,
    task.status,
    COUNT(history.id) AS history_events
FROM public.tasks AS task
JOIN public.projects AS project ON project.id = task.project_id
LEFT JOIN public.task_status_history AS history ON history.task_id = task.id
WHERE task.archived_at IS NULL
    AND project.archived_at IS NULL
    AND project.name IN (
        'ЖК Северный квартал',
        'Бизнес-центр Парк',
        'Складской комплекс Восток'
    )
    AND task.title IN (
        'Подготовить строительную площадку',
        'Смонтировать опалубку первого этажа',
        'Проверить армирование перекрытия',
        'Согласовать план электрики',
        'Исправить разметку перегородок',
        'Подготовить основание под стеллажи'
    )
GROUP BY task.id, task.title, task.status
ORDER BY task.title;
