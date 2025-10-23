/*
  # Fix Notifications Insert Policy
  
  1. Problem
    - Admins cannot insert notifications when publishing editions
    - The existing "ALL" policy for admins doesn't properly allow INSERT operations
  
  2. Solution
    - Drop the existing "ALL" policy that doesn't work properly
    - Create separate policies for INSERT, UPDATE, DELETE for admins
    - Keep the SELECT policy for users to view their own notifications
  
  3. Security
    - Admins can manage all notifications (INSERT, UPDATE, DELETE, SELECT)
    - Regular users can only SELECT their own notifications
*/

-- Drop the existing policy that uses "ALL"
DROP POLICY IF EXISTS "Admins gèrent toutes les notifications" ON notifications;

-- Create separate policies for each operation for admins
CREATE POLICY "Admins can insert notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update notifications"
  ON notifications
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

CREATE POLICY "Admins can delete notifications"
  ON notifications
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can view all notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
