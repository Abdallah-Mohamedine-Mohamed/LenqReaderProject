/*
  # Simplify Admin Check with Helper Function
  
  1. Problem
    - RLS policies checking the users table can cause recursion issues
    - Complex subqueries in policies can cause performance issues
  
  2. Solution
    - Create a helper function that checks if current user is admin
    - This function is more efficient and avoids recursion
    - Update all policies to use this function
  
  3. Security
    - Function is SECURITY DEFINER to bypass RLS when checking role
    - Only returns boolean, no sensitive data exposed
*/

-- Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- Recreate notifications policies with simplified checks
DROP POLICY IF EXISTS "Admins can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can update notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can delete notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can view all notifications" ON notifications;

CREATE POLICY "Admins can insert notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete notifications"
  ON notifications
  FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can view all notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Recreate PDFs policies with simplified checks
DROP POLICY IF EXISTS "Admins can update all PDFs" ON pdfs;
DROP POLICY IF EXISTS "Admins can delete PDFs" ON pdfs;

CREATE POLICY "Admins can update all PDFs"
  ON pdfs
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete PDFs"
  ON pdfs
  FOR DELETE
  TO authenticated
  USING (is_admin());
