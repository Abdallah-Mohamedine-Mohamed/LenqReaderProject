# Instructions de debugging pour l'accès mobile

## Problème

L'erreur **"Accès refusé - Erreur lors du chargement du PDF"** apparaît sur mobile lorsqu'un abonné essaie d'ouvrir le lien du journal.

## Corrections appliquées

### 1. ✅ Ajout des champs `pdfUrl` et `pdfTitle` dans `validate-edition-access`
La fonction Edge retourne maintenant tous les champs nécessaires, même pour les éditions avec articles.

### 2. ✅ Bucket `secure-pdfs` rendu public
Migration appliquée pour permettre l'accès sans authentification via `getPublicUrl()`.

### 3. ✅ Ajout de logging détaillé dans `ModernPDFReader`
Des messages de console ont été ajoutés pour tracer le flux complet de chargement du PDF.

## Comment déboguer sur mobile

### Étape 1 : Activer le mode développeur sur mobile

#### Sur iOS (Safari)
1. Sur votre iPhone, allez dans **Réglages > Safari > Avancé**
2. Activez **Inspecteur Web**
3. Connectez votre iPhone à votre Mac
4. Ouvrez Safari sur Mac > **Développement** > Sélectionnez votre iPhone > Ouvrez l'onglet

#### Sur Android (Chrome)
1. Sur votre téléphone Android, allez dans **Paramètres > À propos du téléphone**
2. Appuyez 7 fois sur **Numéro de build** pour activer le mode développeur
3. Allez dans **Paramètres > Options de développement**
4. Activez **Débogage USB**
5. Connectez votre téléphone à votre ordinateur
6. Ouvrez Chrome sur PC et allez dans **chrome://inspect**
7. Votre appareil devrait apparaître

### Étape 2 : Tester et vérifier les logs

1. **Publiez une édition** depuis l'admin
2. **Copiez le lien WhatsApp** envoyé à un abonné
3. **Ouvrez le lien sur mobile** avec l'inspecteur web activé
4. **Regardez la console** et cherchez les messages suivants :

```
[ModernPDFReader] Applying access data: { pdfUrl, pdfTitle, hasArticles, editionId }
[ModernPDFReader] Resolving PDF URL for path: editions/1234567890_filename.pdf
[ModernPDFReader] Using public URL: https://your-supabase-url/storage/v1/object/public/secure-pdfs/editions/1234567890_filename.pdf
[ModernPDFReader] Initializing PDF with URL: https://...
[ModernPDFReader] Loading PDF document...
[ModernPDFReader] PDF loaded successfully, pages: 12
```

### Étape 3 : Identifier le problème

#### Cas 1 : `pdfUrl` est vide ou undefined
```
[ModernPDFReader] Applying access data: { pdfUrl: undefined, ... }
```
**Cause** : La fonction `validate-edition-access` ne retourne pas `pdfUrl`
**Solution** : Vérifier que la fonction Edge a été redéployée correctement

#### Cas 2 : Échec de résolution de l'URL
```
[ModernPDFReader] Failed to resolve PDF URL: Impossible de generer une URL pour le PDF: editions/xxx.pdf
```
**Cause** : Le bucket n'est pas public ou le chemin est incorrect
**Solution** : Vérifier que la migration `make_secure_pdfs_bucket_public` a été appliquée

#### Cas 3 : Erreur 403 Forbidden lors du chargement
```
[ModernPDFReader] Error loading PDF: Failed to fetch
[ModernPDFReader] PDF URL that failed: https://...
```
**Cause** : Le bucket est toujours privé ou les politiques RLS bloquent l'accès
**Solution** :
1. Vérifier que le bucket `secure-pdfs` est public :
   ```sql
   SELECT id, name, public FROM storage.buckets WHERE id = 'secure-pdfs';
   ```
2. Vérifier les politiques sur `storage.objects` :
   ```sql
   SELECT policyname, cmd FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
   AND policyname LIKE '%secure-pdfs%' OR policyname LIKE '%Public%';
   ```

#### Cas 4 : Erreur 404 Not Found
```
[ModernPDFReader] Error loading PDF: Not Found
[ModernPDFReader] PDF URL that failed: https://...
```
**Cause** : Le fichier PDF n'existe pas dans le bucket
**Solution** :
1. Vérifier le chemin dans la table `pdfs` :
   ```sql
   SELECT id, titre, url_fichier FROM pdfs WHERE id = 'PDF_ID';
   ```
2. Vérifier que le fichier existe dans le bucket :
   - Aller dans le dashboard Supabase
   - Storage > secure-pdfs
   - Chercher le fichier

#### Cas 5 : CORS Error
```
Access to fetch at 'https://...' from origin 'https://your-app.com' has been blocked by CORS policy
```
**Cause** : Les headers CORS ne sont pas correctement configurés
**Solution** : Vérifier les headers CORS dans Supabase Storage (normalement géré automatiquement)

## Commandes SQL utiles pour le debugging

### Vérifier le bucket
```sql
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'secure-pdfs';
```

### Vérifier les politiques storage
```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
```

### Lister les fichiers dans le bucket
```sql
SELECT name, id, bucket_id, created_at
FROM storage.objects
WHERE bucket_id = 'secure-pdfs'
ORDER BY created_at DESC
LIMIT 20;
```

### Vérifier les tokens générés
```sql
SELECT
  t.id,
  t.token,
  t.pdf_id,
  t.user_id,
  t.expires_at,
  t.revoked,
  t.access_count,
  p.titre as pdf_titre,
  p.url_fichier,
  u.nom as user_nom
FROM tokens t
JOIN pdfs p ON t.pdf_id = p.id
JOIN users u ON t.user_id = u.id
WHERE t.created_at > NOW() - INTERVAL '1 day'
ORDER BY t.created_at DESC
LIMIT 10;
```

## Test manuel rapide

Pour tester rapidement sans passer par WhatsApp :

1. **Générer un token** :
   ```sql
   INSERT INTO tokens (pdf_id, user_id, token, expires_at, max_access_count)
   VALUES (
     'YOUR_PDF_ID',
     'YOUR_USER_ID',
     'test-token-' || gen_random_uuid(),
     NOW() + INTERVAL '1 hour',
     999
   )
   RETURNING token;
   ```

2. **Ouvrir le lien** : `https://your-app.com/read/test-token-...`

3. **Vérifier les logs** dans la console du navigateur

## Points à vérifier si le problème persiste

### Backend (Supabase)
- [ ] La fonction Edge `validate-edition-access` a bien été redéployée
- [ ] La migration `make_secure_pdfs_bucket_public` a été appliquée
- [ ] Le bucket `secure-pdfs` est public (`public = true`)
- [ ] La politique "Public can read secure PDFs" existe
- [ ] Les fichiers PDF existent bien dans le bucket

### Frontend (Application)
- [ ] Le build a été effectué après les modifications
- [ ] Le cache du navigateur a été vidé
- [ ] L'application déployée utilise la dernière version
- [ ] Les variables d'environnement `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont correctes

### Mobile
- [ ] Le navigateur mobile est à jour
- [ ] Le téléphone a une connexion internet stable
- [ ] Les cookies/cache du navigateur mobile ont été vidés
- [ ] Tester avec un autre navigateur mobile (Safari vs Chrome)

## Prochaines étapes si ça ne fonctionne toujours pas

1. **Partager les logs de la console mobile** en suivant les étapes de debugging ci-dessus
2. **Vérifier l'URL du PDF** générée et tester de l'ouvrir directement dans un navigateur
3. **Tester avec un PDF de test** plus petit pour éliminer les problèmes de taille/timeout
4. **Vérifier les quotas Supabase** (bande passante, nombre de requêtes)

---

**Date** : 2025-10-27
**Version** : 1.0
**Statut** : Logging ajouté, prêt pour le debugging
