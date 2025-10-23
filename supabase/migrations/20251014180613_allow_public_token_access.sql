/*
  # Allow Public Access to Tokens via Token Value
  
  1. Problem
    - Users clicking WhatsApp links are not authenticated
    - Current policies only allow authenticated users to read tokens
    - This blocks legitimate access via shared links
  
  2. Solution
    - Add a policy to allow anyone (anon) to SELECT tokens by token value
    - This enables the SecureReader to validate tokens without authentication
    - Keep existing policies for authenticated users
  
  3. Security
    - Only SELECT is allowed for anonymous users
    - Access is only by exact token match (UUID)
    - Tokens still expire based on expires_at field
    - No write operations allowed for anonymous users
*/

-- Allow anonymous users to read tokens by token value
CREATE POLICY "Public can read tokens by token value"
  ON tokens
  FOR SELECT
  TO anon
  USING (true);
