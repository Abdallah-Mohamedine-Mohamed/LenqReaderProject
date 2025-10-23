/*
  # Create Articles Extraction System

  1. New Tables
    - `editions`
      - Stores journal editions with metadata
      - Tracks processing status with Google Cloud Vision API
    - `pages`
      - One page per journal page with images
      - Stores Vision API raw response for reference
    - `articles`
      - Extracted articles with text content and positions
      - Includes bounding box coordinates and reading order
    - `lectures_articles`
      - Analytics for article reading behavior
      - Tracks time spent, completion, bookmarks
    - `tokens_articles`
      - Individual tokens per article for security
      - Access control with expiration and count limits

  2. Security
    - Enable RLS on all tables
    - Policies for admin users to manage content
    - Policies for readers to access their articles
    - Public read for article validation (token-based)

  3. Indexes
    - Optimize queries for edition listing
    - Fast article lookups by edition
    - Efficient analytics queries
*/

-- Editions table
CREATE TABLE IF NOT EXISTS editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre TEXT NOT NULL,
  numero_edition INTEGER,
  date_edition DATE,
  date_publication TIMESTAMPTZ,
  nb_pages INTEGER DEFAULT 0,
  pdf_url TEXT,
  cover_image_url TEXT,
  statut TEXT DEFAULT 'draft' CHECK (statut IN ('draft', 'processing', 'ready', 'published', 'archived')),
  vision_api_processed BOOLEAN DEFAULT false,
  vision_api_error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pages table
CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_url TEXT,
  thumbnail_url TEXT,
  vision_api_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(edition_id, page_number)
);

-- Articles table
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu_texte TEXT NOT NULL,
  categorie TEXT,
  auteur TEXT,
  position_x FLOAT NOT NULL,
  position_y FLOAT NOT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  ordre_lecture INTEGER DEFAULT 0,
  mots_count INTEGER DEFAULT 0,
  temps_lecture_estime INTEGER DEFAULT 0,
  confidence_score FLOAT DEFAULT 0,
  valide BOOLEAN DEFAULT false,
  ajuste_manuellement BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lectures articles (analytics)
CREATE TABLE IF NOT EXISTS lectures_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  temps_lecture_secondes INTEGER DEFAULT 0,
  pourcentage_lu FLOAT DEFAULT 0,
  complete BOOLEAN DEFAULT false,
  bookmarked BOOLEAN DEFAULT false,
  session_id TEXT,
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tokens articles (security)
CREATE TABLE IF NOT EXISTS tokens_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  access_count INTEGER DEFAULT 0,
  max_access_count INTEGER DEFAULT 50,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_editions_statut ON editions(statut);
CREATE INDEX IF NOT EXISTS idx_editions_date ON editions(date_edition DESC);
CREATE INDEX IF NOT EXISTS idx_pages_edition ON pages(edition_id, page_number);
CREATE INDEX IF NOT EXISTS idx_articles_edition ON articles(edition_id, ordre_lecture);
CREATE INDEX IF NOT EXISTS idx_articles_page ON articles(page_id);
CREATE INDEX IF NOT EXISTS idx_lectures_user ON lectures_articles(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lectures_article ON lectures_articles(article_id);
CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens_articles(token) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens_articles(user_id);

-- Enable RLS
ALTER TABLE editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lectures_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens_articles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for editions
CREATE POLICY "Admins can manage all editions"
  ON editions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view published editions"
  ON editions FOR SELECT
  TO authenticated
  USING (statut = 'published');

-- RLS Policies for pages
CREATE POLICY "Admins can manage all pages"
  ON pages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view pages of published editions"
  ON pages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM editions
      WHERE editions.id = pages.edition_id
      AND editions.statut = 'published'
    )
  );

-- RLS Policies for articles
CREATE POLICY "Admins can manage all articles"
  ON articles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view articles of published editions"
  ON articles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM editions
      WHERE editions.id = articles.edition_id
      AND editions.statut = 'published'
    )
  );

CREATE POLICY "Public can read articles with valid token"
  ON articles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tokens_articles
      WHERE tokens_articles.article_id = articles.id
      AND tokens_articles.expires_at > NOW()
      AND NOT tokens_articles.revoked
      AND tokens_articles.access_count < tokens_articles.max_access_count
    )
  );

-- RLS Policies for lectures_articles
CREATE POLICY "Users can insert their own reading analytics"
  ON lectures_articles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own reading analytics"
  ON lectures_articles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own reading analytics"
  ON lectures_articles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all reading analytics"
  ON lectures_articles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- RLS Policies for tokens_articles
CREATE POLICY "Admins can manage all tokens"
  ON tokens_articles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view their own tokens"
  ON tokens_articles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Public can read tokens for validation"
  ON tokens_articles FOR SELECT
  USING (
    expires_at > NOW()
    AND NOT revoked
    AND access_count < max_access_count
  );

CREATE POLICY "Public can update token access count"
  ON tokens_articles FOR UPDATE
  USING (
    expires_at > NOW()
    AND NOT revoked
    AND access_count < max_access_count
  )
  WITH CHECK (
    expires_at > NOW()
    AND NOT revoked
  );
