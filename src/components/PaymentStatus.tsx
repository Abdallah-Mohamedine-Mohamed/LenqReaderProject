import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader, AlertCircle, ArrowLeft } from 'lucide-react';
import { checkPaymentStatus, subscribeToPaymentUpdates, getPaymentStatusColor, getPaymentStatusText } from '../lib/ipay';
import { supabase } from '../lib/supabase';

export function PaymentStatus() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reference = searchParams.get('reference');
  const paiementId = searchParams.get('paiement_id');

  const [status, setStatus] = useState<string>('pending');
  const [error, setError] = useState('');
  const [checkCount, setCheckCount] = useState(0);
  const [paiementData, setPaiementData] = useState<any>(null);

  useEffect(() => {
    if (!reference || !paiementId) {
      setError('Référence de paiement manquante');
      return;
    }

    loadPaymentData();
    const unsubscribe = setupRealtimeUpdates();

    const interval = setInterval(() => {
      checkStatus();
    }, 10000);

    return () => {
      clearInterval(interval);
      unsubscribe.then(unsub => unsub());
    };
  }, [reference, paiementId]);

  const loadPaymentData = async () => {
    try {
      const { data, error } = await supabase
        .from('paiements')
        .select('*, users(nom, numero_whatsapp)')
        .eq('id', paiementId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setPaiementData(data);
        setStatus(data.ipay_status || data.statut);
      }
    } catch (err) {
      console.error('Error loading payment data:', err);
    }
  };

  const setupRealtimeUpdates = async () => {
    return await subscribeToPaymentUpdates(paiementId!, (newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'confirme' || newStatus === 'succeeded') {
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      }
    });
  };

  const checkStatus = async () => {
    if (status === 'confirme' || status === 'succeeded' || status === 'failed' || status === 'echoue') {
      return;
    }

    setCheckCount(prev => prev + 1);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-payment-status`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reference }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const newStatus = result.data.status;
          setStatus(newStatus);

          await loadPaymentData();

          if (newStatus === 'succeeded' || newStatus === 'paid') {
            setTimeout(() => {
              navigate('/login');
            }, 3000);
          }
        }
      }
    } catch (err) {
      console.error('Error checking payment status:', err);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'succeeded':
      case 'confirme':
        return <CheckCircle className="w-16 h-16 text-green-500" />;
      case 'failed':
      case 'echoue':
      case 'declined':
        return <XCircle className="w-16 h-16 text-red-500" />;
      case 'insufficient_fund':
        return <AlertCircle className="w-16 h-16 text-amber-500" />;
      default:
        return <Loader className="w-16 h-16 animate-spin text-amber-500" />;
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'succeeded':
      case 'confirme':
        return 'Paiement confirmé avec succès ! Vous allez être redirigé vers la page de connexion.';
      case 'failed':
      case 'echoue':
        return 'Le paiement a échoué. Veuillez réessayer ou contacter le support.';
      case 'declined':
        return 'Le paiement a été refusé. Veuillez vérifier votre solde et réessayer.';
      case 'insufficient_fund':
        return 'Solde insuffisant. Veuillez recharger votre compte mobile money et réessayer.';
      case 'pending':
      case 'en_attente':
        return 'Paiement en attente de confirmation. Veuillez composer *144# sur votre téléphone pour valider la transaction.';
      default:
        return 'Vérification du statut du paiement en cours...';
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 border border-red-700 rounded-lg p-8">
          <div className="text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Erreur</h2>
            <p className="text-gray-300 mb-6">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="text-amber-500 hover:text-amber-400"
            >
              ← Retour à l'accueil
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              {getStatusIcon()}
            </div>

            <h2 className={`text-2xl font-bold mb-2 ${getPaymentStatusColor(status)}`}>
              {getPaymentStatusText(status)}
            </h2>

            <p className="text-gray-300 mb-6">
              {getStatusMessage()}
            </p>

            {paiementData && (
              <div className="bg-gray-700 rounded-lg p-4 mb-6 text-left">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Montant:</span>
                    <span className="text-white font-semibold">
                      {paiementData.montant_fcfa.toLocaleString()} FCFA
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Nom:</span>
                    <span className="text-white">{paiementData.users?.nom}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Numéro:</span>
                    <span className="text-white font-mono">{paiementData.msisdn}</span>
                  </div>
                  {reference && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Référence:</span>
                      <span className="text-white font-mono text-xs">{reference}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(status === 'pending' || status === 'en_attente') && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-left mb-6">
                <p className="text-amber-300 text-sm mb-2">
                  <strong>Instructions:</strong>
                </p>
                <ol className="text-gray-300 text-sm space-y-1 list-decimal list-inside">
                  <li>Composez *144# sur votre téléphone</li>
                  <li>Suivez les instructions pour valider le paiement</li>
                  <li>Cette page se mettra à jour automatiquement</li>
                </ol>
                <p className="text-gray-400 text-xs mt-3">
                  Vérification automatique {checkCount > 0 && `(${checkCount} vérifications)`}
                </p>
              </div>
            )}

            {(status === 'failed' || status === 'echoue' || status === 'declined' || status === 'insufficient_fund') && (
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/subscribe')}
                  className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-semibold py-3 rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all"
                >
                  Réessayer
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full text-gray-400 hover:text-white transition-colors"
                >
                  Retour à l'accueil
                </button>
              </div>
            )}

            {(status === 'succeeded' || status === 'confirme') && (
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-semibold py-3 rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all"
              >
                Se connecter
              </button>
            )}
          </div>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-2 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}
