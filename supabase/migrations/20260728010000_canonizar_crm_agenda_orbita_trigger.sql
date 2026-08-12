-- ITEM 2 — Reforço: canonizar o CRM no momento da ESCRITA em agenda_orbita.
--
-- Motivo: a função in-repo `sync` não é a única (nem necessariamente a atual)
-- escritora de agenda_orbita — o cron `sync-agenda-v2` aponta para uma função
-- fora deste repositório. Um gatilho BEFORE INSERT/UPDATE garante a canonização
-- independentemente de quem escreve, com custo zero em tempo de consulta e sem
-- criar tabelas ou sincronizações novas. A view apenas consome o dado já limpo.
--
-- Regra idêntica à do sync/index.ts (canonizarCrm) e do saneamento único:
-- CRM de 10 dígitos iniciando em "520" -> remove o "0" da 3ª posição ("52"+resto).
-- Só age quando o valor bate exatamente o padrão; caso contrário não toca (no-op),
-- então é seguro e idempotente.

create or replace function public.trg_canonizar_crm_agenda_orbita()
returns trigger
language plpgsql
as $$
begin
  if new.crm ~ '^520\d{7}$' then
    new.crm := '52' || substring(new.crm from 4);
  end if;
  return new;
end;
$$;

drop trigger if exists canonizar_crm_agenda_orbita on public.agenda_orbita;
create trigger canonizar_crm_agenda_orbita
  before insert or update on public.agenda_orbita
  for each row
  execute function public.trg_canonizar_crm_agenda_orbita();
