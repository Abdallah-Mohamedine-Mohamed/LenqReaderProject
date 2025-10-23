/*
  # Fix request_otp for Subscription Flow

  ## Overview
  This migration fixes the request_otp function to work correctly with the subscription flow.
  The issue was that request_otp was calling check_and_cleanup_phone_for_reuse and then
  checking if a user exists. If no user exists after cleanup, it returned an error.

  ## Changes
  - Remove the automatic cleanup call from request_otp (it's already done in send-otp edge function)
  - Simplify the logic to just check if user exists and generate OTP
  - If user doesn't exist, return a clear error message
*/

-- ============================================================
-- FIX: REQUEST_OTP FUNCTION
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
BEGIN
  -- Check if user exists
  SELECT id, last_otp_sent_at, whatsapp_verifie INTO v_user_id, v_last_otp_sent, v_whatsapp_verifie
  FROM users
  WHERE numero_whatsapp = p_numero_whatsapp;
  
  -- If user doesn't exist, return error (they need to create account first)
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'user_not_found',
      'message', 'Numéro WhatsApp non trouvé. Veuillez vous inscrire d''abord.'
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
    'expires_in_seconds', 600
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
