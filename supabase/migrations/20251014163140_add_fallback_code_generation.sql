/*
  # Add Fallback Code Generation
  
  1. Problem
    - Some users are created without numero_abonne and code_parrainage
    - Trigger timing issues causing NULL values
  
  2. Solution
    - Add a separate trigger that runs AFTER INSERT to fill missing codes
    - This ensures codes are always generated even if main trigger has issues
  
  3. Changes
    - Create fallback trigger function
    - Apply trigger to catch any NULL codes after insert
*/

-- Fallback function to generate codes if they're missing after insert
CREATE OR REPLACE FUNCTION ensure_user_codes()
RETURNS TRIGGER AS $$
BEGIN
  -- If numero_abonne is NULL, generate it
  IF NEW.numero_abonne IS NULL THEN
    UPDATE users 
    SET numero_abonne = generate_numero_abonne()
    WHERE id = NEW.id AND numero_abonne IS NULL;
  END IF;
  
  -- If code_parrainage is NULL, generate it
  IF NEW.code_parrainage IS NULL THEN
    UPDATE users 
    SET code_parrainage = generate_code_parrainage()
    WHERE id = NEW.id AND code_parrainage IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS ensure_user_codes_trigger ON users;

-- Create trigger that runs AFTER INSERT to fill any missing codes
CREATE TRIGGER ensure_user_codes_trigger
  AFTER INSERT ON users
  FOR EACH ROW
  WHEN (NEW.numero_abonne IS NULL OR NEW.code_parrainage IS NULL)
  EXECUTE FUNCTION ensure_user_codes();

-- Fix any existing users with NULL codes
UPDATE users 
SET 
  numero_abonne = generate_numero_abonne()
WHERE numero_abonne IS NULL;

UPDATE users 
SET 
  code_parrainage = generate_code_parrainage()
WHERE code_parrainage IS NULL;
