# 🚀 Guide de déploiement

## ✅ État actuel
- ✅ Build réussi
- ✅ Polyfill `Promise.withResolvers` inclus
- ✅ Imports corrigés
- ✅ Fichiers générés dans `dist/`

## 📦 Contenu à déployer

Le dossier `dist/` contient :
```
dist/
├── index.html
├── assets/
│   ├── index-DlkokNOq.js (897 KB)
│   ├── index-C4-XVEsb.css (57 KB)
│   └── pdf.worker.min-yatZIOMy.mjs (1.3 MB)
└── _redirects (pour SPA routing)
```

## 🌐 Méthodes de déploiement

### Option 1 : Netlify (Recommandé)

#### Via interface web :
1. Allez sur https://app.netlify.com/
2. Cliquez "Add new site" > "Deploy manually"
3. Glissez-déposez le dossier `dist/` entier
4. Netlify génèrera une URL : `https://random-name-123.netlify.app`

#### Via CLI :
```bash
# Installer Netlify CLI
npm install -g netlify-cli

# Se connecter
netlify login

# Déployer
netlify deploy --dir=dist --prod
```

### Option 2 : Vercel

```bash
# Installer Vercel CLI
npm install -g vercel

# Se connecter
vercel login

# Déployer
vercel --prod
```

### Option 3 : Serveur web traditionnel (Apache, Nginx, etc.)

#### Via FTP/SFTP :
1. Connectez-vous à votre serveur
2. Allez dans le dossier web (souvent `/var/www/html` ou `public_html`)
3. **Téléversez TOUT le contenu du dossier `dist/`** (pas le dossier lui-même)
4. Assurez-vous que `index.html` est à la racine

#### Structure finale sur le serveur :
```
/var/www/html/
├── index.html
├── assets/
│   ├── index-DlkokNOq.js
│   ├── index-C4-XVEsb.css
│   └── pdf.worker.min-yatZIOMy.mjs
└── _redirects
```

### Option 4 : GitHub Pages

```bash
# Créer une branche gh-pages
git checkout -b gh-pages

# Copier dist/ à la racine
cp -r dist/* .

# Commit et push
git add .
git commit -m "Deploy to GitHub Pages"
git push origin gh-pages

# Activer GitHub Pages dans les settings du repo
# Settings > Pages > Source: gh-pages branch
```

## 🔧 Configuration serveur

### Pour Apache (.htaccess)
Si vous utilisez Apache, créez un fichier `.htaccess` dans `dist/` :

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

# Enable CORS for fonts and assets
<IfModule mod_headers.c>
  <FilesMatch "\.(ttf|ttc|otf|eot|woff|woff2|font.css|css|js)$">
    Header set Access-Control-Allow-Origin "*"
  </FilesMatch>
</IfModule>
```

### Pour Nginx
Dans votre config Nginx :

```nginx
location / {
    try_files $uri $uri/ /index.html;
}

# Enable CORS
add_header Access-Control-Allow-Origin *;
```

## 🧪 Tester le déploiement

### 1. Tester localement d'abord
```bash
npm run preview
# Ouvrez http://localhost:4173 dans votre navigateur
```

### 2. Vérifier l'accès mobile
Une fois déployé :
1. Copiez l'URL de votre application
2. Ouvrez-la sur votre mobile
3. Vérifiez que la page d'accueil s'affiche
4. Testez un lien WhatsApp avec token

### 3. Vider le cache
Sur mobile après déploiement :
- **iOS Safari** : Réglages > Safari > Effacer historique et données
- **Android Chrome** : ⋮ > Historique > Effacer les données de navigation
- Ou utilisez le mode navigation privée

## 🐛 Problèmes courants

### "Page blanche" après déploiement

**Cause** : Chemins d'assets incorrects

**Solution** : Vérifiez que tous les fichiers de `dist/assets/` sont bien téléversés

### "404 Not Found" sur les routes

**Cause** : Le serveur ne redirige pas vers `index.html`

**Solution** :
- Ajoutez le fichier `_redirects` (Netlify)
- Ou configurez `.htaccess` (Apache)
- Ou configurez `nginx.conf` (Nginx)

### "Failed to load PDF" sur mobile

**Cause** : Cache navigateur ou bucket Supabase privé

**Solution** :
1. Videz le cache mobile
2. Vérifiez que le bucket `secure-pdfs` est public
3. Vérifiez la console du navigateur pour voir l'erreur exacte

### "Promise.withResolvers is not a function"

**Cause** : Le polyfill n'est pas chargé ou l'ancienne version est en cache

**Solution** :
1. Vérifiez que `dist/assets/index-*.js` contient le polyfill
2. Videz complètement le cache navigateur
3. Forcez un hard refresh (Ctrl+Shift+R ou Cmd+Shift+R)

## 📱 Tester le lien WhatsApp complet

### Format du lien
```
https://votre-domaine.com/reader?token=abc123def456
```

### Étapes de test
1. Publiez une édition depuis l'admin
2. Copiez le lien WhatsApp généré
3. Envoyez-le sur WhatsApp
4. Ouvrez depuis un mobile
5. Le journal devrait se charger avec watermarks

## 🔐 Variables d'environnement

Assurez-vous que votre fichier `.env` est correct :

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-anonyme
```

**IMPORTANT** : Ces variables doivent être définies **avant le build** !

Si vous les changez, vous devez **rebuild** :
```bash
npm run build
```

## ✅ Checklist de déploiement

- [ ] Build réussi (`npm run build`)
- [ ] Fichiers présents dans `dist/`
- [ ] Variables d'environnement correctes
- [ ] Dossier `dist/` uploadé sur le serveur
- [ ] Configuration serveur (.htaccess ou nginx.conf)
- [ ] Test sur ordinateur OK
- [ ] Test sur mobile OK
- [ ] Cache navigateur vidé
- [ ] Liens WhatsApp fonctionnels

## 🆘 Besoin d'aide ?

Si ça ne fonctionne toujours pas, fournissez :
1. L'URL où vous avez déployé
2. Le message d'erreur exact (console navigateur)
3. La méthode de déploiement utilisée
4. Capture d'écran de l'erreur

---

**Date** : 2025-10-27
**Version** : Avec polyfill Promise.withResolvers
**Statut build** : ✅ OK
