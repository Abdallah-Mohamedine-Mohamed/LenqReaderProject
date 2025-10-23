/*
  # WhatsApp OTP Authentication and iPayMoney Payment Integration

  ## Overview
  This migration transforms the authentication system to WhatsApp-based with OTP verification
  and integrates iPayMoney API for automated mobile money payment processing.

  ## 1. Users Table Modifications
    - Make email nullable (no longer required)
    - Ensure numero_whatsapp is unique and required
    - Add OTP verification fields:
      - `otp_code` (text) - Current OTP code
      - `otp_expires_at` (timestamptz) - OTP expiration time
      - `otp_verified_at` (timestamptz) - Last successful OTP verification
      - `otp_attempts` (integer) - Failed OTP attempts counter
      - `last_otp_sent_at` (timestamptz) - Rate limiting for OTP requests
    - Add trusted device tracking:
      - `trusted_devices` (jsonb) - Array of trusted device fingerprints

  ## 2. Paiements Table Modifications
    - Add iPayMoney integration fields:
      - `ipay_reference` (text) - iPayMoney transaction reference
      - `ipay_status` (text) - Status from iPayMoney API
      - `ipay_transaction_id` (text) - Our unique transaction ID sent to iPayMoney
      - `country_code` (text) - Country code (BJ, NE, CI, etc.)
      - `msisdn` (text) - Phone number used for payment
      - `currency` (text) - Payment currency (XOF)
      - `last_status_check` (timestamptz) - Last time we checked payment status

  ## 3. New Tables
    - `payment_api_logs` - Complete audit trail of all iPayMoney API calls
    - `payment_polling_jobs` - Track automatic payment status polling jobs
    - `otp_logs` - Track all OTP generation and verification attempts

  ## 4. Security
    - Enable RLS on all new tables
    - Add policies for admin access to logs
    - Add policies for user access to own OTP data
    - Ensure payment data is properly secured

  ## 5. Indexes
    - Index on users.numero_whatsapp for fast lookup
    - Index on otp_expires_at for cleanup queries
    - Index on payment_polling_jobs status for active job queries
    - Index on ipay_reference for payment lookups
*/

-- ============================================================
-- MODIFY USERS TABLE FOR WHATSAPP OTP AUTHENTICATION
-- ============================================================

-- Make email nullable (no longer required)
DO $$ 
BEGIN
  ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Make password_hash nullable (OTP authentication)
DO $$ 
BEGIN
  ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Add OTP fields
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'otp_code') THEN
    ALTER TABLE users ADD COLUMN otp_code text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'otp_expires_at') THEN
    ALTER TABLE users ADD COLUMN otp_expires_at timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'otp_verified_at') THEN
    ALTER TABLE users ADD COLUMN otp_verified_at timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'otp_attempts') THEN
    ALTER TABLE users ADD COLUMN otp_attempts integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_otp_sent_at') THEN
    ALTER TABLE users ADD COLUMN last_otp_sent_at timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'trusted_devices') THEN
    ALTER TABLE users ADD COLUMN trusted_devices jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Ensure numero_whatsapp is unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_numero_whatsapp_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_numero_whatsapp_key UNIQUE (numero_whatsapp);
  END IF;
END $$;

-- Add index for OTP cleanup queries
CREATE INDEX IF NOT EXISTS idx_users_otp_expires_at ON users(otp_expires_at) WHERE otp_expires_at IS NOT NULL;

-- ============================================================
-- MODIFY PAIEMENTS TABLE FOR IPAYMONEY INTEGRATION
-- ============================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paiements' AND column_name = 'ipay_reference') THEN
    ALTER TABLE paiements ADD COLUMN ipay_reference text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paiements' AND column_name = 'ipay_status') THEN
    ALTER TABLE paiements ADD COLUMN ipay_status text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paiements' AND column_name = 'ipay_transaction_id') THEN
    ALTER TABLE paiements ADD COLUMN ipay_transaction_id text UNIQUE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paiements' AND column_name = 'country_code') THEN
    ALTER TABLE paiements ADD COLUMN country_code text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paiements' AND column_name = 'msisdn') THEN
    ALTER TABLE paiements ADD COLUMN msisdn text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paiements' AND column_name = 'currency') THEN
    ALTER TABLE paiements ADD COLUMN currency text DEFAULT 'XOF';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paiements' AND column_name = 'last_status_check') THEN
    ALTER TABLE paiements ADD COLUMN last_status_check timestamptz;
  END IF;
END $$;

-- Add indexes for payment lookups
CREATE INDEX IF NOT EXISTS idx_paiements_ipay_reference ON paiements(ipay_reference);
CREATE INDEX IF NOT EXISTS idx_paiements_ipay_transaction_id ON paiements(ipay_transaction_id);
CREATE INDEX IF NOT EXISTS idx_paiements_msisdn ON paiements(msisdn);

-- ============================================================
-- NEW TABLE: PAYMENT API LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paiement_id uuid REFERENCES paiements(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('initiate', 'check_status', 'webhook')),
  request_url text NOT NULL,
  request_headers jsonb,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  response_time_ms integer,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Index for logs queries
CREATE INDEX IF NOT EXISTS idx_payment_api_logs_paiement_id ON payment_api_logs(paiement_id);
CREATE INDEX IF NOT EXISTS idx_payment_api_logs_created_at ON payment_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_api_logs_request_type ON payment_api_logs(request_type);

-- Enable RLS
ALTER TABLE payment_api_logs ENABLE ROW LEVEL SECURITY;

-- Policies: Only admins can view logs
CREATE POLICY "Admins can view all payment API logs"
  ON payment_api_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- NEW TABLE: PAYMENT POLLING JOBS
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_polling_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paiement_id uuid NOT NULL REFERENCES paiements(id) ON DELETE CASCADE,
  ipay_reference text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'timeout')),
  polling_count integer DEFAULT 0,
  max_polling_attempts integer DEFAULT 60,
  next_poll_at timestamptz NOT NULL,
  last_poll_at timestamptz,
  last_known_status text,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for active jobs queries
CREATE INDEX IF NOT EXISTS idx_payment_polling_jobs_status ON payment_polling_jobs(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_payment_polling_jobs_next_poll ON payment_polling_jobs(next_poll_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_payment_polling_jobs_paiement_id ON payment_polling_jobs(paiement_id);

-- Enable RLS
ALTER TABLE payment_polling_jobs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all polling jobs"
  ON payment_polling_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "System can manage polling jobs"
  ON payment_polling_jobs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- ============================================================
-- NEW TABLE: OTP LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS otp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  numero_whatsapp text NOT NULL,
  action text NOT NULL CHECK (action IN ('sent', 'verified', 'failed', 'expired', 'rate_limited')),
  otp_code text,
  success boolean DEFAULT false,
  ip_address text,
  user_agent text,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Index for logs queries
CREATE INDEX IF NOT EXISTS idx_otp_logs_user_id ON otp_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_logs_numero_whatsapp ON otp_logs(numero_whatsapp);
CREATE INDEX IF NOT EXISTS idx_otp_logs_created_at ON otp_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_logs_action ON otp_logs(action);

-- Enable RLS
ALTER TABLE otp_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all OTP logs"
  ON otp_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view own OTP logs"
  ON otp_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- FUNCTIONS: OTP GENERATION AND VALIDATION
-- ============================================================

-- Generate random 6-digit OTP
CREATE OR REPLACE FUNCTION generate_otp_code()
RETURNS TEXT AS $$
BEGIN
  RETURN LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to request OTP (with rate limiting)
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
BEGIN
  -- Check if user exists
  SELECT id, last_otp_sent_at INTO v_user_id, v_last_otp_sent
  FROM users
  WHERE numero_whatsapp = p_numero_whatsapp;
  
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
  
  -- Update or create user with OTP
  IF v_user_id IS NOT NULL THEN
    UPDATE users
    SET 
      otp_code = v_otp_code,
      otp_expires_at = NOW() + INTERVAL '10 minutes',
      otp_attempts = 0,
      last_otp_sent_at = NOW()
    WHERE id = v_user_id;
  END IF;
  
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

-- Function to verify OTP
CREATE OR REPLACE FUNCTION verify_otp(
  p_numero_whatsapp TEXT,
  p_otp_code TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_stored_otp text;
  v_otp_expires timestamptz;
  v_otp_attempts integer;
  v_max_attempts integer := 5;
BEGIN
  -- Get user and OTP data
  SELECT id, otp_code, otp_expires_at, otp_attempts
  INTO v_user_id, v_stored_otp, v_otp_expires, v_otp_attempts
  FROM users
  WHERE numero_whatsapp = p_numero_whatsapp;
  
  -- Check if user exists
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'user_not_found',
      'message', 'Numéro WhatsApp non trouvé'
    );
  END IF;
  
  -- Check if OTP exists
  IF v_stored_otp IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'no_otp',
      'message', 'Aucun code OTP en attente'
    );
  END IF;
  
  -- Check if OTP expired
  IF v_otp_expires < NOW() THEN
    INSERT INTO otp_logs (user_id, numero_whatsapp, action, success, ip_address, user_agent, error_message)
    VALUES (v_user_id, p_numero_whatsapp, 'expired', false, p_ip_address, p_user_agent, 'OTP expired');
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'expired',
      'message', 'Le code OTP a expiré'
    );
  END IF;
  
  -- Check max attempts
  IF v_otp_attempts >= v_max_attempts THEN
    INSERT INTO otp_logs (user_id, numero_whatsapp, action, success, ip_address, user_agent, error_message)
    VALUES (v_user_id, p_numero_whatsapp, 'failed', false, p_ip_address, p_user_agent, 'Max attempts exceeded');
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'max_attempts',
      'message', 'Nombre maximum de tentatives atteint'
    );
  END IF;
  
  -- Verify OTP
  IF v_stored_otp = p_otp_code THEN
    -- Success: Clear OTP and mark as verified
    UPDATE users
    SET 
      otp_code = NULL,
      otp_expires_at = NULL,
      otp_attempts = 0,
      otp_verified_at = NOW(),
      whatsapp_verifie = true
    WHERE id = v_user_id;
    
    INSERT INTO otp_logs (user_id, numero_whatsapp, action, otp_code, success, ip_address, user_agent)
    VALUES (v_user_id, p_numero_whatsapp, 'verified', p_otp_code, true, p_ip_address, p_user_agent);
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Code OTP vérifié avec succès',
      'user_id', v_user_id
    );
  ELSE
    -- Failed: Increment attempts
    UPDATE users
    SET otp_attempts = otp_attempts + 1
    WHERE id = v_user_id;
    
    INSERT INTO otp_logs (user_id, numero_whatsapp, action, success, ip_address, user_agent, error_message)
    VALUES (v_user_id, p_numero_whatsapp, 'failed', false, p_ip_address, p_user_agent, 'Invalid OTP code');
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_code',
      'message', 'Code OTP incorrect',
      'attempts_remaining', v_max_attempts - v_otp_attempts - 1
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTIONS: COUNTRY CODE DETECTION
-- ============================================================

CREATE OR REPLACE FUNCTION detect_country_from_phone(p_numero_whatsapp TEXT)
RETURNS TEXT AS $$
DECLARE
  v_clean_number TEXT;
BEGIN
  -- Remove spaces, dashes, and plus sign
  v_clean_number := REGEXP_REPLACE(p_numero_whatsapp, '[^0-9]', '', 'g');
  
  -- Detect country based on prefix
  IF v_clean_number LIKE '229%' THEN RETURN 'BJ'; -- Benin
  ELSIF v_clean_number LIKE '227%' THEN RETURN 'NE'; -- Niger
  ELSIF v_clean_number LIKE '225%' THEN RETURN 'CI'; -- Côte d'Ivoire
  ELSIF v_clean_number LIKE '221%' THEN RETURN 'SN'; -- Senegal
  ELSIF v_clean_number LIKE '228%' THEN RETURN 'TG'; -- Togo
  ELSIF v_clean_number LIKE '226%' THEN RETURN 'BF'; -- Burkina Faso
  ELSIF v_clean_number LIKE '223%' THEN RETURN 'ML'; -- Mali
  ELSIF v_clean_number LIKE '233%' THEN RETURN 'GH'; -- Ghana
  ELSIF v_clean_number LIKE '234%' THEN RETURN 'NG'; -- Nigeria
  ELSE RETURN 'BJ'; -- Default to Benin
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- UPDATE EXISTING POLICIES FOR WHATSAPP AUTH
-- ============================================================

-- Allow public access to request OTP (for login/registration)
CREATE POLICY "Anyone can request OTP logs"
  ON otp_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
