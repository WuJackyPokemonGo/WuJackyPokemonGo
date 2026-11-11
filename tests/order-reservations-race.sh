#!/usr/bin/env bash
# 真實 PostgreSQL 併發驗收（npm test 用的 PGlite 是單一連線，無法驗證同時搶貨）。
# 用法：PGHOST=… PGPORT=… PGUSER=… bash tests/order-reservations-race.sh   （會建立／覆蓋名為 wj_race 的測試資料庫）
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="psql -v ON_ERROR_STOP=1 -q -X"
A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
$PSQL -d postgres -c "drop database if exists wj_race" -c "create database wj_race" >/dev/null 2>&1
for r in anon authenticated service_role; do $PSQL -d postgres -c "do \$\$begin create role $r; exception when duplicate_object then null; end\$\$" >/dev/null; done
sed '/^create role anon;create role authenticated;create role service_role;$/d' tests/checkout-fixture.sql | $PSQL -d wj_race >/dev/null
$PSQL -d wj_race -c "alter table public.order_items add column if not exists created_at timestamptz default clock_timestamp()" >/dev/null
$PSQL -d wj_race -f supabase/review/order-reservations.sql >/dev/null 2>/dev/null
uuid(){ printf '00000000-0000-4000-8000-%012d' "$1"; }
$PSQL -d wj_race -At >/dev/null <<SQL
select set_config('request.jwt.claim.sub','$A',false);
insert into products(id,sku,name_zh) values('$(uuid 1)','WJ-R','最後一份'),('$(uuid 2)','WJ-M','多人搶');
select admin_upsert_account_units('[{"unit_code":"R1","sku":"WJ-R","status":"可出貨"}]');
select admin_upsert_account_units((select jsonb_agg(jsonb_build_object('unit_code','M'||g,'sku','WJ-M','status','可出貨')) from generate_series(1,5) g));
insert into orders(id,channel) values('$(uuid 11)','line'),('$(uuid 12)','threads');
insert into order_items(order_id,product_id,product_name_snapshot,quantity) values('$(uuid 11)','$(uuid 1)','x',1),('$(uuid 12)','$(uuid 1)','x',1);
insert into orders(id,channel) select ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'website' from generate_series(101,120) g;
insert into order_items(order_id,product_id,product_name_snapshot,quantity) select ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'$(uuid 2)','x',1 from generate_series(101,120) g;
SQL
# 案例：兩張訂單在同一時間成立、各自交易保持 1.5 秒，搶最後 1 份
for o in 11 12; do ( $PSQL -d wj_race -c "begin" -c "update orders set status='awaiting_payment' where id='$(uuid $o)'" -c "select pg_sleep(1.5)" -c "commit" >/dev/null ) & done; wait
two=$($PSQL -d wj_race -At -c "select count(*) from account_units where unit_code='R1' and status='reserved'")
winners=$($PSQL -d wj_race -At -c "select count(*) from orders o where o.channel in ('line','threads') and exists(select 1 from account_units u where u.order_id=o.id)")
# 案例：20 張訂單同時成立，搶 5 份
for g in $(seq 101 120); do ( $PSQL -d wj_race -c "update orders set status='awaiting_payment' where id='$(uuid $g)'" >/dev/null ) & done; wait
res=$($PSQL -d wj_race -At -c "select count(*) filter (where n=1)||' '||count(*) filter (where n=0)||' '||count(*) filter (where n>1) from (select (select count(*) from account_units u where u.order_id=o.id) n from orders o where o.channel='website') x")
echo "兩張搶最後一份：保留成功訂單 $winners 張（應為 1），R1 已保留 $two 次（應為 1）"
echo "20 張搶 5 份：拿到／待叫貨／重複 = $res（應為 5 15 0）"
[ "$winners" = 1 ] && [ "$two" = 1 ] && [ "$res" = "5 15 0" ] && echo PASS || { echo FAIL; exit 1; }
