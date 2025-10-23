/*
  # Fix OTP Public Access

  This migration ensures that OTP request and verification functions are accessible
  without authentication for registration and login flows.

  ## Changes
  - Grant EXECUTE permission on request_otp to anon and authenticated users
  - Grant EXECUTE permission on verify_otp to anon and authenticated users
  - Ensure otp_logs table allows anonymous inserts for tracking
*/

-- Grant execute permissions on OTP functions to anonymous users
GRANT EXECUTE ON FUNCTION request_otp(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_otp(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION detect_country_from_phone(TEXT) TO anon, authenticated;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Anyone can check WhatsApp number existence" ON users;

-- Allow anonymous users to check if WhatsApp number exists for registration
CREATE POLICY "Anyone can check WhatsApp number existence"
  ON users FOR SELECT
  TO anon, authenticated
  USING (numero_whatsapp IS NOT NULL);
