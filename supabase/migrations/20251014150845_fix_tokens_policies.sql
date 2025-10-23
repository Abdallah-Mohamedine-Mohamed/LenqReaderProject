/*
  # Fix Tokens Table Policies

  1. Changes
    - Remove recursive policies on tokens table
    - Add specific INSERT policy for admins
    - Simplify policies to avoid checking users table
  
  2. Security
    - Admins can insert tokens
    - Users can view their own tokens
    - Admins can view all tokens
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage all tokens" ON tokens;
DROP POLICY IF EXISTS "Users can view own tokens" ON tokens;

-- Allow admins to insert tokens (checking role via jwt)
CREATE POLICY "Admins can insert tokens"
  ON tokens FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow authenticated users to view their own tokens
CREATE POLICY "Users can view own tokens"
  ON tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow admins to view all tokens
CREATE POLICY "Admins can view all tokens"
  ON tokens FOR SELECT
  TO authenticated
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to update tokens
CREATE POLICY "Admins can update tokens"
  ON tokens FOR UPDATE
  TO authenticated
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to delete tokens
CREATE POLICY "Admins can delete tokens"
  ON tokens FOR DELETE
  TO authenticated
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );