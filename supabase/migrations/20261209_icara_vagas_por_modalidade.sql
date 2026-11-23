-- =====================================================================
-- Içara Training Club — vagas por aula conforme a modalidade
--
-- Combinado com o box (23/11/2026):
--   CROSS ............ 16
--   HYROX/HY-FITNESS . 18
--   STRONG/CROSS ..... 16 (turma dividida: 8 no STRONG + 8 no CROSS)
--   STRONG ........... 8
--   AULÃO de sábado .. 30 (toda semana)
--   Wellhub/Totalpass: sem cota separada, ocupam as mesmas vagas da turma.
--
-- Atualiza a grade fixa (schedule_slots.capacity). Ajustes pontuais de uma data
-- (class_sessions.capacity_override) não são tocados.
-- Mantenha igual a src/lib/boxPresets.js (modalities.*.capacity).
-- Pode rodar mais de uma vez.
-- =====================================================================
do $$
declare
  v_box uuid;
  v_n   int;
begin
  select id into v_box from boxes where slug = 'icara-training-club';
  if v_box is null then
    raise notice 'Box icara-training-club não encontrado; nada a fazer.';
    return;
  end if;

  update schedule_slots s
     set capacity = case m.code
                      when 'CROSS'        then 16
                      when 'HYROX'        then 18
                      when 'STRONG'       then 8
                      when 'STRONG_CROSS' then 16
                      when 'AULAO'        then 30
                    end
    from modalities m
   where m.id = s.modality_id
     and s.box_id = v_box
     and m.code in ('CROSS', 'HYROX', 'STRONG', 'STRONG_CROSS', 'AULAO');
  get diagnostics v_n = row_count;

  raise notice 'Içara Training Club: capacidade atualizada em % horários.', v_n;
end $$;

-- Conferência:
-- select s.weekday, s.start_time, m.code, s.capacity
--   from schedule_slots s join modalities m on m.id = s.modality_id join boxes b on b.id = s.box_id
--  where b.slug = 'icara-training-club' and s.active order by s.weekday, s.start_time;
