/*
  # Add Payment Insert Policy

  1. Changes
    - Add INSERT policy for paiements table to allow users to create their own payment records
    - This is needed for the subscription flow where users create payment records before confirmation

  2. Security
    - Users can only insert payments for themselves (user_id = auth.uid())
    - Users can only insert payments in 'en_attente' status
*/

-- Allow users to insert their own pending payments
CREATE POLICY "Users can create their own payments"
  ON paiements FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id 
    AND statut = 'en_attente'
  );
