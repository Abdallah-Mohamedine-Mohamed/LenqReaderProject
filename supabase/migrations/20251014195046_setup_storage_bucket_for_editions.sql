/*
  # Setup Storage Bucket for Editions PDFs

  1. Storage Configuration
    - Create public bucket 'pdfs' if not exists
    - Configure RLS policies for bucket access
    - Allow authenticated users (admins) to upload
    - Allow public read access for generated URLs

  2. Security
    - Only admins can upload files
    - Public can read files (needed for Vision API access)
    - File size limits and type restrictions
*/

-- Create storage bucket for PDFs if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdfs',
  'pdfs',
  true,
  52428800, -- 50MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf'];

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can upload PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Public can read PDFs" ON storage.objects;

-- Allow admins to upload PDFs
CREATE POLICY "Admins can upload PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pdfs' 
  AND (storage.foldername(name))[1] = 'editions'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Allow admins to update their uploads
CREATE POLICY "Admins can update PDFs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pdfs'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Allow admins to delete PDFs
CREATE POLICY "Admins can delete PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pdfs'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Allow public read access (needed for Vision API and readers)
CREATE POLICY "Public can read PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'pdfs');
