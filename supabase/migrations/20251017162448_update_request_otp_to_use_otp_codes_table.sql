/*
  # Update request_otp Function to Use otp_codes Table

  ## Overview
  Modifies the request_otp function to store OTP codes in the dedicated
  otp_codes table instead of the users table.

  ## Changes
    - Delete existing OTP codes for the phone number before creating new one
    - Insert new OTP into otp_codes table
    - Keep otp_logs for audit trail
    - Remove user existence check (allow OTP before account creation)
*/

CREATE OR REPLACE FUNCTION request_otp(
  p_numero_whatsapp text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp_code text;
  v_last_otp_sent timestamptz;
  v_cooldown_seconds integer := 60;
BEGIN
  -- Check rate limiting by looking at last OTP created for this phone
  SELECT created_at INTO v_last_otp_sent
  FROM otp_codes
  WHERE numero_whatsapp = p_numero_whatsapp
  ORDER BY created_at DESC
  LIMIT 1;

  -- Rate limiting: Check if last OTP was sent less than cooldown period ago
  IF v_last_otp_sent IS NOT NULL AND v_last_otp_sent > NOW() - INTERVAL '1 second' * v_cooldown_seconds THEN
    INSERT INTO otp_logs (numero_whatsapp, action, success, ip_address, user_agent, error_message)
    VALUES (p_numero_whatsapp, 'rate_limited', false, p_ip_address, p_user_agent, 'Too many OTP requests');

    RETURN jsonb_build_object(
      'success', false,
      'error', 'rate_limited',
      'message', 'Veuillez attendre avant de demander un nouveau code',
      'retry_after', EXTRACT(EPOCH FROM (v_last_otp_sent + INTERVAL '1 second' * v_cooldown_seconds - NOW()))
    );
  END IF;

  -- Generate new OTP
  v_otp_code := generate_otp_code();

  -- Delete any existing OTP codes for this phone number
  DELETE FROM otp_codes WHERE numero_whatsapp = p_numero_whatsapp;

  -- Insert new OTP code
  INSERT INTO otp_codes (numero_whatsapp, otp_code, expires_at, attempts)
  VALUES (p_numero_whatsapp, v_otp_code, NOW() + INTERVAL '10 minutes', 0);

  -- Log OTP sent
  INSERT INTO otp_logs (numero_whatsapp, action, otp_code, success, ip_address, user_agent)
  VALUES (p_numero_whatsapp, 'sent', v_otp_code, true, p_ip_address, p_user_agent);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Code OTP envoyé',
    'otp_code', v_otp_code,
    'expires_in_seconds', 600
  );
END;
$$;