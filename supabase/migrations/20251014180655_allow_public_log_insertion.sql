/*
  # Allow Public Log Insertion for Token Access
  
  1. Problem
    - SecureReader tries to log access when validating tokens
    - Anonymous users cannot insert into logs table
    - This causes the token validation to fail
  
  2. Solution
    - Allow anonymous users to INSERT into logs table
    - This enables access tracking for all readers
  
  3. Security
    - Only INSERT is allowed for anonymous users
    - No SELECT, UPDATE, or DELETE operations
    - Logs are write-only for anonymous users
    - Admins can still view all logs
*/

-- Allow anonymous users to insert logs when accessing PDFs
CREATE POLICY "Public can insert access logs"
  ON logs
  FOR INSERT
  TO anon
  WITH CHECK (true);
