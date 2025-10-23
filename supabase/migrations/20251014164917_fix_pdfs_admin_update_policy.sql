/*
  # Fix PDFs Admin Update Policy
  
  1. Problem
    - Admins cannot update PDF status (statut_publication, date_publication_reelle, nb_envois)
    - Only the uploader can update their own PDFs
  
  2. Solution
    - Add a policy to allow admins to update all PDFs
    - Keep the existing policy for users to update their own PDFs
  
  3. Security
    - Admins can update all PDFs
    - Regular users can only update their own PDFs
*/

-- Add policy for admins to update all PDFs
CREATE POLICY "Admins can update all PDFs"
  ON pdfs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
