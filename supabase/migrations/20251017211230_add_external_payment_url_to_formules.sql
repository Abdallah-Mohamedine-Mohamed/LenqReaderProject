/*
  # Add External Payment URL to Formules

  1. Changes
    - Add `external_payment_url` column to `formules` table to store iPay external payment links
    - Update existing formules with their corresponding external payment URLs
  
  2. Data
    - Mensuel: https://i-pay.money/external_payments/048a649725be/preview
    - Trimestriel: https://i-pay.money/external_payments/f6463d4871fd/preview
    - Annuel: https://i-pay.money/external_payments/ac49ecef7dd8/preview
*/

-- Add external_payment_url column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'formules' AND column_name = 'external_payment_url'
  ) THEN
    ALTER TABLE formules ADD COLUMN external_payment_url text;
  END IF;
END $$;

-- Update formules with external payment URLs
UPDATE formules 
SET external_payment_url = 'https://i-pay.money/external_payments/048a649725be/preview'
WHERE LOWER(nom) LIKE '%mensuel%';

UPDATE formules 
SET external_payment_url = 'https://i-pay.money/external_payments/f6463d4871fd/preview'
WHERE LOWER(nom) LIKE '%trimestriel%';

UPDATE formules 
SET external_payment_url = 'https://i-pay.money/external_payments/ac49ecef7dd8/preview'
WHERE LOWER(nom) LIKE '%annuel%';
