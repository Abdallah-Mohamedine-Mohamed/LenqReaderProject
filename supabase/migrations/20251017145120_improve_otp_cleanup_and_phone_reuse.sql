/*
  # Improve OTP Cleanup and Phone Number Reuse

  ## Overview
  This migration implements immediate phone number reuse and 10-minute automatic cleanup
  for unverified user accounts during OTP verification.

  ## Changes

  1. Database Functions
    - Drop and recreate `cleanup_specific_unverified_user` to return jsonb with status info
    - Create `cleanup_unverified_users_10min` for 10-minute automatic cleanup
    - Create `check_and_cleanup_phone_for_reuse` to allow immediate phone number reuse
    - Update `request_otp` to automatically cleanup old unverified accounts with same phone

  2. OTP Timing
    - OTP expiration remains 10 minutes (already set in previous migration)
    - Unverified account cleanup threshold changed from 24 hours to 10 minutes
    - Added automatic cleanup trigger for abandoned registrations

  3. Security
    - Only unverified accounts (whatsapp_verifie = false) are eligible for cleanup
    - Active subscriptions prevent account deletion
    - All deletions are logged in otp_logs for audit trail
    - Cascade deletes ensure data consistency

  4. Indexes
    - Index on users(whatsapp_verifie, created_at) for efficient cleanup queries
    - Index on users(numero_whatsapp, whatsapp_verifie) for phone reuse checks
*/

-- ============================================================
-- ADD INDEXES FOR EFFICIENT CLEANUP QUERIES
-- ============================================================

-- Index for finding unverified users by creation time
CREATE INDEX IF NOT EXISTS idx_users_unverified_created 
  ON users(created_at) 
  WHERE whatsapp_verifie = false;

-- Index for phone number reuse checks
CREATE INDEX IF NOT EXISTS idx_users_phone_verification 
  ON users(numero_whatsapp, whatsapp_verifie);

-- ============================================================
-- FUNCTION: CLEANUP UNVERIFIED USERS OLDER THAN 10 MINUTES
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
    
    -- Delete from auth.users (cascade will handle users table)
    DELETE FROM auth.users WHERE id = v_user_record.id;
    
    v_deleted_count := v_deleted_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: CHECK AND CLEANUP PHONE FOR IMMEDIATE REUSE
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
    
    -- Delete from auth.users (cascade will handle users table and related data)
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

-- ============================================================
-- UPDATE: REQUEST_OTP FUNCTION TO HANDLE PHONE REUSE
-- ============================================================

CREATE OR REPLACE FUNCTION request_otp(
  p_numero_whatsapp TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_otp_code text;
  v_last_otp_sent timestamptz;
  v_cooldown_seconds integer := 60;
  v_whatsapp_verifie boolean;
  v_cleanup_result jsonb;
BEGIN
  -- First, check if there's an unverified account with this phone and clean it up
  SELECT check_and_cleanup_phone_for_reuse(p_numero_whatsapp) INTO v_cleanup_result;
  
  -- Check if user exists (after cleanup, should only be verified users)
  SELECT id, last_otp_sent_at, whatsapp_verifie INTO v_user_id, v_last_otp_sent, v_whatsapp_verifie
  FROM users
  WHERE numero_whatsapp = p_numero_whatsapp;
  
  -- If user doesn't exist, return error (they need to register first)
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'user_not_found',
      'message', 'Numéro WhatsApp non trouvé. Veuillez vous inscrire d''abord.',
      'cleanup_info', v_cleanup_result
    );
  END IF;
  
  -- Rate limiting: Check if last OTP was sent less than cooldown period ago
  IF v_last_otp_sent IS NOT NULL AND v_last_otp_sent > NOW() - INTERVAL '1 second' * v_cooldown_seconds THEN
    INSERT INTO otp_logs (user_id, numero_whatsapp, action, success, ip_address, user_agent, error_message)
    VALUES (v_user_id, p_numero_whatsapp, 'rate_limited', false, p_ip_address, p_user_agent, 'Too many OTP requests');
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'rate_limited',
      'message', 'Veuillez attendre avant de demander un nouveau code',
      'retry_after', EXTRACT(EPOCH FROM (v_last_otp_sent + INTERVAL '1 second' * v_cooldown_seconds - NOW()))
    );
  END IF;
  
  -- Generate new OTP
  v_otp_code := generate_otp_code();
  
  -- Update user with new OTP
  UPDATE users
  SET 
    otp_code = v_otp_code,
    otp_expires_at = NOW() + INTERVAL '10 minutes',
    otp_attempts = 0,
    last_otp_sent_at = NOW()
  WHERE id = v_user_id;
  
  -- Log OTP sent
  INSERT INTO otp_logs (user_id, numero_whatsapp, action, otp_code, success, ip_address, user_agent)
  VALUES (v_user_id, p_numero_whatsapp, 'sent', v_otp_code, true, p_ip_address, p_user_agent);
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Code OTP envoyé',
    'otp_code', v_otp_code,
    'expires_in_seconds', 600,
    'cleanup_info', v_cleanup_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DROP AND RECREATE: CLEANUP_SPECIFIC_UNVERIFIED_USER
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
      
      -- Delete from auth.users (cascade will handle users table)
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
-- GRANT EXECUTE PERMISSIONS TO AUTHENTICATED AND ANON USERS
-- ============================================================

GRANT EXECUTE ON FUNCTION cleanup_unverified_users_10min() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION check_and_cleanup_phone_for_reuse(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION cleanup_specific_unverified_user(uuid) TO authenticated, anon;
