/*
  # L'Enquêteur Liseuse Sécurisée - Schema Initial

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - Unique user identifier
      - `nom` (text) - User full name
      - `email` (text, unique) - User email for login
      - `password_hash` (text) - Hashed password
      - `role` (text) - User role: 'admin' or 'lecteur'
      - `created_at` (timestamptz) - Account creation timestamp
    
    - `pdfs`
      - `id` (uuid, primary key) - Unique PDF identifier
      - `titre` (text) - PDF title/name
      - `url_fichier` (text) - Storage URL or path
      - `date_upload` (timestamptz) - Upload timestamp
      - `uploaded_by` (uuid, foreign key) - Admin who uploaded
    
    - `tokens`
      - `id` (uuid, primary key) - Unique token identifier
      - `pdf_id` (uuid, foreign key) - Reference to PDF
      - `user_id` (uuid, foreign key) - Reference to user (lecteur)
      - `token` (text, unique) - Signed access token
      - `expires_at` (timestamptz) - Token expiration time
      - `used` (boolean) - Whether token has been used
      - `created_at` (timestamptz) - Token creation timestamp
    
    - `logs`
      - `id` (uuid, primary key) - Unique log identifier
      - `pdf_id` (uuid, foreign key) - Reference to PDF
      - `user_id` (uuid, foreign key) - Reference to user
      - `ip` (text) - Client IP address
      - `user_agent` (text) - Client user agent
      - `date_access` (timestamptz) - Access timestamp

  2. Security
    - Enable RLS on all tables
    - Admin users can manage all data
    - Lecteur users can only view their own tokens and access logs
    - Public access only for token validation (specific policy)
    
  3. Indexes
    - Index on tokens.token for fast lookup
    - Index on tokens.expires_at for cleanup queries
    - Index on logs for reporting queries
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'lecteur' CHECK (role IN ('admin', 'lecteur')),
  created_at timestamptz DEFAULT now()
);

-- Create pdfs table
CREATE TABLE IF NOT EXISTS pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre text NOT NULL,
  url_fichier text NOT NULL,
  date_upload timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Create tokens table
CREATE TABLE IF NOT EXISTS tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_id uuid NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create logs table
CREATE TABLE IF NOT EXISTS logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_id uuid NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip text,
  user_agent text,
  date_access timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_logs_pdf_id ON logs(pdf_id);
CREATE INDEX IF NOT EXISTS idx_logs_date_access ON logs(date_access DESC);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- PDFs policies
CREATE POLICY "Admins can manage all PDFs"
  ON pdfs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view PDFs"
  ON pdfs FOR SELECT
  TO authenticated
  USING (true);

-- Tokens policies
CREATE POLICY "Admins can manage all tokens"
  ON tokens FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view own tokens"
  ON tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Logs policies
CREATE POLICY "Admins can view all logs"
  ON logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert logs"
  ON logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view own access logs"
  ON logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);