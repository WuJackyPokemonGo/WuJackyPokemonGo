begin;
set local plpgsql.check_asserts=on;
do $$
declare a uuid:=gen_random_uuid();p uuid:=gen_random_uuid();i uuid:=gen_random_uuid();rejected boolean;begin
 assert(select 'image/png'=any(allowed_mime_types)and'image/webp'=any(allowed_mime_types)and file_size_limit=2097152 from storage.buckets where id='storefront-thumbnails'),'PNG fallback bucket limits incorrect';
 assert(select not public from storage.buckets where id='product-images'),'original image bucket exposed';
 insert into auth.users(id,aud,role,raw_user_meta_data,raw_app_meta_data)values(a,'authenticated','authenticated','{}','{}');
 insert into public.admin_profiles(user_id)values(a);
 insert into public.products(id,sku,name_zh)values(p,'PNG-VERIFY-'||p,'縮圖權限回滾驗收');
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 insert into storage.objects(bucket_id,name)values('storefront-thumbnails',p||'/'||i||'-thumb.png');
 insert into storage.objects(bucket_id,name)values('storefront-thumbnails',p||'/'||i||'-thumb.webp');
 rejected:=false;begin insert into storage.objects(bucket_id,name)values('storefront-thumbnails',p||'/'||i||'-original.png');exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'original path allowed into public thumbnail bucket';
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 execute 'set local role authenticated';
 rejected:=false;begin insert into storage.objects(bucket_id,name)values('storefront-thumbnails',p||'/'||gen_random_uuid()||'-thumb.png');exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'ordinary user can publish PNG thumbnails';
 execute 'reset role';
end $$;
rollback;
