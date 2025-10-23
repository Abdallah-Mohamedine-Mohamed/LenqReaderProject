/*
  # Add OTP Logging and User Cleanup Functions (v2)

  1. New Tables
    - `otp_logs`
      - `id` (uuid, primary key)
      - `numero_whatsapp` (text)
      - `event_type` (text) - 'sent', 'verified', 'failed', 'expired'
      - `metadata` (jsonb) - additional context
      - `created_at` (timestamptz)

  2. New Functions
    - `cleanup_specific_unverified_user` - Delete a specific unverified user
    - `cleanup_old_unverified_users` - Delete all unverified users older than 1 hour

  3. Security
    - Enable RLS on `otp_logs` table
    - Only admins can view logs
*/

-- Create otp_logs table
CREATE TABLE IF NOT EXISTS otp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_whatsapp text NOT NULL,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE otp_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs (drop and recreate policy if exists)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can view OTP logs" ON otp_logs;
END $$;

CREATE POLICY "Admins can view OTP logs"
  ON otp_logs
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Drop and recreate cleanup_specific_unverified_user
DROP FUNCTION IF EXISTS cleanup_specific_unverified_user(uuid);

CREATE FUNCTION cleanup_specific_unverified_user(p_user_id uuid)
RETURNS json AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM users 
  WHERE id = p_user_id 
    AND whatsapp_verifie = false;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  IF v_deleted_count > 0 THEN
    RETURN json_build_object(
      'success', true, 
      'message', 'User deleted successfully'
    );
  ELSE
    RETURN json_build_object(
      'success', false, 
      'message', 'No unverified user found'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup all old unverified users
CREATE OR REPLACE FUNCTION cleanup_old_unverified_users()
RETURNS json AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM users 
  WHERE whatsapp_verifie = false 
    AND created_at < now() - interval '1 hour';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', format('%s unverified users deleted', v_deleted_count)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to log OTP events
CREATE OR REPLACE FUNCTION log_otp_event(
  p_numero_whatsapp text,
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO otp_logs (numero_whatsapp, event_type, metadata)
  VALUES (p_numero_whatsapp, p_event_type, p_metadata)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
