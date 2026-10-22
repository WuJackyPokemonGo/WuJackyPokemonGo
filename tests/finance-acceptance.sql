begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.admin_profiles limit 1),true);
do $test$
declare pid uuid;oid uuid;bid uuid;rid uuid;receipt1 uuid;receipt2 uuid;refund_id uuid;req uuid;payload jsonb;r jsonb;o public.orders;rejected boolean;before_profit numeric;after_profit numeric;ex uuid;v timestamptz;snapshot jsonb;token text;lease_job jsonb;
begin
 r:=private.business_report((now()at time zone'Asia/Taipei')::date,(now()at time zone'Asia/Taipei')::date);before_profit:=(r->'summary'->>'estimated_profit_twd')::numeric;
 insert into public.products(sku,name_zh)values('__FIN_QA_'||gen_random_uuid()::text,'財務回滾驗收')returning id into pid;
 for bid in select unnest(array[gen_random_uuid(),gen_random_uuid()])loop
  payload:=jsonb_build_object('product_id',pid,'quantity',10,'purchased_at',(now()at time zone'Asia/Taipei')::date,'unit_cost_twd',case when exists(select 1 from public.purchase_batches where product_id=pid)then'200'else'100'end,'extra_cost_twd',case when exists(select 1 from public.purchase_batches where product_id=pid)then'0'else'20'end);
  r:=public.admin_store_operation('create_purchase',payload,gen_random_uuid());perform public.admin_store_operation('receive_purchase',jsonb_build_object('id',r->>'id'),gen_random_uuid());
 end loop;
 if(select unit_cost_twd from public.inventory_valuations where product_id=pid)<>151 then raise exception'Weighted average is incorrect';end if;
 payload:=jsonb_build_object('channel','website','customer_alias','回滾驗收','fee_twd',10,'other_cost_twd',20,'items',jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',2,'sale_unit_price_twd',400,'unit_cost_snapshot_twd',null,'use_weighted_cost',true)));
 r:=public.admin_store_operation('save_order',payload,gen_random_uuid());oid:=(r->>'id')::uuid;select *into o from public.orders where id=oid;
 if(select unit_cost_snapshot_twd from public.order_items where order_id=oid limit 1)<>151 then raise exception'Weighted cost snapshot missing';end if;
 perform public.admin_store_operation('transition_order',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'status','awaiting_payment','reason','確認商品售價成本'),gen_random_uuid());select *into o from public.orders where id=oid;
 req:=gen_random_uuid();payload:=jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'kind','receipt','amount_twd',300,'occurred_at',now(),'reference_private','QA-RECEIPT-1','reason','第一筆實際收款');r:=public.admin_store_operation('record_payment',payload,req);receipt1:=(r->>'payment_id')::uuid;
 if r<>public.admin_store_operation('record_payment',payload,req)then raise exception'Payment retry not idempotent';end if;select *into o from public.orders where id=oid;
 if o.received_amount_twd<>300 then raise exception'Partial receipt incorrect';end if;
 rejected:=false;begin perform public.admin_store_operation('transition_order',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'status','paid_awaiting_purchase','reason','測試未收齊拒絕'),gen_random_uuid());exception when check_violation then rejected:=true;end;if not rejected then raise exception'Partial payment marked full';end if;
 r:=public.admin_store_operation('record_payment',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'kind','receipt','amount_twd',500,'occurred_at',now(),'reference_private','QA-RECEIPT-2','reason','第二筆實際收款'),gen_random_uuid());receipt2:=(r->>'payment_id')::uuid;select *into o from public.orders where id=oid;
 perform public.admin_store_operation('transition_order',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'status','paid_awaiting_purchase','reason','兩筆已實際收齊'),gen_random_uuid());select *into o from public.orders where id=oid;
 perform public.admin_store_operation('transition_order',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'status','ordered_from_supplier','reason','已向供應商訂購','supplier_reference_private','QA-SUPPLIER'),gen_random_uuid());select *into o from public.orders where id=oid;
 perform public.admin_store_operation('transition_order',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'status','arrived_for_check','reason','實際到貨待驗'),gen_random_uuid());select *into o from public.orders where id=oid;
 perform public.admin_store_operation('complete_order',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at),gen_random_uuid());select *into o from public.orders where id=oid;
 perform public.admin_store_operation('transition_order',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'status','refund_pending','reason','售後退款驗收'),gen_random_uuid());select *into o from public.orders where id=oid;
 for rid in select unnest(array[gen_random_uuid(),gen_random_uuid()])loop
  perform public.admin_store_operation('record_payment',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'kind','refund','amount_twd',case when o.refund_amount_twd=0 then 200 else 100 end,'occurred_at',now(),'reference_private','QA-REFUND-'||rid,'reason','分次退款已完成','receipt_id',receipt1,'affects_revenue',true),gen_random_uuid());select *into o from public.orders where id=oid;
 end loop;
 rejected:=false;begin perform public.admin_store_operation('record_payment',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'kind','refund','amount_twd',1,'occurred_at',now(),'reference_private','QA-EXCESS','reason','測試超額拒絕','receipt_id',receipt1,'affects_revenue',true),gen_random_uuid());exception when check_violation then rejected:=true;end;if not rejected then raise exception'Receipt over-refund accepted';end if;
 perform public.admin_store_operation('transition_order',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'status','refunded','reason','目前退款已完成'),gen_random_uuid());select *into o from public.orders where id=oid;
 r:=public.admin_store_operation('record_payment',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'kind','refund','amount_twd',50,'occurred_at',now(),'reference_private','QA-REFUND-VOID','reason','測試誤記更正','receipt_id',receipt2,'affects_revenue',true),gen_random_uuid());refund_id:=(r->>'payment_id')::uuid;select *into o from public.orders where id=oid;
 perform public.admin_store_operation('void_payment',jsonb_build_object('id',oid,'expected_updated_at',o.updated_at,'payment_id',refund_id,'reason','更正誤記未實退'),gen_random_uuid());select *into o from public.orders where id=oid;
 if o.refund_amount_twd<>300 or(select quantity_on_hand from public.inventory_balances where product_id=pid)<>18 then raise exception'Refund changed stock or wrong aggregate';end if;
 perform public.admin_store_operation('return_stock',jsonb_build_object('id',oid,'product_id',pid,'quantity',1,'reason','實際退回可再售'),gen_random_uuid());
 r:=public.admin_store_operation('create_expense',jsonb_build_object('spent_at',(now()at time zone'Asia/Taipei')::date,'category','驗收費用','amount_twd','30.00','reason','實際營運支出'),gen_random_uuid());ex:=(r->>'id')::uuid;
 r:=private.business_report((now()at time zone'Asia/Taipei')::date,(now()at time zone'Asia/Taipei')::date);after_profit:=(r->'summary'->>'estimated_profit_twd')::numeric;
 if before_profit is not null and after_profit-before_profit<>289 then raise exception'Profit reconciliation failed: %',after_profit-before_profit;end if;
 perform public.admin_store_operation('void_expense',jsonb_build_object('id',ex,'reason','更正驗收費用'),gen_random_uuid());
 if(select count(*)from public.order_payments where order_id=oid)<>5 then raise exception'Payment history was deleted';end if;
 perform public.admin_adjust_inventory(pid,1,'未知成本盤點驗收',gen_random_uuid());if(select unit_cost_twd from public.inventory_valuations where product_id=pid)is not null then raise exception'Unknown adjustment cost guessed';end if;
 perform public.admin_store_operation('set_inventory_cost',jsonb_build_object('product_id',pid,'unit_cost_twd','123.45','reason','確認實際盤點成本'),gen_random_uuid());if(select unit_cost_twd from public.inventory_valuations where product_id=pid)<>123.45 then raise exception'Explicit cost correction failed';end if;
 if public.track_store_event('customer_contact',gen_random_uuid(),gen_random_uuid(),null)then raise exception'Unapproved analytics accepted';end if;
 req:=gen_random_uuid();rid:=gen_random_uuid();if not public.track_store_event('page_view',rid,req,null)or public.track_store_event('page_view',rid,req,null)then raise exception'Analytics idempotency failed';end if;
 r:=public.admin_data_io('restore_preview',jsonb_build_object('document',public.admin_backup_document()),null);if not(r->>'can_restore')::boolean or(r->>'missing')::int<>0 then raise exception'V2 snapshot mismatch';end if;
-- Remove only this transaction's synthetic records and prove v2 restores dependencies atomically.
 snapshot:=public.admin_backup_document();
 delete from public.valuation_events where product_id=pid;
 delete from public.inventory_movements where product_id=pid;
 delete from public.inventory_balances where product_id=pid;
 delete from public.inventory_valuations where product_id=pid;
 delete from public.order_payments where order_id=oid;
 r:=public.admin_data_io('restore_missing',jsonb_build_object('document',snapshot),gen_random_uuid());
 if (r->>'inserted')::int<8 or(select quantity_on_hand from public.inventory_balances where product_id=pid)<>20 or(select unit_cost_twd from public.inventory_valuations where product_id=pid)<>123.45 or(select count(*)from public.order_payments where order_id=oid)<>5 then raise exception'Full v2 restore lost ledger or valuation state';end if;
 -- Legacy backups retain known aggregates and unknown classifications instead
 -- of dropping payments or inventing original individual transfers.
 update public.orders set refund_resume_status=null where id=oid;
 update public.expenses set voided_at=null,void_reason='' where id=ex;
 update public.purchase_batches set updated_at=null where product_id=pid;
 snapshot:=public.admin_backup_document();
 snapshot:=jsonb_set(snapshot,'{data}',(snapshot->'data')-'order_payments'-'inventory_valuations'-'valuation_events');
 snapshot:=jsonb_set(snapshot,'{data,orders}',coalesce((select jsonb_agg(j-'refund_resume_status')from jsonb_array_elements(snapshot->'data'->'orders')j),'[]'));
 snapshot:=jsonb_set(snapshot,'{data,purchase_batches}',coalesce((select jsonb_agg(j-'updated_at'-'cancelled_at'-'cancellation_reason')from jsonb_array_elements(snapshot->'data'->'purchase_batches')j),'[]'));
 snapshot:=jsonb_set(snapshot,'{data,expenses}',coalesce((select jsonb_agg(j-'voided_at'-'void_reason')from jsonb_array_elements(snapshot->'data'->'expenses')j),'[]'));
 snapshot:=jsonb_set(snapshot,'{version}','1');
 delete from public.order_payments where order_id=oid;
 r:=private.normalize_backup(snapshot);
 if jsonb_array_length(r->'data'->'order_payments')<>2 or exists(select 1 from jsonb_array_elements(r->'data'->'order_payments')j where j->>'legacy'<>'true' or j->>'receipt_id'is not null or j->>'affects_revenue'is not null) then raise exception'Legacy payment facts were invented or lost';end if;
 perform public.admin_data_io('restore_missing',jsonb_build_object('document',snapshot),gen_random_uuid());
 if (select sum(amount_twd)from public.order_payments where order_id=oid and kind='receipt')<>800 or(select sum(amount_twd)from public.order_payments where order_id=oid and kind='refund')<>300 then raise exception'Legacy amounts failed reconciliation';end if;
 -- Configured fees are explicit and versioned; malformed rules cannot be accepted.
 select updated_at into v from public.app_settings where key='fee_rules';
 perform public.admin_business_query('save_fee_rule',jsonb_build_object('channel','website','expected_updated_at',v,'rule',jsonb_build_object('enabled',true,'basis_points',250,'fixed_twd',3,'rounding','ceil')));
 r:=public.admin_business_query('fee_quote','{"channel":"website","subtotal":101}');if(r->>'fee_twd')::int<>6 then raise exception'Fee calculation incorrect';end if;
 select updated_at into v from public.app_settings where key='fee_rules';
 rejected:=false;begin perform public.admin_business_query('save_fee_rule',jsonb_build_object('channel','website','expected_updated_at',v,'rule','{"enabled":true}'::jsonb));exception when check_violation then rejected:=true;end;if not rejected then raise exception'Incomplete fee rule accepted';end if;
 -- Unreceived purchases can be edited/cancelled but cannot subsequently enter stock.
 r:=public.admin_store_operation('create_purchase',jsonb_build_object('product_id',pid,'quantity',1,'purchased_at',current_date,'unit_cost_twd','10','extra_cost_twd','0'),gen_random_uuid());bid:=(r->>'id')::uuid;
 perform public.admin_store_operation('edit_purchase',jsonb_build_object('id',bid,'expected_updated_at',null,'purchased_at',current_date,'quantity',2,'unit_cost_twd','15','extra_cost_twd','0','reason','修正未到貨採購'),gen_random_uuid());
 select updated_at into v from public.purchase_batches where id=bid;
 perform public.admin_store_operation('cancel_purchase',jsonb_build_object('id',bid,'expected_updated_at',v,'reason','取消未到貨採購'),gen_random_uuid());
 rejected:=false;begin perform public.admin_store_operation('receive_purchase',jsonb_build_object('id',bid),gen_random_uuid());exception when check_violation then rejected:=true;end;if not rejected then raise exception'Cancelled purchase entered stock';end if;
 -- Scheduled jobs authenticate internally, keep notifications off, and require complete manifests.
 update public.app_settings set value=value||'{"backup_hour":0,"discord_enabled":false}'where key='jobs';
 insert into private.backup_runs(day,document)values((now()at time zone'Asia/Taipei')::date+1,private.app_backup_document());
 select decrypted_secret into token from vault.decrypted_secrets where name='wj_maintenance_token';
 rejected:=false;begin perform public.maintenance_work('invalid','claim','{}');exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception'Unauthenticated maintenance accepted';end if;
 r:=public.maintenance_work(token,'claim','{}');lease_job:=r->'backup';if lease_job is null or r->>'webhook'is not null then raise exception'Daily backup missing or disabled notification enabled';end if;
 perform public.maintenance_work(token,'progress',jsonb_build_object('id',lease_job->>'id','lease',lease_job->>'lease','plan','[]'::jsonb,'cursor',0));
 rejected:=false;begin perform public.maintenance_work(token,'complete',jsonb_build_object('id',lease_job->>'id','lease',lease_job->>'lease','object_count',1,'manifest_path','daily/qa/manifest.json'));exception when check_violation then rejected:=true;end;if not rejected then raise exception'Incomplete backup accepted';end if;
 perform public.maintenance_work(token,'complete',jsonb_build_object('id',lease_job->>'id','lease',lease_job->>'lease','object_count',0,'manifest_path','daily/qa/manifest.json'));
 r:=public.admin_job_control('status','{}');if jsonb_array_length(r->'backups')<1 then raise exception'Job status unavailable';end if;
end $test$;
rollback;
