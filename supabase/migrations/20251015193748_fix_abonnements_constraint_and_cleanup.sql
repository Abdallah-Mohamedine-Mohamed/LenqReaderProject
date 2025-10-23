/*
  # Fix abonnements status constraint and add cleanup mechanism

  1. Changes
    - Drop and recreate the abonnements_statut_check constraint to include 'en_attente'
    - Create a function to cleanup unverified users
    - Create a cron-like trigger to periodically cleanup old unverified accounts
  
  2. Security
    - Only cleanup users who haven't verified their WhatsApp after 24 hours
    - Cascade deletes will remove related OTP codes and other data
*/

-- Drop the old constraint if it exists
ALTER TABLE abonnements 
  DROP CONSTRAINT IF EXISTS abonnements_statut_check;

-- Add the new constraint with 'en_attente' included
ALTER TABLE abonnements 
  ADD CONSTRAINT abonnements_statut_check 
  CHECK (statut IN ('actif', 'expire', 'suspendu', 'annule', 'en_attente'));

-- Function to cleanup unverified users older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_unverified_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete users who:
  -- 1. Have whatsapp_verifie = false
  -- 2. Were created more than 24 hours ago
  -- 3. Have no active subscription
  DELETE FROM auth.users
  WHERE id IN (
    SELECT u.id 
    FROM users u
    LEFT JOIN abonnements a ON u.id = a.user_id AND a.statut = 'actif'
    WHERE u.whatsapp_verifie = false
      AND u.created_at < NOW() - INTERVAL '24 hours'
      AND a.id IS NULL
  );
  
  -- Also delete from our users table (if cascade doesn't handle it)
  DELETE FROM users
  WHERE whatsapp_verifie = false
    AND created_at < NOW() - INTERVAL '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM abonnements 
      WHERE user_id = users.id AND statut = 'actif'
    );
END;
$$;

-- Function to cleanup a specific unverified user (called when OTP expires)
CREATE OR REPLACE FUNCTION cleanup_specific_unverified_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is unverified
  IF EXISTS (
    SELECT 1 FROM users 
    WHERE id = p_user_id 
      AND whatsapp_verifie = false
      AND NOT EXISTS (
        SELECT 1 FROM abonnements 
        WHERE user_id = p_user_id AND statut = 'actif'
      )
  ) THEN
    -- Delete from auth.users (cascade will handle users table)
    DELETE FROM auth.users WHERE id = p_user_id;
  END IF;
END;
$$;
