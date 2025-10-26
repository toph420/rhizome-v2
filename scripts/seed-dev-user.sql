-- One-time seed for dev user (NEXT_PUBLIC_DEV_USER_ID=00000000-0000-0000-0000-000000000000)
--
-- USAGE:
--   psql postgresql://postgres:postgres@localhost:54322/postgres -f scripts/seed-dev-user.sql
--
-- This creates the dev user in auth.users so that foreign key constraints
-- in user_settings and other tables don't fail in development mode.
--
-- Only needed once per database initialization.

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role,
  aud,
  confirmation_token
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'dev@localhost',
  '',
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  'authenticated',
  'authenticated',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- Verify it was created
SELECT id, email, role, created_at
FROM auth.users
WHERE id = '00000000-0000-0000-0000-000000000000';
