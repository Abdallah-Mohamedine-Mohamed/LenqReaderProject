import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader, X } from 'lucide-react';

const IPAY_PUBLIC_KEY = 'pk_0ac56b86849d4fdca1e44df11a7328e0';

interface IPayCheckoutProps {
  amount: number;
  userId: string;
  abonnementId: string;
  formuleId: string;
  onSuccess?: (paymentId: string) => void;
  onError?: (error: string) => void;
}

export function IPayCheckout({
  amount,
  userId,
  abonnementId,
  formuleId,
  onSuccess,
  onError,
}: IPayCheckoutProps) {
  const [loading, setLoading] = useState(true);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string>('');
  const [iframeLoading, setIframeLoading] = useState(true);
  const [initiatingPayment, setInitiatingPayment] = useState(false);

  useEffect(() => {
    initializePayment();
  }, []);

  // Écouter les mises à jour du statut de paiement
  useEffect(() => {
    if (paymentId && transactionId) {
      const subscription = supabase
        .channel(`payment:${paymentId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'paiements',
            filter: `id=eq.${paymentId}`,
          },
          (payload) => {
            if (payload.new && 'statut' in payload.new) {
              const status = payload.new.statut as string;
              console.log('📢 Payment status update:', status);
              if (status === 'confirme') {
                setShowModal(false);
                onSuccess?.(paymentId);
              } else if (status === 'echoue') {
                setShowModal(false);
                onError?.('Le paiement a échoué');
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }
  }, [paymentId, transactionId]);

  // Écouter les messages de l'iframe iPay
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('📨 Message reçu de iPay:', event.data);

      if (event.data.type === 'closeModal') {
        setShowModal(false);
      }

      if (event.data.type === 'payment.response') {
        const paymentData = event.data.other;
        console.log('✅ Réponse de paiement:', paymentData);

        if (paymentData.status === 'succeeded') {
          setShowModal(false);
          // Le webhook mettra à jour le statut, mais on peut aussi gérer ici
        } else if (paymentData.status === 'failed') {
          setShowModal(false);
          onError?.('Le paiement a échoué');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [paymentId]);

  const generateTransactionId = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${timestamp}-${random}`;
  };

  const initializePayment = async () => {
    try {
      const txnId = generateTransactionId();
      setTransactionId(txnId);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`;

      console.log('💳 Creating payment with:', {
        user_id: userId,
        abonnement_id: abonnementId,
        formule_id: formuleId,
        amount: amount,
        transaction_id: txnId,
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          abonnement_id: abonnementId,
          formule_id: formuleId,
          amount: amount,
          transaction_id: txnId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('❌ Payment creation error:', result);
        throw new Error(result.message || 'Impossible de créer le paiement');
      }

      setPaymentId(result.payment_id);

      console.log('✅ Payment initialized:', {
        paymentId: result.payment_id,
        transactionId: txnId,
        amount,
      });
    } catch (error) {
      console.error('❌ Error initializing payment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'initialisation du paiement';
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour ouvrir la modale de paiement iPay
  const openPaymentModal = async () => {
    if (!paymentId || !transactionId) return;

    setInitiatingPayment(true);

    try {
      console.log('💳 Création du token de paiement iPay...');

      // Appel direct à l'API iPay pour créer le token
      const response = await fetch('https://i-pay.money/api/sdk/payment_pages/create_payment_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: IPAY_PUBLIC_KEY,
          amount: amount.toString(),
          environement: 'live',
          transaction_id: transactionId,
          parent_domaine: window.location.origin,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erreur API iPay: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Token iPay créé:', data.token);

      // Construire l'URL de la page de paiement
      const paymentUrl = `https://i-pay.money/api/sdk/payment_pages?token=${data.token}`;
      setIframeUrl(paymentUrl);
      setShowModal(true);
      setIframeLoading(true);

      console.log('🚀 Modale de paiement ouverte');
    } catch (error) {
      console.error('❌ Erreur lors de l\'ouverture du paiement:', error);
      onError?.(error instanceof Error ? error.message : 'Erreur lors de l\'ouverture du paiement');
    } finally {
      setInitiatingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-8 h-8 animate-spin text-amber-500" />
        <span className="ml-3 text-gray-300">Préparation du paiement...</span>
      </div>
    );
  }

  if (!paymentId || !transactionId) {
    return (
      <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
        Erreur lors de l'initialisation du paiement. Veuillez réessayer.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bouton de paiement */}
      <button
        type="button"
        onClick={openPaymentModal}
        disabled={initiatingPayment}
        className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold py-4 px-6 rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
      >
        {initiatingPayment ? (
          <span className="flex items-center justify-center">
            <Loader className="w-5 h-5 animate-spin mr-2" />
            Chargement...
          </span>
        ) : (
          `Payer ${amount.toLocaleString()} FCFA`
        )}
      </button>

      {/* Instructions */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <p className="text-amber-300 text-sm mb-2">
          <strong>Important :</strong>
        </p>
        <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
          <li>Cliquez sur le bouton orange ci-dessus pour effectuer le paiement</li>
          <li>Une fenêtre de paiement sécurisée iPay s'ouvrira</li>
          <li>Choisissez votre mode de paiement (Mobile Money, Carte bancaire, etc.)</li>
          <li>Suivez les instructions pour compléter le paiement</li>
          <li>Ne fermez pas cette page pendant le paiement</li>
          <li>Vous serez notifié automatiquement après le paiement</li>
        </ul>
      </div>

      {/* Référence de transaction */}
      <div className="text-center">
        <p className="text-gray-400 text-xs">
          Référence de transaction: <span className="font-mono text-gray-300">{transactionId}</span>
        </p>
      </div>

      {/* Modale iPay */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="relative w-full h-full max-w-4xl max-h-screen p-4">
            {/* Bouton de fermeture */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-8 right-8 z-50 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100"
            >
              <X className="w-6 h-6 text-gray-800" />
            </button>

            {/* Loader */}
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white rounded-full p-4">
                  <Loader className="w-12 h-12 animate-spin text-amber-500" />
                </div>
              </div>
            )}

            {/* Iframe iPay */}
            <iframe
              src={iframeUrl}
              className="w-full h-full rounded-lg bg-white"
              onLoad={() => setIframeLoading(false)}
              title="Paiement iPay"
            />
          </div>
        </div>
      )}
    </div>
  );
}