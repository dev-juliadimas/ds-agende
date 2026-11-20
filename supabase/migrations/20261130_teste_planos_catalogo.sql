-- =====================================================================
-- Alunos de teste ligados ao catálogo de planos (people.plan_id)
--
-- Depende de: 20261119_icara_training_club.sql (plans), 20261122_auto_cadastro.sql
--             (people.plan_id), 20261129_trava_plano_ativo.sql (Elisa) e
--             20261130_regras_plano.sql (regras que isto serve para testar).
--
-- Mantém o limite semanal que cada um já tinha pelo plan_kind:
--   Ana   (ilimitado)          → TOTAL Livre · Mensal          — todas, sem limite
--   Bruno (2x)                 → HY-FITNESS 2x/semana · Mensal — só HYROX + AULÃO:
--                                 testa o bloqueio de modalidade (CROSS é barrado)
--   Carla (3x, vencida)        → TOTAL 3x/semana · Mensal
--   Elisa (3x, pendente)       → TOTAL 3x/semana · Mensal
--
-- Só mexe em people.is_test. Pode rodar mais de uma vez.
-- =====================================================================
do $$
declare v_box uuid;
begin
  select id into v_box from boxes where slug = 'icara-training-club';
  if v_box is null then return; end if;

  update people p
     set plan_id = pl.id
    from (values
            ('Ana Teste (Livre)',      'TOT_LIVRE_MENSAL'),
            ('Bruno Teste (2x)',       'HYF_2X_MENSAL'),
            ('Carla Teste (vencida)',  'TOT_3X_MENSAL'),
            ('Elisa Teste (pendente)', 'TOT_3X_MENSAL')
         ) as m(person_name, plan_code)
    join plans pl on pl.box_id = v_box and pl.code = m.plan_code
   where p.box_id = v_box and p.is_test and p.name = m.person_name;
end $$;
