/*
  # Enrichir les Articles avec Structure Complète pour AWS Textract

  ## Modifications
  
  1. Nouvelles Colonnes dans `articles`
    - `sous_titre` (TEXT) - Sous-titre ou chapô de l'article
    - `layout_metadata` (JSONB) - Métadonnées complètes de layout Textract
    - `textract_confidence` (FLOAT) - Score de confiance global Textract
    - `extraction_method` (TEXT) - Méthode d'extraction utilisée (textract, pdfjs, manual)
    
  2. Modifications de Colonnes Existantes
    - Rendre `auteur` nullable mais encouragé
    - Ajouter valeur par défaut pour `extraction_method`
    
  3. Indexes
    - Index sur `extraction_method` pour filtrage rapide
    - Index GIN sur `layout_metadata` pour recherches JSONB
    
  ## Notes
  - Compatible avec les données existantes (colonnes nullables)
  - Permet migration progressive des anciennes extractions
  - Structure JSONB flexible pour évolution future
*/

-- Ajouter nouvelles colonnes pour structure enrichie
ALTER TABLE articles ADD COLUMN IF NOT EXISTS sous_titre TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS layout_metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS textract_confidence FLOAT DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS extraction_method TEXT DEFAULT 'pdfjs' CHECK (extraction_method IN ('textract', 'pdfjs', 'manual'));

-- Créer indexes pour performance
CREATE INDEX IF NOT EXISTS idx_articles_extraction_method ON articles(extraction_method);
CREATE INDEX IF NOT EXISTS idx_articles_layout_metadata ON articles USING GIN (layout_metadata);
CREATE INDEX IF NOT EXISTS idx_articles_textract_confidence ON articles(textract_confidence DESC) WHERE textract_confidence > 0;

-- Ajouter commentaires pour documentation
COMMENT ON COLUMN articles.sous_titre IS 'Sous-titre ou chapô de l''article extrait automatiquement';
COMMENT ON COLUMN articles.layout_metadata IS 'Métadonnées complètes du layout Textract (blocs, hiérarchie, positions)';
COMMENT ON COLUMN articles.textract_confidence IS 'Score de confiance moyen de l''extraction Textract (0-100)';
COMMENT ON COLUMN articles.extraction_method IS 'Méthode d''extraction: textract (AWS), pdfjs (basique), manual (ajusté manuellement)';

-- Mettre à jour les articles existants pour marquer la méthode d'extraction
UPDATE articles SET extraction_method = 'pdfjs' WHERE extraction_method IS NULL;
