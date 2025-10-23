# Configuration de la Connexion Admin

## ✅ Changements Effectués

### 1. Nouvelle Page de Connexion Admin
- **Fichier créé:** `src/components/AdminLogin.tsx`
- **Route:** `/admin-login`
- **Fonctionnalité:** Connexion par email/mot de passe réservée aux administrateurs

### 2. Routes Mises à Jour
- **Fichier modifié:** `src/App.tsx`
- Ajout de la route `/admin-login`
- Redirection vers `/admin-login` au lieu de `/login` pour les accès admin protégés

### 3. Interface Améliorée
- **Fichier modifié:** `src/components/LandingPage.tsx`
- Ajout d'un bouton "Admin" dans le header
- Accès rapide à la page de connexion admin

## 🔑 Comment Se Connecter en tant qu'Admin

### Option 1: Via la Page d'Accueil
1. Allez sur la page d'accueil `/`
2. Cliquez sur le bouton "Admin" dans le header
3. Entrez votre email et mot de passe admin

### Option 2: URL Directe
1. Allez directement sur `/admin-login`
2. Entrez votre email et mot de passe admin

## 📝 Création d'un Compte Admin

Si vous n'avez pas encore de compte admin, vous devez en créer un dans la base de données :

### Via SQL dans Supabase Dashboard:

```sql
-- 1. Créer un utilisateur Supabase Auth
-- Allez dans Authentication > Users > Add User
-- Email: admin@example.com
-- Password: votre-mot-de-passe-sécurisé

-- 2. Créer l'entrée dans la table users
INSERT INTO users (email, nom, role, password_hash)
VALUES (
  'admin@example.com',
  'Administrateur',
  'admin',
  'placeholder' -- Le vrai hash est dans auth.users
);
```

### Via l'Interface Supabase:

1. Allez dans **Authentication** > **Users**
2. Cliquez sur **Add User**
3. Entrez:
   - Email: `admin@example.com`
   - Password: votre mot de passe sécurisé
   - Confirmez

4. Allez dans **Table Editor** > **users**
5. Ajoutez une nouvelle ligne:
   - email: `admin@example.com` (même email)
   - nom: `Administrateur`
   - role: `admin`
   - Les autres champs sont optionnels

## 🔐 Différence entre Admin et Lecteur

### Connexion Admin (`/admin-login`)
- Utilise email + mot de passe
- Accède à `/admin`
- Gère les abonnés, éditions, paiements, sécurité

### Connexion Lecteur (`/login`)
- Utilise numéro WhatsApp + code OTP
- Accède à `/my-account`
- Consulte ses éditions et son abonnement

## 🛡️ Sécurité

- Les admins doivent avoir `role = 'admin'` dans la table `users`
- La vérification du rôle se fait après l'authentification
- Les utilisateurs non-admin sont redirigés vers `/my-account`
- Les utilisateurs non connectés sont redirigés vers `/admin-login`

## 🚀 Accès Rapides

- **Page d'accueil:** `/`
- **Connexion lecteur:** `/login`
- **Connexion admin:** `/admin-login`
- **Dashboard admin:** `/admin`
- **Dashboard lecteur:** `/my-account`

## ⚠️ Important

Après avoir créé votre compte admin, assurez-vous que:
1. ✅ L'email existe dans `auth.users` (table Supabase Auth)
2. ✅ L'email existe dans `public.users` avec `role = 'admin'`
3. ✅ Le mot de passe fonctionne pour se connecter

Si vous oubliez votre mot de passe admin, vous pouvez le réinitialiser via le Dashboard Supabase dans Authentication > Users.
