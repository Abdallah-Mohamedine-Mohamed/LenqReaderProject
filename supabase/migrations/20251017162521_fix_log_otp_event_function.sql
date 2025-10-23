/*
  # Fix log_otp_event Function

  ## Overview
  Updates the log_otp_event function to use correct column names
  and adds metadata column to otp_logs table.

  ## Changes
    - Add metadata jsonb column to otp_logs
    - Update log_otp_event function to use 'action' instead of 'event_type'
    - Accept metadata parameter
*/

-- Add metadata column to otp_logs if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'otp_logs' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE otp_logs ADD COLUMN metadata jsonb;
  END IF;
END $$;

-- Create or replace log_otp_event function
CREATE OR REPLACE FUNCTION log_otp_event(
  p_numero_whatsapp text,
  p_event_type text,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO otp_logs (numero_whatsapp, action, metadata, success)
  VALUES (p_numero_whatsapp, p_event_type, p_metadata, true)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;