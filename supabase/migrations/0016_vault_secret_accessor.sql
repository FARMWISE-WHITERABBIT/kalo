-- Vault accessor for operator secrets. The news-engine Edge Function needs
-- the Anthropic API key; function secrets can't be set through our current
-- tooling, so the key lives in Supabase Vault (encrypted at rest) and the
-- function fetches it at runtime through this accessor. An env var
-- ANTHROPIC_API_KEY, if ever configured on the function, takes precedence.
--
-- Access: service_role ONLY. Clients (anon/authenticated) can neither call
-- this nor read vault schemas. The secret VALUE is inserted operationally
-- via vault.create_secret and never appears in a migration.

create or replace function public.operator_secret(p_name text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

revoke execute on function public.operator_secret(text) from public, anon, authenticated;
grant execute on function public.operator_secret(text) to service_role;
