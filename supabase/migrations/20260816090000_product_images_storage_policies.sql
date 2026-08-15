-- Explicit RLS on storage.objects for the `product-images` bucket.
-- The bucket is already `public: true` (public downloads bypass RLS via
-- Supabase's public object endpoint), so this is defense-in-depth for any
-- future direct-from-browser access: public read, staff-only writes. All
-- current admin uploads go through a service-role server function anyway
-- (which bypasses RLS entirely and independently re-checks `is_staff()`),
-- so this policy set is a belt-and-braces backstop, not the primary guard.

create policy "product-images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

create policy "staff manage product-images"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'product-images' and public.is_staff(auth.uid()))
  with check (bucket_id = 'product-images' and public.is_staff(auth.uid()));
