-- Execute only on the isolated staging project after reviewed-baseline.sql.
-- Every fixture, Auth user and write is rolled back. No emails/passwords/sessions are created.
begin;
set local plpgsql.check_asserts = on;
do $tests$
declare
  admin_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  product_a uuid := gen_random_uuid();
  product_b uuid := gen_random_uuid();
  archived_id uuid := gen_random_uuid();
  batch_id uuid := gen_random_uuid();
  test_order_id uuid := gen_random_uuid();
  bad_order_id uuid := gen_random_uuid();
  adjustment_key uuid := gen_random_uuid();
  receipt_key uuid := gen_random_uuid();
  completion_key uuid := gen_random_uuid();
  return_key uuid := gen_random_uuid();
  original_movement uuid;
  quantity integer;
  movement_count integer;
  audit_count integer;
  result record;
  fixture_sku text := 'ACCEPTANCE-' || gen_random_uuid()::text;
begin
  -- Trusted SQL fixtures are never committed as real administrator identities.
  insert into auth.users(id,aud,role,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
  values (admin_id,'authenticated','authenticated','{}','{}',now(),now()),
         (other_id,'authenticated','authenticated','{"admin":true}','{}',now(),now());
  insert into public.admin_profiles(user_id,display_name) values(admin_id,'Rollback-only acceptance administrator');
  insert into public.products(id,sku,name_zh,publication_status) values
    (product_a,fixture_sku||'-A','驗收商品甲','published'),
    (product_b,fixture_sku||'-B','驗收商品乙','draft'),
    (archived_id,fixture_sku||'-ARCHIVE','已封存驗收商品','archived');
  insert into public.purchase_batches(id,product_id,purchased_at,quantity,unit_cost_twd)
  values(batch_id,product_a,current_date,5,40);
  insert into public.orders(id,status) values(test_order_id,'arrived_for_check'),(bad_order_id,'arrived_for_check');
  insert into public.order_items(order_id,product_id,product_name_snapshot,quantity,sale_unit_price_twd,unit_cost_snapshot_twd)
  values(test_order_id,product_a,'驗收商品甲',2,100,40),
        (test_order_id,product_a,'驗收商品甲重複列',1,100,40),
        (bad_order_id,product_a,'有庫存商品',1,100,40),
        (bad_order_id,product_b,'無庫存商品',1,100,40);

  -- Anonymous callers cannot access private data or invoke operations.
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  begin perform 1 from public.products; raise exception 'anon read unexpectedly allowed';
    exception when insufficient_privilege then null; end;
  begin perform * from public.admin_adjust_inventory(product_a,1,'非法調整',gen_random_uuid());
    raise exception 'anon RPC unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.public_catalog_draft; raise exception 'closed public view unexpectedly readable';
    exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- Signed-in non-admins see no operational rows; editable user metadata cannot grant admin.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  assert not private.is_store_admin(), 'user metadata must not grant admin';
  assert not public.store_admin_status(), 'public membership facade bypassed checks';
  assert (select count(*) from public.products)=0, 'RLS leaked products to non-admin';
  assert (select count(*) from public.orders)=0, 'RLS leaked orders to non-admin';
  begin insert into public.admin_profiles(user_id) values(other_id);
    raise exception 'self promotion unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.products(sku,name_zh) values('UNAUTHORIZED','非法商品');
    raise exception 'non-admin write unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin perform * from public.admin_adjust_inventory(product_a,1,'非法調整',gen_random_uuid());
    raise exception 'non-admin RPC unexpectedly allowed'; exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  assert private.is_store_admin(), 'trusted profile not recognized';
  assert public.store_admin_status(), 'admin membership facade rejected admin';
  assert (select count(*) from public.products where id in(product_a,product_b,archived_id))=3;
  -- Even admins may not bypass stock ledger or mutate transactional fields with direct writes.
  begin insert into public.inventory_balances(product_id,quantity_on_hand) values(product_a,99);
    raise exception 'direct inventory write allowed'; exception when insufficient_privilege then null; end;
  begin update public.purchase_batches set quantity=99 where id=batch_id;
    raise exception 'direct receipt modification allowed'; exception when insufficient_privilege then null; end;
  begin update public.orders set status='completed' where id=test_order_id;
    raise exception 'direct order completion allowed'; exception when insufficient_privilege then null; end;
  begin update public.order_items set quantity=99 where order_items.order_id=test_order_id;
    raise exception 'direct order item modification allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.audit_logs;
    raise exception 'audit deletion allowed'; exception when insufficient_privilege then null; end;

  select * into result from public.admin_adjust_inventory(product_a,10,'期初測試庫存',adjustment_key);
  assert result.previous_quantity=0 and result.new_quantity=10;
  original_movement:=result.movement_id;
  select * into result from public.admin_adjust_inventory(product_a,10,'期初測試庫存',adjustment_key);
  assert result.movement_id=original_movement and result.new_quantity=10, 'retry changed inventory';
  assert (select count(*) from public.inventory_movements where product_id=product_a)=1;
  begin perform * from public.admin_adjust_inventory(product_a,11,'期初測試庫存',adjustment_key);
    raise exception 'key reuse allowed'; exception when unique_violation then null; end;
  begin perform * from public.admin_adjust_inventory(product_a,10,'不同異動原因',adjustment_key);
    raise exception 'changed-reason key reuse allowed'; exception when unique_violation then null; end;
  begin perform * from public.admin_adjust_inventory(product_a,-11,'不得負庫存',gen_random_uuid());
    raise exception 'negative inventory allowed'; exception when check_violation then null; end;
  begin perform * from public.admin_adjust_inventory(product_a,0,'零數量異動',gen_random_uuid());
    raise exception 'zero adjustment allowed'; exception when invalid_parameter_value then null; end;
  begin perform * from public.admin_adjust_inventory(product_a,1,' ',gen_random_uuid());
    raise exception 'empty reason allowed'; exception when invalid_parameter_value then null; end;
  begin perform * from public.admin_adjust_inventory(archived_id,1,'封存商品測試',gen_random_uuid());
    raise exception 'archived product adjustment allowed'; exception when no_data_found then null; end;
  begin perform * from public.admin_adjust_inventory(gen_random_uuid(),1,'不存在商品',gen_random_uuid());
    raise exception 'missing product allowed'; exception when no_data_found then null; end;
  assert (select quantity_on_hand from public.inventory_balances where product_id=product_a)=10;

  select * into result from public.admin_receive_purchase_batch(batch_id,receipt_key);
  assert result.previous_quantity=10 and result.new_quantity=15;
  original_movement:=result.movement_id;
  select * into result from public.admin_receive_purchase_batch(batch_id,receipt_key);
  assert result.movement_id=original_movement and result.new_quantity=15;
  begin perform * from public.admin_receive_purchase_batch(batch_id,gen_random_uuid());
    raise exception 'duplicate purchase receipt allowed'; exception when unique_violation then null; end;
  begin perform * from public.admin_adjust_inventory(product_a,5,'Purchase batch receipt '||batch_id::text,receipt_key);
    raise exception 'purchase key mistaken for manual adjustment'; exception when unique_violation then null; end;

  -- A later product's insufficient stock must roll back the WHOLE order transaction.
  select count(*) into movement_count from public.inventory_movements;
  select count(*) into audit_count from public.audit_logs;
  begin perform * from public.admin_complete_order_and_deduct_stock(bad_order_id,gen_random_uuid());
    raise exception 'insufficient stock order completed'; exception when check_violation then null; end;
  assert (select quantity_on_hand from public.inventory_balances where product_id=product_a)=15;
  assert (select count(*) from public.inventory_movements)=movement_count;
  assert (select count(*) from public.audit_logs)=audit_count;
  assert (select status from public.orders where id=bad_order_id)='arrived_for_check';
  assert not exists(select 1 from public.inventory_balances where product_id=product_b), 'failed transaction left a partial balance row';

  select * into result from public.admin_complete_order_and_deduct_stock(test_order_id,completion_key);
  assert result.resulting_status='completed' and result.movements_created=1, 'duplicate product lines were not aggregated';
  assert (select quantity_on_hand from public.inventory_balances where product_id=product_a)=12;
  select * into result from public.admin_complete_order_and_deduct_stock(test_order_id,completion_key);
  assert result.movements_created=1;
  assert (select quantity_on_hand from public.inventory_balances where product_id=product_a)=12;
  begin perform * from public.admin_complete_order_and_deduct_stock(test_order_id,gen_random_uuid());
    raise exception 'second completion allowed'; exception when unique_violation then null; end;

  select * into result from public.admin_record_order_stock_return(test_order_id,product_a,2,'實物退回驗收',return_key);
  assert result.previous_quantity=12 and result.new_quantity=14;
  original_movement:=result.movement_id;
  select * into result from public.admin_record_order_stock_return(test_order_id,product_a,2,'實物退回驗收',return_key);
  assert result.movement_id=original_movement and result.new_quantity=14;
  begin perform * from public.admin_record_order_stock_return(test_order_id,product_a,2,'超額退回測試',gen_random_uuid());
    raise exception 'excess return allowed'; exception when check_violation then null; end;
  begin perform * from public.admin_record_order_stock_return(test_order_id,product_a,1,'實物退回驗收',return_key);
    raise exception 'return key reused for new quantity'; exception when unique_violation then null; end;
  assert (select quantity_on_hand from public.inventory_balances where product_id=product_a)=14;
  assert (select sum(quantity_delta) from public.inventory_movements where product_id=product_a)=14, 'ledger does not match balance';
  assert (select count(*) from public.inventory_movements where product_id=product_a)=4;
  assert (select count(*) from public.audit_logs where actor_user_id=admin_id)=4;
  execute 'reset role';
end;
$tests$;
select 'passed' as acceptance_result, 'permissions, RLS, admin checks, manual adjustments, receipts, order completion, returns, retries, all-or-nothing rollback and ledger reconciliation' as verified;
rollback;
