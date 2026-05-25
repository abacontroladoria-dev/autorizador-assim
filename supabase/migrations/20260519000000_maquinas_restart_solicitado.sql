alter table maquinas
  add column if not exists restart_solicitado boolean not null default false;
