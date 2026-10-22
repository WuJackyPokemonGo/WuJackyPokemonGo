-- Supabase docs warn that PostgREST 14 retries SQLSTATE 40001.
do $patch$
declare definition text;
begin
 select pg_get_functiondef('private.admin_save_catalog_product(uuid,timestamptz,jsonb,uuid[])'::regprocedure) into definition;
 if strpos(definition,'raise serialization_failure')>0 then
  execute replace(definition,'raise serialization_failure', 'raise sqlstate ''PT409''');
 end if;
end; $patch$;
