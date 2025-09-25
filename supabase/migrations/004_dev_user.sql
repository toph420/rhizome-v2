-- Create a development user for testing
-- This user matches the NEXT_PUBLIC_DEV_USER_ID in .env.local

-- Insert dev user into auth.users if not exists
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
)
VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'dev@localhost',
  crypt('devpassword123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"name": "Development User"}'::jsonb,
  false,
  'authenticated'
)
ON CONFLICT (id) DO UPDATE 
SET email = EXCLUDED.email,
    updated_at = NOW();