-- Privacidad de colaboradores (20-11-2026)
-- Un asesor invitado a colaborar en una vacante recibía la ficha completa del postulante:
-- teléfono y correo (si el postulante los compartió con la empresa), notas internas, evaluaciones,
-- etiquetas, análisis de IA y la oferta. Desde ahora recibe solo lo necesario para aportar:
-- perfil laboral, respuestas, etapa e historial. El equipo de la empresa recibe lo mismo que antes.
-- Solo cambia la función subject_detail; no toca datos. Respaldo en backup.fn_subject_detail_20261121.
create schema if not exists backup;
create table if not exists backup.fn_subject_detail_20261121 as
  select now() saved_at, pg_get_functiondef('public.subject_detail(uuid,uuid)'::regprocedure) def;

do $m$
declare d text; n text;
  old_end text := $x$
  );
  return res;
end$x$;
  new_end text := $x$
  );
  -- Colaborador invitado (no es del equipo de la empresa): vista reducida
  if not is_company_member(j.company_id) then
    res := res || jsonb_build_object(
      'candidate', (res->'candidate') - 'phone' - 'email',
      'evaluations', '[]'::jsonb, 'notes', '[]'::jsonb, 'tags', '[]'::jsonb, 'ai', '{}'::jsonb,
      'offer', null, 'can_manage', false, 'collab_view', true);
  end if;
  return res;
end$x$;
begin
  d := pg_get_functiondef('public.subject_detail(uuid,uuid)'::regprocedure);
  if strpos(d, 'collab_view') > 0 then return; end if;
  n := replace(d, old_end, new_end);
  if n = d then raise exception 'subject_detail: no se encontró el final de la función'; end if;
  execute n;
end $m$;
