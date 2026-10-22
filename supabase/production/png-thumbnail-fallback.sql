-- Safari may decode WebP but have no native WebP canvas encoder. Permit real
-- PNG thumbnails end to end while keeping original images private.
update storage.buckets set allowed_mime_types=array['image/webp','image/png'] where id='storefront-thumbnails';
alter policy "admins publish storefront thumbnails"on storage.objects with check(
 bucket_id='storefront-thumbnails'and(select private.is_store_admin())
 and name~*'^[0-9a-f-]{36}/[0-9a-f-]{36}-thumb\.(webp|png)$'
 and exists(select 1 from public.products p where p.id::text=(storage.foldername(name))[1]));
