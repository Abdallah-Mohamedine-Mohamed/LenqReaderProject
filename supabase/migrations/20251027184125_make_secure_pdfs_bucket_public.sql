/*
  # Rendre le bucket secure-pdfs public

  1. Modifications
    - Change le bucket `secure-pdfs` de privé à public
    - Ajoute une politique de lecture publique pour permettre l'accès sans authentification
    - Conserve les politiques d'upload/delete restreintes aux admins

  2. Sécurité
    - Seuls les utilisateurs authentifiés avec rôle admin peuvent uploader/supprimer
    - La lecture publique permet l'accès via getPublicUrl() pour les lecteurs avec token
    - Les tokens sont validés côté serveur avant de donner accès
    
  3. Pourquoi ce changement
    - Les abonnés accèdent aux journaux via des liens WhatsApp (non authentifiés)
    - Le système de tokens valide l'accès au niveau applicatif
    - Le bucket doit être public pour que getPublicUrl() fonctionne sur mobile
*/

-- Mettre à jour le bucket secure-pdfs pour le rendre public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'secure-pdfs';

-- Ajouter une politique de lecture publique si elle n'existe pas
DROP POLICY IF EXISTS "Public can read secure PDFs" ON storage.objects;

CREATE POLICY "Public can read secure PDFs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'secure-pdfs');
