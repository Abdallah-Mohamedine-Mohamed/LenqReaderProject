/*
  # Fix Storage and PDF Policies

  1. Changes
    - Create storage bucket for PDFs
    - Update RLS policies on pdfs table to allow authenticated users to insert
    - Add storage policies for upload and access
  
  2. Security
    - Authenticated users can upload PDFs
    - All authenticated users can read PDFs
    - Only admins can delete PDFs
*/

-- Create storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('secure-pdfs', 'secure-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Drop ALL existing policies on pdfs table
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'pdfs'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON pdfs';
  END LOOP;
END $$;

-- Allow authenticated users to insert PDFs
CREATE POLICY "Authenticated users can upload PDFs"
  ON pdfs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to read PDFs
CREATE POLICY "Authenticated users can view PDFs"
  ON pdfs FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to update their own PDFs
CREATE POLICY "Users can update own PDFs"
  ON pdfs FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

-- Only admins can delete PDFs
CREATE POLICY "Admins can delete PDFs"
  ON pdfs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Drop ALL existing policies on storage.objects for secure-pdfs bucket
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects'
    AND policyname LIKE '%secure-pdfs%' OR policyname LIKE '%upload%' OR policyname LIKE '%view%' OR policyname LIKE '%delete%'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON storage.objects';
  END LOOP;
END $$;

-- Storage policies for uploads
CREATE POLICY "Authenticated users can upload files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'secure-pdfs');

-- Storage policies for reading
CREATE POLICY "Authenticated users can view files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'secure-pdfs');

-- Storage policies for deletion (admins only)
CREATE POLICY "Admins can delete files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'secure-pdfs' AND
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );