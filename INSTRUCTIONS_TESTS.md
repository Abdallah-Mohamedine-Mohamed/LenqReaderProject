# Instructions pour Tester la Plateforme

## Création d'un Nouvel Abonné

### Étapes:

1. **Connectez-vous en tant qu'admin**
   - Utilisez vos identifiants admin existants

2. **Accédez à l'onglet "Abonnés"**
   - C'est le premier onglet dans le dashboard admin

3. **Cliquez sur "Nouvel Abonné"**
   - Bouton en haut à droite de la page

4. **Remplissez le formulaire:**
   - **Nom complet**: Le nom de l'abonné
   - **Email**: Une adresse email valide et unique
   - **Numéro WhatsApp**: Format +227 XX XX XX XX (optionnel)
   - **Mot de passe**: Minimum 6 caractères

5. **Cliquez sur "Créer"**

### Ce qui se passe en arrière-plan:

1. Un compte Supabase Auth est créé avec l'email et le mot de passe
2. Un trigger automatique crée l'entrée dans la table `public.users`
3. Un **numéro d'abonné unique** est généré automatiquement (ex: ENQ123456)
4. Un **code de parrainage** est généré automatiquement
5. Les données supplémentaires (WhatsApp, statut) sont mises à jour

### En cas d'erreur:

Si vous obtenez encore une erreur "Database error saving new user", cela peut être dû à:

1. **Email déjà utilisé**: Essayez avec un autre email
2. **Problème de synchronisation**: Attendez 2-3 secondes et réessayez
3. **Configuration Supabase**: Vérifiez que le trigger `on_auth_user_created` est bien actif

## Test du Workflow Complet

### 1. Créer un Abonné
- Suivez les étapes ci-dessus

### 2. Créer un Abonnement
- Allez dans l'onglet **"Paiements"**
- Cliquez sur **"Enregistrer Paiement"**
- Sélectionnez l'abonné créé
- Choisissez une formule (ex: Hebdomadaire)
- Remplissez les détails du paiement
- Cliquez sur **"Enregistrer"**

Cela va:
- Créer un abonnement actif
- Calculer automatiquement la date de fin
- Mettre à jour le statut de l'abonné à "actif"

### 3. Upload d'une Édition
- Allez dans l'onglet **"Upload"**
- Remplissez:
  - Titre (ex: "L'Enquêteur - Édition du 14 Octobre 2025")
  - Date d'édition (ex: 14/10/2025)
  - Numéro d'édition (ex: 1)
- Sélectionnez un fichier PDF
- Cliquez sur **"Téléverser le journal"**

### 4. Publier l'Édition
- Allez dans l'onglet **"Publication"**
- Trouvez l'édition que vous venez de téléverser
- Cliquez sur **"Publier"**
- Confirmez la publication

Cela va:
- Générer un lien unique pour chaque abonné actif
- Créer des notifications WhatsApp dans la file d'attente
- Marquer l'édition comme "Publiée"

### 5. Vérifier les Notifications
- Allez dans l'onglet **"Éditions"** ou **"Accès"**
- Vous verrez les liens générés
- Les notifications sont créées et prêtes pour l'envoi WhatsApp

## Vérification des Données dans la Base

Pour vérifier que tout fonctionne correctement, vous pouvez exécuter ces requêtes SQL dans le dashboard Supabase:

```sql
-- Voir tous les abonnés
SELECT
  numero_abonne,
  nom,
  email,
  statut_abonnement,
  date_fin_abonnement,
  code_parrainage
FROM users
WHERE role = 'lecteur'
ORDER BY created_at DESC;

-- Voir tous les abonnements actifs
SELECT
  u.nom,
  u.numero_abonne,
  f.nom as formule,
  a.date_debut,
  a.date_fin,
  a.statut
FROM abonnements a
JOIN users u ON a.user_id = u.id
JOIN formules f ON a.formule_id = f.id
ORDER BY a.created_at DESC;

-- Voir les notifications en attente
SELECT
  u.nom,
  n.type_notification,
  n.statut,
  n.created_at
FROM notifications n
JOIN users u ON n.user_id = u.id
WHERE n.statut = 'en_attente'
ORDER BY n.created_at DESC;
```

## Notes Importantes

1. **Confirmation par email**: Par défaut, Supabase envoie un email de confirmation. Pour tester rapidement:
   - Allez dans Supabase Dashboard > Authentication > Settings
   - Désactivez "Enable email confirmations" si nécessaire

2. **Numéros d'abonné**: Générés automatiquement au format ENQ + 6 chiffres aléatoires

3. **Sécurité**:
   - Tous les liens générés sont uniques et tracés
   - Chaque accès est enregistré avec IP, device, etc.
   - Les alertes de sécurité sont automatiques

4. **WhatsApp**:
   - Pour l'instant, les notifications sont créées en base de données
   - L'intégration Baileys pour l'envoi réel sera faite ultérieurement

## Problèmes Courants

### "Invalid login credentials"
- Vérifiez l'email et le mot de passe
- Assurez-vous que l'utilisateur existe bien dans auth.users

### "Database error saving new user"
- L'email est peut-être déjà utilisé
- Vérifiez que le trigger `on_auth_user_created` est actif
- Attendez 2-3 secondes entre les tentatives

### L'abonné n'apparaît pas
- Actualisez la page
- Vérifiez dans l'onglet Abonnés avec le filtre "Tous les statuts"
- Vérifiez la table users dans Supabase

## Support

Si vous rencontrez des problèmes persistants, vérifiez:
1. Les logs du navigateur (Console F12)
2. Les logs Supabase (Dashboard > Logs)
3. Les triggers et fonctions dans la base de données
