/*
  # Setup Supabase Auth Integration

  1. Changes
    - Remove password_hash column from users table
    - Create trigger to sync users from auth.users
  
  2. Security
    - Users table now syncs with Supabase Auth
    - Passwords managed by Supabase Auth
*/

-- Remove password_hash column as we're using Supabase Auth
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, nom, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nom', 'Utilisateur'), 'lecteur')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new auth users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();