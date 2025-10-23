# Processus d'Abonnement avec iPay Money (Portail Web)

## Vue d'Ensemble

Le système utilise le **portail web iPay Money** pour les paiements. L'utilisateur est redirigé vers le site iPay Money pour effectuer son paiement, puis revient automatiquement sur l'application.

## Étapes du Processus d'Abonnement

### 1. Sélection de la Formule (Page d'Accueil)
- L'utilisateur visite la page d'accueil
- Il voit 3 formules disponibles:
  - **Mensuel**: 6 000 FCFA / 30 jours
  - **Trimestriel**: 15 000 FCFA / 90 jours (économie de 25%)
  - **Annuel**: 55 000 FCFA / 365 jours (économie de 31%)
- Il clique sur "Choisir cette formule"

### 2. Formulaire d'Inscription
**Route**: `/subscribe?formule={formule_id}`

L'utilisateur remplit:
- Nom complet
- Numéro WhatsApp (format international: +225...)

**Action**: Clic sur "Continuer"

**Traitement backend**:
- Vérification que le numéro WhatsApp n'existe pas déjà
- Création d'un compte temporaire dans Supabase Auth
- Création d'un utilisateur dans la table `users`
- Envoi d'un code OTP à 6 chiffres via WhatsApp

### 3. Vérification OTP
**Affichage**: Écran avec 6 cases pour entrer le code OTP

L'utilisateur:
- Reçoit le code OTP sur WhatsApp
- Entre les 6 chiffres
- Le code est validé automatiquement

**Traitement backend**:
- Validation du code OTP via `verify_otp()`
- Si valide: mise à jour `whatsapp_verifie = true`
- Création d'un abonnement avec `statut = 'en_attente'`

### 4. Redirection vers iPay Money
**C'EST ICI QUE LE PAIEMENT SE FAIT**

Après validation OTP:
1. Appel à la fonction `initiatePayment()` avec:
   - Nom du client
   - Montant (6000, 15000 ou 55000 FCFA)
   - Numéro de téléphone
   - Code pays
   - user_id et abonnement_id
   - **return_url**: `https://votreapp.com/payment-status`
   - **cancel_url**: `https://votreapp.com/subscribe?formule={id}`

2. L'edge function `initiate-payment` contacte l'API iPay Money:
   ```
   POST https://i-pay.money/api/v1/payments
   Headers:
     - Ipay-Payment-Type: web (IMPORTANT: pas "mobile")
     - Ipay-Target-Environment: live
     - Authorization: Bearer {secret_key}
   Body:
     {
       "customer_name": "Jean Dupont",
       "currency": "XOF",
       "country": "BJ",
       "amount": "6000",
       "transaction_id": "TXN-1729166400-ABC123",
       "msisdn": "+22997123456",
       "return_url": "https://votreapp.com/payment-status",
       "cancel_url": "https://votreapp.com/subscribe?formule=xxx"
     }
   ```

3. iPay Money répond avec:
   ```json
   {
     "status": "pending",
     "reference": "IPAY-REF-123456",
     "payment_url": "https://i-pay.money/payment/IPAY-REF-123456"
   }
   ```

4. **REDIRECTION AUTOMATIQUE**:
   ```javascript
   window.location.href = paymentResult.payment_url;
   ```

### 5. Paiement sur le Portail iPay Money
**URL**: `https://i-pay.money/payment/{reference}`

L'utilisateur:
- Se retrouve sur le portail web iPay Money
- Voit le montant à payer (ex: 6 000 FCFA)
- Choisit son opérateur (MTN, Moov, etc.)
- Entre son numéro de téléphone si nécessaire
- Valide le paiement
- Reçoit une notification de paiement sur son téléphone
- Confirme le paiement

**iPay Money gère tout**:
- Interface de paiement
- Sélection de l'opérateur
- Confirmation USSD (si nécessaire)
- Validation du paiement

### 6. Retour vers l'Application
Après le paiement (réussi ou annulé), iPay Money redirige vers:

**Si succès**: `https://votreapp.com/payment-status?reference={ref}&status=succeeded`

**Si annulation**: `https://votreapp.com/subscribe?formule={id}`

### 7. Page de Statut de Paiement
**Route**: `/payment-status?reference={ref}&paiement_id={id}`

L'application:
- Vérifie le statut du paiement via l'edge function `check-payment-status`
- Affiche un message en fonction du statut:
  - ✅ **succeeded**: "Paiement confirmé ! Votre abonnement est activé"
  - ⏳ **pending**: "Paiement en cours de traitement..."
  - ❌ **failed**: "Paiement échoué. Veuillez réessayer"

Si le paiement est confirmé:
- Mise à jour de l'abonnement: `statut = 'actif'`
- Mise à jour de l'utilisateur: `statut_abonnement = 'actif'`
- Envoi d'une notification WhatsApp de confirmation
- L'utilisateur peut maintenant se connecter et lire les éditions

## Différences avec l'Ancien Système (USSD)

### ❌ Ancien Système (USSD - Mobile)
```
Ipay-Payment-Type: mobile
→ Utilisateur doit composer *144# manuellement
→ Pas de portail web
→ Moins intuitif
```

### ✅ Nouveau Système (Portail Web)
```
Ipay-Payment-Type: web
→ Redirection automatique vers portail iPay Money
→ Interface web complète et intuitive
→ Choix de l'opérateur dans l'interface
→ Retour automatique après paiement
```

## Points Techniques Importants

### Edge Function `initiate-payment`
```typescript
headers: {
  "Ipay-Payment-Type": "web",  // ← CRUCIAL: "web" pas "mobile"
  "Ipay-Target-Environment": "live",
  "Authorization": `Bearer ${IPAY_SECRET_KEY}`
}
```

### Redirection Frontend
```typescript
if (paymentResult.payment_url) {
  window.location.href = paymentResult.payment_url;  // ← Redirection complète
}
```

### URLs de Retour
- **return_url**: Où iPay redirige après succès
- **cancel_url**: Où iPay redirige si annulation

## Suivi et Monitoring

Chaque paiement est enregistré dans:
1. **Table `paiements`**: Détails du paiement, statut, montant
2. **Table `payment_api_logs`**: Logs des appels API vers iPay Money
3. **Table `payment_polling_jobs`**: Jobs de vérification périodique du statut

## Notification WhatsApp

L'utilisateur reçoit des notifications à:
1. ✉️ Réception du code OTP
2. ✅ Confirmation du paiement
3. 📰 Livraison des nouvelles éditions

## Résumé du Flux

```
[Page d'accueil]
    ↓ Choix formule
[Formulaire inscription]
    ↓ Envoi infos
[OTP WhatsApp]
    ↓ Code valide
[Appel API initiate-payment]
    ↓ Récupération payment_url
[REDIRECTION → iPay Money Portal]
    ↓ Paiement effectué
[Retour → Payment Status]
    ↓ Vérification
[Abonnement activé ✅]
```

## Configuration Actuelle

- **Environnement**: Production (live)
- **Type de paiement**: Web (portail iPay Money)
- **Devise**: XOF (Franc CFA)
- **Pays supportés**: BJ (Bénin), CI (Côte d'Ivoire), etc.
- **Clés API**: Configurées dans `.env`
