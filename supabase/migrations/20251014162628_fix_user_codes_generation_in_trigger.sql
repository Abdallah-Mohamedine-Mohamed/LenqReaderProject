/*
  # Fix User Codes Generation in Trigger
  
  1. Problem Identified
    - Users created via auth.users trigger have NULL numero_abonne and code_parrainage
    - The BEFORE INSERT trigger on public.users is not executing when insert comes from another trigger
    - Need to directly generate codes in the handle_new_user function
  
  2. Solution
    - Update handle_new_user to directly call generation functions
    - Ensure codes are always generated during user creation
    - Add fallback mechanism if generation fails
  
  3. Changes
    - Modified handle_new_user function to generate codes directly
    - Keep existing trigger as backup for manual inserts
*/

-- Updated trigger function that generates codes directly
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_nom TEXT;
  user_role TEXT;
  new_numero_abonne TEXT;
  new_code_parrainage TEXT;
BEGIN
  -- Extract metadata with defaults
  user_nom := COALESCE(
    NEW.raw_user_meta_data->>'nom',
    NEW.raw_app_meta_data->>'nom',
    SPLIT_PART(NEW.email, '@', 1)
  );
  
  user_role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    NEW.raw_app_meta_data->>'role',
    'lecteur'
  );

  -- Generate unique codes
  BEGIN
    new_numero_abonne := generate_numero_abonne();
    new_code_parrainage := generate_code_parrainage();
  EXCEPTION
    WHEN others THEN
      RAISE WARNING 'Error generating user codes: %', SQLERRM;
      new_numero_abonne := NULL;
      new_code_parrainage := NULL;
  END;

  -- Insert or update user in public.users with generated codes
  INSERT INTO public.users (
    id,
    email,
    nom,
    role,
    numero_abonne,
    code_parrainage,
    created_at
  ) VALUES (
    NEW.id,
    NEW.email,
    user_nom,
    user_role,
    new_numero_abonne,
    new_code_parrainage,
    NEW.created_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nom = COALESCE(public.users.nom, EXCLUDED.nom),
    role = COALESCE(public.users.role, EXCLUDED.role),
    numero_abonne = COALESCE(public.users.numero_abonne, EXCLUDED.numero_abonne),
    code_parrainage = COALESCE(public.users.code_parrainage, EXCLUDED.code_parrainage);
  
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log error but don't fail the auth signup
    RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing users who don't have codes yet
UPDATE users 
SET 
  numero_abonne = generate_numero_abonne(),
  code_parrainage = generate_code_parrainage()
WHERE numero_abonne IS NULL OR code_parrainage IS NULL;
