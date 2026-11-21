#!/bin/bash
# Real-Postgres concurrency test for self-checkout (local throwaway DB only).
# Usage: start a throwaway Postgres on port 55432 (socket /tmp), create database "race",
# load tests/checkout-fixture.sql and supabase/review/self-checkout.sql, then run this script.
# Never point it at production.
P="psql -h /tmp -p 55432 -U postgres -d race -At -q"
ADMIN="select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);"
OUT=${RACE_OUT:-$(mktemp -d)}; mkdir -p $OUT
setup(){ $P >/dev/null <<SQL
$ADMIN
do \$\$declare s jsonb;begin s:=private.admin_checkout('settings','{}');
perform private.admin_checkout('save_settings',jsonb_build_object('version',s->'version','config',(s->'config')||'{"enabled":true,"bank_name":"Test","bank_code":"004","bank_account":"0000012345","account_name":"Test only","turnstile_site_key":"test_public_key_12345","max_units":99}'::jsonb));end\$\$;
SQL
}
mkprod(){ # id stock
 $P -c "insert into products(id,sku,name_zh,public_price_twd,is_live) values('$1','T-$2','測試$2',80,true) on conflict(id) do nothing;
 update products set public_price_twd=80,is_live=true,publication_status='published',supply_status='available',price_is_inquiry=false where id='$1';
 insert into inventory_balances values('$1',$2,now()) on conflict(product_id) do update set quantity_on_hand=$2;
 insert into inventory_valuations values('$1',10) on conflict do nothing;" >/dev/null; }
worker(){ # name payload secret
 $P -c "select pg_advisory_lock_shared(4242);" -c "select private.self_checkout('create','$2'::jsonb,'$3');" >$OUT/$1.ok 2>$OUT/$1.err; }
gate_close(){ ( $P -c "select pg_advisory_lock(4242); select pg_sleep(3);" >/dev/null & ); sleep 0.5; }
pay(){ # rid contact items_json
 echo "{\"request_id\":\"$1\",\"name\":\"Buyer\",\"contact_channel\":\"email\",\"contact\":\"$2\",\"note\":\"\",\"accepted_terms\":true,\"terms_version\":\"review-1\",\"items\":$3}"; }
uuid(){ cat /proc/sys/kernel/random/uuid; }
sec(){ head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
held(){ $P -c "select private.checkout_held('$1')"; }
summary(){ # prefix
 ok=$(grep -l '"id"' $OUT/$1*.ok 2>/dev/null | wc -l); errs=$(cat $OUT/$1*.err 2>/dev/null | grep -o 'ERROR: [^C]*' | sed 's/ *$//' | sort | uniq -c | tr '\n' ';'); echo "成功 $ok 筆 | 失敗原因: ${errs:-無}"; }
setup
echo "── 1. 兩條連線同時搶最後 1 件（庫存 1）"
A=aaaaaaaa-0000-4000-8000-000000000001; mkprod $A 1
gate_close; for i in 1 2; do worker s1_$i "$(pay $(uuid) b1_$i@x.test "[{\"id\":\"$A\",\"qty\":1,\"expected_price\":80}]")" $(sec) & done; wait
summary s1_; echo "   保留中 $(held $A) / 庫存 1"
echo "── 2. 30 條連線同時搶 5 件"
B=aaaaaaaa-0000-4000-8000-000000000002; mkprod $B 5
gate_close; for i in $(seq 1 30); do worker s2_$i "$(pay $(uuid) b2_$i@x.test "[{\"id\":\"$B\",\"qty\":1,\"expected_price\":80}]")" $(sec) & done; wait
summary s2_; echo "   保留中 $(held $B) / 庫存 5"
echo "── 3. 20 筆兩件組合單，一半商品順序顛倒（檢查卡死）；兩商品各 6 件"
C=aaaaaaaa-0000-4000-8000-000000000003; D=aaaaaaaa-0000-4000-8000-000000000004; mkprod $C 6; mkprod $D 6
gate_close; for i in $(seq 1 20); do if [ $((i%2)) = 0 ]; then it="[{\"id\":\"$C\",\"qty\":1,\"expected_price\":80},{\"id\":\"$D\",\"qty\":1,\"expected_price\":80}]"; else it="[{\"id\":\"$D\",\"qty\":1,\"expected_price\":80},{\"id\":\"$C\",\"qty\":1,\"expected_price\":80}]"; fi; worker s3_$i "$(pay $(uuid) b3_$i@x.test "$it")" $(sec) & done; wait
summary s3_; echo "   保留中 C=$(held $C) D=$(held $D) / 各 6；卡死次數 $(cat $OUT/s3_*.err | grep -c deadlock)"
echo "── 4. 下單同時，後台把庫存從 3 改成 1"
E=aaaaaaaa-0000-4000-8000-000000000005; mkprod $E 3
gate_close; for i in 1 2 3; do worker s4_$i "$(pay $(uuid) b4_$i@x.test "[{\"id\":\"$E\",\"qty\":1,\"expected_price\":80}]")" $(sec) & done
( $P -c "select pg_advisory_lock_shared(4242);" -c "update inventory_balances set quantity_on_hand=1 where product_id='$E';" >$OUT/s4_admin.ok 2>$OUT/s4_admin.err ) & wait
summary s4_; echo "   後台改庫存: $( [ -s $OUT/s4_admin.err ] && grep -o 'ERROR: .*' $OUT/s4_admin.err | head -1 || echo 成功)"; echo "   最後 庫存 $($P -c "select quantity_on_hand from inventory_balances where product_id='$E'") / 保留中 $(held $E)"
echo "── 5. 同一筆訂單編號＋同一組密碼同時送兩次（網路重送）"
F=aaaaaaaa-0000-4000-8000-000000000006; mkprod $F 5; R=$(uuid); S=$(sec); PL="$(pay $R b5@x.test "[{\"id\":\"$F\",\"qty\":1,\"expected_price\":80}]")"
gate_close; for i in 1 2; do worker s5_$i "$PL" $S & done; wait
summary s5_; echo "   這個編號的訂單數 $($P -c "select count(*) from orders where id='$R'") / 保留中 $(held $F)"
echo "── 總檢查：任何商品 保留中 > 庫存？"
$P -c "select coalesce(string_agg(sku,','),'沒有') from products p join inventory_balances b on b.product_id=p.id where private.checkout_held(p.id)>b.quantity_on_hand"
