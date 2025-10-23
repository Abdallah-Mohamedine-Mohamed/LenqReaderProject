/*
  # Create webhook logs table

  1. New Tables
    - `webhook_logs`
      - `id` (uuid, primary key)
      - `source` (text) - Source du webhook (ipay, stripe, etc.)
      - `event_type` (text) - Type d'événement
      - `payload` (jsonb) - Données reçues
      - `status` (text) - Status du traitement (processed, error, pending)
      - `error_message` (text) - Message d'erreur si échec
      - `processed_at` (timestamptz) - Date de traitement
      - `created_at` (timestamptz) - Date de réception

  2. Security
    - Enable RLS on `webhook_logs` table
    - Add policy for admins to read logs
*/

CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs(source);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook logs"
  ON webhook_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "System can insert webhook logs"
  ON webhook_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
