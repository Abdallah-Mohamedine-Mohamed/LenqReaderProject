/*
  # Create cleanup_unverified_user_by_phone Function
  
  ## Overview
  Creates a function to cleanup unverified users and their OTP codes by phone number.
  This is needed in the subscription flow to allow users to restart the process.
  
  ## Changes
    - Creates cleanup_unverified_user_by_phone function
    - Deletes OTP codes for the phone number
    - Deletes unverified users with that phone number
    - Returns success status
*/

CREATE OR REPLACE FUNCTION cleanup_unverified_user_by_phone(
  p_phone_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_users integer;
  v_deleted_otps integer;
BEGIN
  -- Delete all OTP codes for this phone number
  DELETE FROM otp_codes WHERE numero_whatsapp = p_phone_number;
  GET DIAGNOSTICS v_deleted_otps = ROW_COUNT;
  
  -- Delete unverified users with this phone number
  DELETE FROM users 
  WHERE numero_whatsapp = p_phone_number 
    AND whatsapp_verifie = false;
  GET DIAGNOSTICS v_deleted_users = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_users', v_deleted_users,
    'deleted_otps', v_deleted_otps
  );
END;
$$;
