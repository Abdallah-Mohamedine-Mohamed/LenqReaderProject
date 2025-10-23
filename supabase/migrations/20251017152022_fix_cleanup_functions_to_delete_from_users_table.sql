/*
  # Fix cleanup functions to delete from users table
  
  ## Overview
  Fix all cleanup functions to delete from users table instead of auth.users.
  The users table deletion will handle all related data through cascade.
  
  ## Changes
  - Update cleanup_specific_unverified_user to delete from users table
  - Update cleanup_unverified_users_10min to delete from users table
  - Update check_and_cleanup_phone_for_reuse to delete from users table
*/

-- ============================================================
-- FIX: CLEANUP_SPECIFIC_UNVERIFIED_USER
-- ============================================================

DROP FUNCTION IF EXISTS cleanup_specific_unverified_user(uuid);

CREATE OR REPLACE FUNCTION cleanup_specific_unverified_user(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_user_record RECORD;
  v_deleted boolean := false;
BEGIN
  -- Get user info
  SELECT id, numero_whatsapp, whatsapp_verifie
  INTO v_user_record
  FROM users 
  WHERE id = p_user_id;
  
  -- Check if user exists and is unverified
  IF v_user_record.id IS NOT NULL AND v_user_record.whatsapp_verifie = false THEN
    -- Check if user has no active subscription
    IF NOT EXISTS (
      SELECT 1 FROM abonnements 
      WHERE user_id = p_user_id AND statut IN ('actif', 'essai')
    ) THEN
      -- Log the cleanup action
      INSERT INTO otp_logs (user_id, numero_whatsapp, action, success, error_message)
      VALUES (
        v_user_record.id, 
        v_user_record.numero_whatsapp, 
        'expired', 
        false, 
        'User cancelled OTP verification - account deleted'
      );
      
      -- Delete from users table (cascade will handle related data)
      DELETE FROM users WHERE id = p_user_id;
      
      -- Also delete from auth.users
      DELETE FROM auth.users WHERE id = p_user_id;
      
      v_deleted := true;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'success', v_deleted,
    'message', CASE 
      WHEN v_deleted THEN 'User account deleted successfully'
      WHEN v_user_record.id IS NULL THEN 'User not found'
      WHEN v_user_record.whatsapp_verifie THEN 'User is already verified'
      ELSE 'User has active subscription'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIX: CLEANUP_UNVERIFIED_USERS_10MIN
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_unverified_users_10min()
RETURNS TABLE(deleted_count integer) AS $$
DECLARE
  v_deleted_count integer := 0;
  v_user_record RECORD;
BEGIN
  -- Find and delete users who:
  -- 1. Have whatsapp_verifie = false
  -- 2. Were created more than 10 minutes ago
  -- 3. Have no active subscription
  FOR v_user_record IN
    SELECT u.id, u.numero_whatsapp
    FROM users u
    LEFT JOIN abonnements a ON u.id = a.user_id AND a.statut IN ('actif', 'essai')
    WHERE u.whatsapp_verifie = false
      AND u.created_at < NOW() - INTERVAL '10 minutes'
      AND a.id IS NULL
  LOOP
    -- Log the cleanup action
    INSERT INTO otp_logs (user_id, numero_whatsapp, action, success, error_message)
    VALUES (v_user_record.id, v_user_record.numero_whatsapp, 'expired', false, 'Account auto-deleted after 10 minutes without verification');
    
    -- Delete from users table
    DELETE FROM users WHERE id = v_user_record.id;
    
    -- Also delete from auth.users
    DELETE FROM auth.users WHERE id = v_user_record.id;
    
    v_deleted_count := v_deleted_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIX: CHECK_AND_CLEANUP_PHONE_FOR_REUSE
-- ============================================================

CREATE OR REPLACE FUNCTION check_and_cleanup_phone_for_reuse(p_numero_whatsapp TEXT)
RETURNS jsonb AS $$
DECLARE
  v_user_record RECORD;
  v_deleted boolean := false;
BEGIN
  -- Find any unverified user with this phone number
  SELECT id, numero_whatsapp, created_at, whatsapp_verifie
  INTO v_user_record
  FROM users
  WHERE numero_whatsapp = p_numero_whatsapp
    AND whatsapp_verifie = false
  LIMIT 1;
  
  -- If found, delete it to allow reuse
  IF v_user_record.id IS NOT NULL THEN
    -- Log the cleanup action
    INSERT INTO otp_logs (user_id, numero_whatsapp, action, success, error_message)
    VALUES (
      v_user_record.id, 
      v_user_record.numero_whatsapp, 
      'expired', 
      false, 
      'Previous unverified account deleted to allow phone number reuse'
    );
    
    -- Delete from users table
    DELETE FROM users WHERE id = v_user_record.id;
    
    -- Also delete from auth.users
    DELETE FROM auth.users WHERE id = v_user_record.id;
    
    v_deleted := true;
  END IF;
  
  RETURN jsonb_build_object(
    'phone_cleared', v_deleted,
    'message', CASE 
      WHEN v_deleted THEN 'Previous registration attempt cleared for this phone number'
      ELSE 'Phone number is available'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cleanup_specific_unverified_user(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION cleanup_unverified_users_10min() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION check_and_cleanup_phone_for_reuse(TEXT) TO authenticated, anon;
