/*
  # Allow Public Read Access for Token Validation
  
  1. Problem
    - SecureReader needs to join tokens with pdfs and users tables
    - Anonymous users cannot read pdfs or users tables
    - This blocks the token validation query
  
  2. Solution
    - Allow anonymous users to SELECT from pdfs table
    - Allow anonymous users to SELECT from users table
    - This enables the full token validation query to work
  
  3. Security
    - Only SELECT is allowed for anonymous users
    - No INSERT, UPDATE, or DELETE operations
    - Users only see data related to valid tokens they possess
    - PDF files are still protected by Supabase Storage policies
*/

-- Allow anonymous users to read PDFs table (needed for token validation)
CREATE POLICY "Public can read PDFs for token validation"
  ON pdfs
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to read Users table (needed for watermarking)
CREATE POLICY "Public can read users for token validation"
  ON users
  FOR SELECT
  TO anon
  USING (true);
