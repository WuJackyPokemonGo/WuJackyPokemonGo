-- 入庫日期預設為上架當天（使用者 2026-11-19 指定）。
-- 商品第一次變成「上架中」且還沒有入庫日期時，用第一次上架時間；之後手動改的入庫日期不會被覆蓋。
-- 觸發器名稱排在 record_first_product_publication 之後執行，所以 first_published_at 已經算好。
create or replace function private.default_first_stocked_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.first_stocked_at is null and new.is_live and new.publication_status = 'published'
     and (tg_op = 'INSERT' or not (old.is_live and old.publication_status = 'published')) then
    new.first_stocked_at := coalesce(new.first_published_at, statement_timestamp());
  end if;
  return new;
end;
$function$;

create or replace trigger set_default_first_stocked_at
before insert or update of is_live, publication_status on public.products
for each row execute function private.default_first_stocked_at();
