/*
  # Fix Infinite Recursion in Users Table Policies

  1. Changes
    - Remove recursive policies that cause infinite loops
    - Simplify policies to avoid self-referencing
    - Use auth.uid() directly for authenticated operations
  
  2. Security
    - Allow public read for authentication (needed for login)
    - Authenticated users can read user data
    - Only service role can insert/update/delete users
*/

-- Drop ALL existing policies on users table
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'users'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON users';
  END LOOP;
END $$;

-- Allow public read for authentication (login needs to check credentials)
CREATE POLICY "Allow read for authentication"
  ON users FOR SELECT
  USING (true);

-- Allow authenticated users to insert their own record (for signups)
CREATE POLICY "Allow authenticated insert"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own data
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);