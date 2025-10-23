# Guide: Système d'Extraction et Lecture d'Articles

## Vue d'ensemble

Ce système permet d'extraire automatiquement les articles d'un PDF de journal à l'aide de Google Cloud Vision API et de les présenter dans une liseuse de presse moderne inspirée de Milibris/Cafeyn.

## Architecture

### 1. Extraction automatique (Backend)
- **Google Cloud Vision API** : OCR et détection de layout
- **Edge Function `extract-articles`** : Traite le PDF et extrait les articles
- **Base de données** : Stocke les éditions, pages et articles extraits

### 2. Liseuse Magazine (Frontend)
- **Vue Magazine** : Affiche la page du journal avec zones cliquables
- **Modal Article** : Lecture optimisée mobile du contenu texte
- **Analytics** : Tracking de lecture par article

### 3. Sécurité
- **Tokens d'accès** : Validation serveur à chaque lecture
- **Watermark dynamique** : Identifiant utilisateur
- **Analytics détaillés** : Temps de lecture, articles lus

## Flux d'utilisation Admin

### 1. Upload et extraction d'une nouvelle édition

1. Se connecter en tant qu'admin
2. Aller dans l'onglet **"Articles"**
3. Remplir le formulaire:
   - Titre de l'édition (ex: "L'Enquêteur - 14 Octobre 2024")
   - Numéro d'édition (optionnel)
   - Date d'édition
   - Sélectionner le fichier PDF

4. Cliquer sur **"Upload et Extraire les Articles"**

### 2. Que se passe-t-il ensuite ?

- Le PDF est uploadé sur Supabase Storage
- Une entrée est créée dans la table `editions` avec statut "draft"
- L'Edge Function `extract-articles` est appelée automatiquement
- Le statut passe à "processing"

#### Processus d'extraction (30-60 secondes):

1. Le PDF est téléchargé depuis Supabase Storage
2. Chaque page est envoyée à Google Cloud Vision API
3. L'API retourne la structure du document (blocks, paragraphs, words)
4. Les blocks de texte sont regroupés en articles
5. Chaque article est sauvegardé avec:
   - Titre (première ligne du texte)
   - Contenu complet
   - Position sur la page (x, y, width, height)
   - Nombre de mots
   - Temps de lecture estimé
   - Score de confiance

6. Le statut passe à "ready"

### 3. Publier l'édition

Une fois l'extraction terminée, vous pouvez:

1. Vérifier les articles extraits dans l'interface
2. Aller dans l'onglet **"Publication"** (système existant)
3. Publier l'édition pour générer les tokens et envoyer les WhatsApp

## Flux d'utilisation Lecteur

### 1. Réception du lien

Le lecteur reçoit un lien WhatsApp: `https://votre-domaine.com/read/TOKEN`

### 2. Validation automatique

- Le système valide le token
- Vérifie si l'édition a des articles extraits
- Route automatiquement vers la bonne vue:
  - **Articles extraits** → Vue Magazine moderne
  - **Pas d'articles** → Ancienne liseuse PDF classique

### 3. Vue Magazine (si articles disponibles)

#### Interface:
- Image de la page du journal en grand
- Zones cliquables sur chaque article (invisibles, highlight au hover)
- Navigation entre pages avec boutons Précédent/Suivant
- Indicateurs visuels: articles lus, nombre d'articles

#### Interaction:
- **Clic sur un article** → Ouvre le modal de lecture
- **Swipe/Click** → Change de page

### 4. Modal Article (lecture optimisée)

#### Interface:
- Titre en grand
- Catégorie et auteur (si disponibles)
- Temps de lecture estimé
- Texte formaté pour lecture confortable (max 70 chars/ligne)
- Boutons: Bookmark, Précédent, Suivant, Fermer
- Watermark utilisateur en bas à droite

#### Fonctionnalités:
- **Navigation** : Précédent/Suivant entre articles
- **Bookmark** : Sauvegarder pour lire plus tard
- **Tracking automatique** : Temps de lecture enregistré
- **Watermark dynamique** : ID utilisateur affiché

## Analytics

### Données collectées par article:
- Temps de lecture (secondes)
- Pourcentage lu
- Complétion (> 10 secondes)
- Bookmark
- Session ID et device fingerprint

### Rapports disponibles (à venir):
- Articles les plus lus par édition
- Temps moyen de lecture
- Taux d'abandon
- Articles bookmarkés

## Google Cloud Vision API

### Configuration actuelle:
- **API Key** : Configurée dans l'Edge Function
- **Tarification** :
  - 0-1000 pages/mois : GRATUIT
  - 1001-5M pages : $1.50 per 1000 pages
- **Précision** : 95-99% pour texte français

### Ce que l'API détecte:
- Blocs de texte (articles)
- Positions exactes (bounding boxes)
- Hiérarchie (pages → blocks → paragraphes → mots)
- Colonnes et layout
- Confiance de détection

## Tables de base de données

### `editions`
Stocke les éditions de journal uploadées
- id, titre, numero_edition, date_edition
- pdf_url, cover_image_url
- statut (draft, processing, ready, published, archived)
- vision_api_processed (booléen)

### `pages`
Une entrée par page du journal
- edition_id, page_number
- image_url, thumbnail_url
- vision_api_response (JSON brut de l'API)

### `articles`
Articles extraits automatiquement
- edition_id, page_id
- titre, contenu_texte, categorie, auteur
- position_x, position_y, width, height (coordonnées normalisées 0-1)
- ordre_lecture, mots_count, temps_lecture_estime
- confidence_score, valide

### `lectures_articles`
Analytics de lecture par article
- user_id, article_id
- temps_lecture_secondes, pourcentage_lu
- complete, bookmarked
- session_id, device_fingerprint

### `tokens_articles` (optionnel, pour le futur)
Tokens d'accès par article individuel
- article_id, user_id, token
- expires_at, access_count, max_access_count
- revoked

## Edge Functions

### `extract-articles`
**Entrées** : editionId, pdfUrl
**Sorties** : pagesProcessed, articlesExtracted

**Processus** :
1. Télécharge le PDF depuis Supabase Storage
2. Convertit en base64
3. Appelle Google Cloud Vision API
4. Parse la réponse structurée
5. Regroupe les blocks en articles
6. Sauvegarde dans la base de données

### `validate-edition-access`
**Entrées** : token
**Sorties** : valid, hasArticles, editionId, userId

**Processus** :
1. Valide le token dans la table `tokens`
2. Vérifie expiration, révocation, limite d'accès
3. Cherche si une édition avec articles existe pour ce PDF
4. Retourne les infos nécessaires pour router vers la bonne vue

## Sécurité

### Multi-couches:
1. **Token validation** serveur à chaque accès
2. **RLS Supabase** sur toutes les tables
3. **Watermark** ID utilisateur visible
4. **Analytics** détection de patterns suspects
5. **Access count** limite de vues par token

### Avantages vs PDF direct:
- Texte en base de données (pas de fichier téléchargeable)
- Validation serveur requise pour chaque article
- Impossible de reconstituer le PDF original
- Partage très difficile (doit partager article par article)
- Révocation instantanée possible

## Prochaines étapes (améliorations futures)

### Court terme:
1. **Génération d'images de pages** : Convertir PDF → Images PNG/WebP pour la vue magazine
2. **Validation manuelle** : Interface pour corriger les articles mal détectés
3. **Catégories automatiques** : Détection des sections (Une, Sport, Politique, etc.)
4. **Table des matières** : Liste de tous les articles avec navigation rapide

### Moyen terme:
1. **Templates réutilisables** : Sauvegarder le layout pour réutilisation
2. **OCR amélioré** : Ajustement des paramètres de regroupement
3. **Recherche full-text** : Dans tous les articles d'une édition
4. **Mode lecture continue** : Scroll tous les articles sans fermer

### Long terme:
1. **Recommandations** : Articles similaires basés sur catégories
2. **Partage sécurisé** : Génération de liens par article
3. **Audio** : Text-to-speech pour écouter les articles
4. **Annotations** : Notes et highlights personnels

## Support technique

### Logs à vérifier en cas de problème:

1. **Extraction qui échoue** :
   - Vérifier les logs de l'Edge Function `extract-articles`
   - Regarder le champ `vision_api_error` dans la table `editions`

2. **Articles mal détectés** :
   - Vérifier le `confidence_score` dans la table `articles`
   - Examiner le `vision_api_response` dans la table `pages`

3. **Accès refusé lecteur** :
   - Vérifier le token dans la table `tokens`
   - Regarder les logs de l'Edge Function `validate-edition-access`

### Commandes utiles:

```sql
-- Voir les éditions et leur statut
SELECT id, titre, statut, vision_api_processed, nb_pages, created_at
FROM editions
ORDER BY created_at DESC;

-- Compter les articles par édition
SELECT e.titre, COUNT(a.id) as nb_articles
FROM editions e
LEFT JOIN articles a ON a.edition_id = e.id
GROUP BY e.id, e.titre
ORDER BY e.created_at DESC;

-- Voir les articles les plus lus
SELECT a.titre, COUNT(la.id) as nb_lectures, AVG(la.temps_lecture_secondes) as temps_moyen
FROM articles a
LEFT JOIN lectures_articles la ON la.article_id = a.id
GROUP BY a.id, a.titre
ORDER BY nb_lectures DESC;
```

## Coûts estimés

### Google Cloud Vision API:
- 360 pages/mois (1 édition/jour × 12 pages) : **$0/mois** (free tier)
- 1000 pages/mois : **$0/mois** (free tier)
- 5000 pages/mois : **$6/mois**

### Supabase:
- Pro tier : **$25/mois** (recommandé pour production)
- Inclut : 8GB base, 100GB storage, 250GB bande passante

### Total estimé: **$25-31/mois** tout compris

## Conclusion

Ce système offre une expérience de lecture moderne et optimisée pour mobile tout en maintenant un haut niveau de sécurité. L'extraction automatique avec Google Cloud Vision API élimine le travail manuel de définition des zones d'articles, permettant de publier rapidement de nouvelles éditions.

La compatibilité avec l'ancien système PDF garantit une transition en douceur : les éditions sans articles extraits utilisent toujours l'ancienne liseuse, tandis que les nouvelles éditions bénéficient automatiquement de la vue magazine moderne.
