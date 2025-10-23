/*
  # Fix Authentication Policies

  1. Changes
    - Add policy to allow public read for authentication purposes
    - Users table needs to be readable during login (before auth.uid() exists)
  
  2. Security
    - Still maintain RLS
    - Allow read-only access for login validation
    - No write access without authentication
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can view own data" ON users;

-- Allow public read for authentication (login needs to check credentials)
CREATE POLICY "Allow read for authentication"
  ON users FOR SELECT
  USING (true);

-- Only authenticated admins can insert/update/delete users
CREATE POLICY "Admins can manage users"
  ON users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );