import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Newspaper, ArrowLeft, CheckCircle, Loader, Phone, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Formule } from '../lib/supabase';
import { OTPInput } from './OTPInput';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { validatePhoneNumber, normalizePhoneNumber, detectCountryCode } from '../lib/otp';
import { initiatePayment, PaymentType } from '../lib/ipay';
import {
  handleSignupFlow,
  verifyOTP,
  cleanupUnverifiedUser,
  cleanupUnverifiedUserByPhone,
} from '../lib/subscriptionFlow';

export function SubscriptionForm() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const formuleId = searchParams.get('formule');

  const [formule, setFormule] = useState<Formule | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [registrationStep, setRegistrationStep] = useState<'form' | 'otp' | 'payment_method'>('form');
  const [formData, setFormData] = useState({
    nom: '',
    numero_whatsapp: '',
    country_code: 'BJ',
  });
  const [abonnementId, setAbonnementId] = useState<string | null>(null);
  const [tempUserId, setTempUserId] = useState<string | null>(null);

  // Charger la formule à partir de l'ID
  useEffect(() => {
    if (formuleId) {
      loadFormule(formuleId);
    } else {
      setLoading(false);
    }
  }, [formuleId]);

  const loadFormule = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('formules')
        .select('*')
        .eq('id', id)
        .eq('actif', true)
        .maybeSingle();

      if (error) throw error;
      setFormule(data || null);
    } catch (err) {
      console.error('❌ Erreur chargement formule:', err);
      setError('Erreur lors du chargement de la formule');
    } finally {
      setLoading(false);
    }
  };

  // Validation du formulaire
  const validateForm = () => {
    if (!formData.nom || formData.nom.length < 2) {
      setError('Veuillez entrer un nom valide (minimum 2 caractères)');
      return false;
    }
    if (!validatePhoneNumber(formData.numero_whatsapp)) {
      setError('Veuillez entrer un numéro WhatsApp valide (format international)');
      return false;
    }
    return true;
  };

  // Étape 1 — Envoi du formulaire
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;
    if (!formule) {
      setError('Veuillez sélectionner une formule');
      return;
    }

    setSubmitting(true);
    try {
      const formattedPhone = normalizePhoneNumber(formData.numero_whatsapp);
      const autoCountry = detectCountryCode(formattedPhone);
      setFormData({ ...formData, numero_whatsapp: formattedPhone, country_code: autoCountry });

      console.log('📱 Numéro normalisé:', formattedPhone);

      // Nettoyer tout ancien utilisateur non vérifié
      await cleanupUnverifiedUserByPhone(formattedPhone);

      // Créer un compte temporaire
      const tempEmail = `temp-${Date.now()}@pending.whatsapp`;
      const result = await handleSignupFlow({
        nom: formData.nom,
        numero_whatsapp: formattedPhone,
        email: tempEmail,
        formule_id: formule.id,
      });

      if (!result.success) {
        setError(result.message || 'Erreur lors de l’inscription');
        setSubmitting(false);
        return;
      }

      // Récupérer l'utilisateur fraîchement créé
      const { data: newUser } = await supabase
        .from('users')
        .select('id')
        .eq('numero_whatsapp', formattedPhone)
        .maybeSingle();

      if (newUser) setTempUserId(newUser.id);
      setRegistrationStep('otp');
    } catch (err: any) {
      console.error('❌ Erreur inscription:', err);
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  // Nettoyage après échec ou annulation
  const handleCleanup = async () => {
    if (tempUserId) await cleanupUnverifiedUser(tempUserId);
  };

  const handleCancelOTP = async () => {
    setSubmitting(true);
    await handleCleanup();
    setRegistrationStep('form');
    setTempUserId(null);
    setError('Inscription annulée. Vous pouvez réutiliser ce numéro immédiatement.');
    setSubmitting(false);
  };

  // Étape 2 — Vérification OTP
  const handleOTPComplete = async (otpCode: string) => {
    setError('');
    setSubmitting(true);
    const formattedPhone = normalizePhoneNumber(formData.numero_whatsapp);

    try {
      const verifyResult = await verifyOTP(formattedPhone, otpCode);
      console.log('📲 verifyOTP result:', verifyResult);

      if (!verifyResult.success) {
        setError(verifyResult.message || 'Code OTP incorrect');
        setSubmitting(false);

        if (verifyResult.error && ['expired', 'max_attempts'].includes(verifyResult.error)) {
          await handleCleanup();
          setTimeout(() => {
            setRegistrationStep('form');
            setTempUserId(null);
            setError('Code OTP expiré. Veuillez recommencer l’inscription.');
          }, 1500);
        }
        return;
      }

      if (!tempUserId) throw new Error('ID utilisateur manquant');

      // Validation du compte
      await supabase
        .from('users')
        .update({
          whatsapp_verifie: true,
          statut_abonnement: formule!.essai_gratuit ? 'essai' : 'inactif',
        })
        .eq('id', tempUserId);

      const dateDebut = new Date();
      const dateFin = new Date();
      dateFin.setDate(dateFin.getDate() + formule!.duree_jours);

      if (formule!.essai_gratuit) {
        await supabase.from('abonnements').insert({
          user_id: tempUserId,
          formule_id: formule!.id,
          date_debut: dateDebut.toISOString(),
          date_fin: dateFin.toISOString(),
          statut: 'actif',
          renouvellement_auto: false,
        });

        await supabase
          .from('users')
          .update({
            statut_abonnement: 'actif',
            date_fin_abonnement: dateFin.toISOString(),
          })
          .eq('id', tempUserId);

        setSuccess(true);
        setTimeout(() => navigate('/login'), 2500);
      } else {
        // Create pending subscription without fixed dates (calculated on payment confirmation)
        const { data: abonnementData, error: abonnementError } = await supabase
          .from('abonnements')
          .insert({
            user_id: tempUserId,
            formule_id: formule!.id,
            date_debut: dateDebut.toISOString(),
            date_fin: dateFin.toISOString(),
            statut: 'en_attente',
            duration_days: formule!.duree_jours,
            renouvellement_auto: false,
          })
          .select()
          .single();

        if (abonnementError) throw abonnementError;
        setAbonnementId(abonnementData.id);
        setRegistrationStep('payment_method');
      }
    } catch (err: any) {
      console.error('❌ Erreur OTP:', err);
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentMethodSelect = async (paymentType: PaymentType, msisdn?: string) => {
    setError('');
    setSubmitting(true);

    try {
      if (!tempUserId || !abonnementId || !formule) {
        throw new Error('Données manquantes pour le paiement');
      }

      const paymentResult = await initiatePayment(
        formData.nom,
        formule.prix_fcfa,
        paymentType,
        tempUserId,
        abonnementId,
        msisdn,
        formule.id
      );

      if (!paymentResult.success) {
        setError(paymentResult.message || 'Erreur lors du paiement');
        setSubmitting(false);
        return;
      }

      if (paymentResult.payment_url) {
        window.location.href = paymentResult.payment_url;
      } else {
        setSuccess(true);
        setTimeout(() => navigate('/payment-status'), 2000);
      }
    } catch (err: any) {
      console.error('Erreur paiement:', err);
      setError(err.message || 'Une erreur est survenue lors du paiement');
      setSubmitting(false);
    }
  };

  const handlePayWithExternalLink = async () => {
    setError('');
    setSubmitting(true);

    try {
      if (!tempUserId || !abonnementId || !formule) {
        throw new Error('Données manquantes pour le paiement');
      }

      if (!formule.external_payment_url) {
        setError('Lien de paiement non disponible pour cette formule');
        setSubmitting(false);
        return;
      }

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);

      const { data: paiementData } = await supabase
        .from('paiements')
        .insert({
          user_id: tempUserId,
          abonnement_id: abonnementId,
          formule_id: formule.id,
          montant_fcfa: formule.prix_fcfa,
          methode_paiement: 'iPayMoney-external',
          currency: 'XOF',
          country_code: formData.country_code,
          expires_at: expiresAt.toISOString(),
          statut: 'en_attente',
          notes: `External payment initiated - ${new Date().toISOString()}`,
        })
        .select()
        .single();

      const paymentUrl = new URL(formule.external_payment_url);
      paymentUrl.searchParams.set('user_id', tempUserId);
      paymentUrl.searchParams.set('abonnement_id', abonnementId);
      if (paiementData) {
        paymentUrl.searchParams.set('paiement_id', paiementData.id);
      }
      paymentUrl.searchParams.set('external_reference', `ABN-${abonnementId}`);

      window.location.href = paymentUrl.toString();
    } catch (err: any) {
      console.error('Erreur paiement externe:', err);
      setError(err.message || 'Une erreur est survenue');
      setSubmitting(false);
    }
  };

  // UI
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <Loader className="animate-spin text-amber-500 w-10 h-10" />
      </div>
    );

  if (success)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4">
        <div className="bg-gray-800 border border-green-700 rounded-lg p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">Inscription réussie !</h2>
          <p className="text-gray-300">
            {formule?.essai_gratuit
              ? 'Votre période d’essai gratuite a commencé. Vous pouvez maintenant vous connecter.'
              : 'Paiement en attente de confirmation. Vous serez notifié par WhatsApp.'}
          </p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Newspaper className="w-8 h-8 text-amber-500" />
            <div>
              <h1 className="text-2xl font-bold text-white">L’Enquêteur</h1>
              <p className="text-xs text-gray-400">Inscription</p>
            </div>
          </div>
          <Link to="/" className="flex items-center gap-2 text-gray-300 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Retour</span>
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-12">
        {formule && (
          <div className="bg-gray-800 border border-amber-500/30 rounded-lg p-6 mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white">{formule.nom}</h3>
                <p className="text-gray-400 text-sm">{formule.description}</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-amber-500">
                  {formule.prix_fcfa === 0 ? 'Gratuit' : `${formule.prix_fcfa.toLocaleString()} FCFA`}
                </div>
                <p className="text-gray-400 text-sm">{formule.duree_jours} jours</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Créer mon compte</h2>

          {registrationStep === 'form' && (
            <form onSubmit={handleFormSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <User className="inline w-4 h-4 mr-2" /> Nom complet
                </label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-amber-500"
                  placeholder="Jean Dupont"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <Phone className="inline w-4 h-4 mr-2" /> Numéro WhatsApp
                </label>
                <input
                  type="tel"
                  value={formData.numero_whatsapp}
                  onChange={(e) => setFormData({ ...formData, numero_whatsapp: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-amber-500"
                  placeholder="+227 98 76 54 32"
                  required
                />
                <p className="text-gray-500 text-xs mt-1">
                  Format international requis (ex : +227 pour le Niger)
                </p>
              </div>

              {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold py-4 rounded-lg hover:from-amber-600 hover:to-yellow-700 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" /> Envoi du code...
                  </>
                ) : (
                  'Continuer'
                )}
              </button>
            </form>
          )}

          {registrationStep === 'payment_method' && (
            <div className="space-y-6">
              <PaymentMethodSelector
                onSelect={handlePaymentMethodSelect}
                loading={submitting}
              />

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-gray-800 text-gray-400">ou</span>
                </div>
              </div>

              <button
                onClick={handlePayWithExternalLink}
                disabled={submitting || !formule?.external_payment_url}
                className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Redirection...
                  </>
                ) : (
                  'Payer via iPay'
                )}
              </button>
              <p className="text-xs text-gray-500 text-center">
                Vous serez redirigé vers le portail de paiement sécurisé iPay
              </p>
            </div>
          )}

          {registrationStep === 'otp' && (
            <div className="space-y-6 text-center">
              <p className="text-gray-300">Code envoyé à</p>
              <p className="text-white font-semibold">{formData.numero_whatsapp}</p>
              <button
                onClick={handleCancelOTP}
                className="text-amber-500 hover:text-amber-400 text-sm mt-2"
                disabled={submitting}
              >
                Annuler et modifier le numéro
              </button>

              <label className="block text-sm text-gray-300 mt-4">
                Entrez le code de vérification
              </label>
              <OTPInput
                length={6}
                onComplete={handleOTPComplete}
                loading={submitting}
                error={error}
                expiryMinutes={10}
                onExpiry={async () => {
                  if (tempUserId) await cleanupUnverifiedUser(tempUserId);
                  setRegistrationStep('form');
                  setError('Code OTP expiré. Veuillez recommencer.');
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
