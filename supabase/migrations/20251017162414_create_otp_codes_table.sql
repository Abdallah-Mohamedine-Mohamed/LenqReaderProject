/*
  # Create OTP Codes Table

  ## Overview
  Creates a dedicated table for storing OTP codes separate from users table,
  allowing better tracking, cleanup, and rate limiting.

  ## 1. New Table
    - `otp_codes`
      - `id` (uuid, primary key)
      - `numero_whatsapp` (text) - Phone number for OTP
      - `otp_code` (text) - The OTP code
      - `expires_at` (timestamptz) - Expiration time
      - `attempts` (integer) - Failed verification attempts
      - `created_at` (timestamptz) - Creation time

  ## 2. Security
    - Enable RLS on otp_codes table
    - Allow public read for verification
    - Allow public insert for OTP generation

  ## 3. Indexes
    - Index on numero_whatsapp for fast lookup
    - Index on expires_at for cleanup
*/

-- Create otp_codes table
CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_whatsapp text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- Allow public to insert OTP codes (for send-otp function)
CREATE POLICY "Public can insert OTP codes"
  ON otp_codes
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Allow public to read OTP codes (for verify-otp function)
CREATE POLICY "Public can read OTP codes"
  ON otp_codes
  FOR SELECT
  TO public
  USING (true);

-- Allow public to update OTP codes (for verify-otp function to increment attempts)
CREATE POLICY "Public can update OTP codes"
  ON otp_codes
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Allow public to delete OTP codes (for cleanup)
CREATE POLICY "Public can delete OTP codes"
  ON otp_codes
  FOR DELETE
  TO public
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(numero_whatsapp);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes(expires_at);

-- Create cleanup function for expired OTP codes
CREATE OR REPLACE FUNCTION cleanup_expired_otp_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < now();
END;
$$;