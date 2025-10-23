/*
  # Fix abonnements INSERT policy

  1. Changes
    - Add INSERT policy to allow authenticated users to create their own subscriptions
    - Users can only insert abonnements for their own user_id
  
  2. Security
    - Users can only create subscriptions for themselves (auth.uid() = user_id)
    - Admins can still manage all subscriptions via existing policies
*/

-- Drop the overly broad admin policy that uses FOR ALL
DROP POLICY IF EXISTS "Admins gèrent tous les abonnements" ON abonnements;

-- Create specific policies for admins
CREATE POLICY "Admins insert abonnements"
  ON abonnements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins update abonnements"
  ON abonnements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins delete abonnements"
  ON abonnements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Allow users to create their own subscriptions
CREATE POLICY "Users can create own subscriptions"
  ON abonnements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
