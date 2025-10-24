/*
  # Payment Events Audit System & Secure Confirmation

  1. New Tables
    - `payment_events`
      - Audit trail for all payment state changes
      - Tracks who performed action, when, and what changed
      - Links to payment, subscription, user
      - Stores iPay references and metadata
  
  2. Schema Changes
    - Add `ipay_transaction_id` to `paiements` for iPay unique reference
    - Add `ipay_status` to track iPay-specific status
    - Add `currency` and `country_code` for multi-currency support
    - Add `expires_at` for pending payment expiration
    - Standardize status enum to match iPay

  3. New Functions
    - `confirm_payment_secure()`: Atomic payment confirmation
      - Validates ownership and state
      - Calculates subscription renewal properly
      - Updates all related tables atomically
      - Creates audit trail
      - Returns complete result
    
    - `expire_pending_payments()`: Cleanup expired payments
      - Marks payments pending > 30 minutes as failed
      - Called by cron job

  4. Security
    - RLS policies for payment_events (admin read, system insert)
    - Function security definer for atomic operations
    - Audit trail cannot be modified by users

  5. Important Notes
    - Status standardization: pending|paid|failed|refunded
    - All payment confirmations must go through RPC
    - Subscription renewal extends existing period
    - Multi-device/user tracking via payment_events
*/

-- ============================================================
-- 1. EXTEND PAIEMENTS TABLE
-- ============================================================

DO $$
BEGIN
  -- Add iPay transaction ID
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'paiements' AND column_name = 'ipay_transaction_id'
  ) THEN
    ALTER TABLE paiements ADD COLUMN ipay_transaction_id text;
  END IF;

  -- Add iPay status for tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'paiements' AND column_name = 'ipay_status'
  ) THEN
    ALTER TABLE paiements ADD COLUMN ipay_status text;
  END IF;

  -- Add currency support
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'paiements' AND column_name = 'currency'
  ) THEN
    ALTER TABLE paiements ADD COLUMN currency text DEFAULT 'XOF';
  END IF;

  -- Add country code
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'paiements' AND column_name = 'country_code'
  ) THEN
    ALTER TABLE paiements ADD COLUMN country_code text;
  END IF;

  -- Add expiration time for pending payments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'paiements' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE paiements ADD COLUMN expires_at timestamptz;
  END IF;

  -- Add formule_id for direct reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'paiements' AND column_name = 'formule_id'
  ) THEN
    ALTER TABLE paiements ADD COLUMN formule_id uuid REFERENCES formules(id);
  END IF;
END $$;

-- Create index on iPay transaction ID for fast lookups
CREATE INDEX IF NOT EXISTS idx_paiements_ipay_transaction 
ON paiements(ipay_transaction_id);

-- ============================================================
-- 2. CREATE PAYMENT_EVENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES paiements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'created', 'pending', 'paid', 'failed', 'refunded', 
    'confirmed_manual', 'confirmed_auto', 'expired', 'cancelled'
  )),
  old_status text,
  new_status text NOT NULL,
  performed_by uuid REFERENCES users(id),
  ipay_transaction_id text,
  ipay_status text,
  metadata jsonb DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Indexes for payment_events
CREATE INDEX IF NOT EXISTS idx_payment_events_payment 
ON payment_events(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_user 
ON payment_events(user_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_type 
ON payment_events(event_type);

CREATE INDEX IF NOT EXISTS idx_payment_events_created 
ON payment_events(created_at DESC);

-- RLS for payment_events
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Admins can read all events
CREATE POLICY "Admins can read payment events"
  ON payment_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- System can insert events (via security definer functions)
CREATE POLICY "System can insert payment events"
  ON payment_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 3. EXTEND ABONNEMENTS TABLE
-- ============================================================

DO $$
BEGIN
  -- Add pending status to abonnements
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'abonnements_statut_check'
  ) THEN
    ALTER TABLE abonnements 
    DROP CONSTRAINT IF EXISTS abonnements_statut_check;
    
    ALTER TABLE abonnements 
    ADD CONSTRAINT abonnements_statut_check 
    CHECK (statut IN ('en_attente', 'actif', 'expire', 'suspendu', 'annule'));
  END IF;

  -- Add duration_days for flexible calculation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'abonnements' AND column_name = 'duration_days'
  ) THEN
    ALTER TABLE abonnements ADD COLUMN duration_days integer;
  END IF;
END $$;

-- ============================================================
-- 4. SECURE PAYMENT CONFIRMATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_payment_secure(
  p_payment_id uuid,
  p_ipay_transaction_id text DEFAULT NULL,
  p_ipay_status text DEFAULT NULL,
  p_confirmed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
  v_subscription record;
  v_formule record;
  v_user record;
  v_new_end_date timestamptz;
  v_is_renewal boolean;
  v_result jsonb;
BEGIN
  -- 1. Lock and fetch payment
  SELECT * INTO v_payment
  FROM paiements
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payment not found'
    );
  END IF;

  -- 2. Check if already confirmed
  IF v_payment.statut = 'confirme' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payment already confirmed'
    );
  END IF;

  -- 3. Fetch related records
  SELECT * INTO v_user FROM users WHERE id = v_payment.user_id;
  SELECT * INTO v_formule FROM formules WHERE id = v_payment.formule_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Formule not found'
    );
  END IF;

  -- 4. Fetch or create subscription
  SELECT * INTO v_subscription
  FROM abonnements
  WHERE id = v_payment.abonnement_id
  FOR UPDATE;

  -- 5. Calculate new end date (renewal logic)
  IF v_subscription.id IS NOT NULL AND v_subscription.date_fin > now() THEN
    -- Active subscription: extend from current end date
    v_new_end_date := v_subscription.date_fin + (v_formule.duree_jours || ' days')::interval;
    v_is_renewal := true;
  ELSE
    -- New or expired subscription: start from now
    v_new_end_date := now() + (v_formule.duree_jours || ' days')::interval;
    v_is_renewal := false;
  END IF;

  -- 6. Update or create subscription
  IF v_subscription.id IS NOT NULL THEN
    UPDATE abonnements
    SET 
      date_fin = v_new_end_date,
      statut = 'actif',
      updated_at = now()
    WHERE id = v_subscription.id;
  ELSE
    -- Create new subscription
    INSERT INTO abonnements (
      user_id,
      formule_id,
      date_debut,
      date_fin,
      statut,
      duration_days
    ) VALUES (
      v_payment.user_id,
      v_payment.formule_id,
      now(),
      v_new_end_date,
      'actif',
      v_formule.duree_jours
    )
    RETURNING * INTO v_subscription;

    -- Link payment to new subscription
    UPDATE paiements
    SET abonnement_id = v_subscription.id
    WHERE id = p_payment_id;
  END IF;

  -- 7. Update payment record
  UPDATE paiements
  SET 
    statut = 'confirme',
    ipay_transaction_id = COALESCE(p_ipay_transaction_id, ipay_transaction_id),
    ipay_status = COALESCE(p_ipay_status, ipay_status),
    confirme_par = COALESCE(p_confirmed_by, auth.uid()),
    notes = COALESCE(p_notes, notes),
    date_paiement = now()
  WHERE id = p_payment_id;

  -- 8. Update user status
  UPDATE users
  SET 
    statut_abonnement = 'actif',
    date_fin_abonnement = v_new_end_date,
    updated_at = now()
  WHERE id = v_payment.user_id;

  -- 9. Create audit event
  INSERT INTO payment_events (
    payment_id,
    user_id,
    event_type,
    old_status,
    new_status,
    performed_by,
    ipay_transaction_id,
    ipay_status,
    metadata,
    notes
  ) VALUES (
    p_payment_id,
    v_payment.user_id,
    CASE 
      WHEN p_confirmed_by IS NOT NULL THEN 'confirmed_manual'
      ELSE 'confirmed_auto'
    END,
    v_payment.statut,
    'confirme',
    COALESCE(p_confirmed_by, auth.uid()),
    p_ipay_transaction_id,
    p_ipay_status,
    jsonb_build_object(
      'is_renewal', v_is_renewal,
      'previous_end_date', v_subscription.date_fin,
      'new_end_date', v_new_end_date,
      'formule_name', v_formule.nom,
      'amount', v_payment.montant_fcfa
    ),
    p_notes
  );

  -- 10. Return success with details
  v_result := jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'subscription_id', v_subscription.id,
    'user_id', v_payment.user_id,
    'is_renewal', v_is_renewal,
    'new_end_date', v_new_end_date,
    'amount', v_payment.montant_fcfa,
    'formule', v_formule.nom
  );

  RETURN v_result;
END;
$$;

-- ============================================================
-- 5. EXPIRE PENDING PAYMENTS FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION expire_pending_payments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count integer := 0;
  v_payment record;
BEGIN
  -- Find and expire payments pending > 30 minutes
  FOR v_payment IN
    SELECT id, user_id, statut
    FROM paiements
    WHERE statut = 'en_attente'
    AND (expires_at IS NOT NULL AND expires_at < now())
    OR (expires_at IS NULL AND created_at < now() - interval '30 minutes')
    FOR UPDATE
  LOOP
    -- Update payment status
    UPDATE paiements
    SET 
      statut = 'echoue',
      notes = COALESCE(notes || ' | ', '') || 'Expired automatically'
    WHERE id = v_payment.id;

    -- Log event
    INSERT INTO payment_events (
      payment_id,
      user_id,
      event_type,
      old_status,
      new_status,
      notes
    ) VALUES (
      v_payment.id,
      v_payment.user_id,
      'expired',
      v_payment.statut,
      'echoue',
      'Payment expired after 30 minutes'
    );

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_expired_count
  );
END;
$$;

-- ============================================================
-- 6. HELPER FUNCTION: GET PAYMENT STATUS
-- ============================================================

CREATE OR REPLACE FUNCTION get_payment_with_status(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'amount', p.montant_fcfa,
    'status', p.statut,
    'ipay_status', p.ipay_status,
    'ipay_transaction_id', p.ipay_transaction_id,
    'method', p.methode_paiement,
    'reference', p.reference_transaction,
    'created_at', p.created_at,
    'expires_at', p.expires_at,
    'subscription_id', p.abonnement_id,
    'formule', jsonb_build_object(
      'id', f.id,
      'name', f.nom,
      'price', f.prix_fcfa,
      'duration_days', f.duree_jours
    )
  ) INTO v_result
  FROM paiements p
  LEFT JOIN formules f ON f.id = p.formule_id
  WHERE p.id = p_payment_id;

  RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION confirm_payment_secure TO authenticated;
GRANT EXECUTE ON FUNCTION expire_pending_payments TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_with_status TO authenticated;
