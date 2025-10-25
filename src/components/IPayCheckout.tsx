import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader, X, CheckCircle } from 'lucide-react';

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
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentSuccessful, setPaymentSuccessful] = useState(false);

  useEffect(() => {
    initializePayment();
  }, []);

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
              console.log('📢 Payment status update from database:', status);

              if (status === 'confirme') {
                console.log('✅ Payment confirmed via database update');
                setProcessingPayment(false);
                setPaymentSuccessful(true);
                setShowModal(false);

                setTimeout(() => {
                  onSuccess?.(paymentId);
                }, 1500);
              } else if (status === 'echoue') {
                console.log('❌ Payment failed via database update');
                setProcessingPayment(false);
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

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      console.log('📨 Message received from iPay:', event.data);

      if (event.data.type === 'closeModal') {
        console.log('🔒 User closed modal');
        setShowModal(false);
        setProcessingPayment(false);
      }

      if (event.data.type === 'payment.response') {
        const paymentData = event.data.other;
        console.log('✅ Payment response from iPay:', paymentData);

        if (paymentData.status === 'succeeded' || paymentData.status === 'paid' || paymentData.status === 'completed') {
          console.log('💰 Payment succeeded in iPay popup');
          setProcessingPayment(true);

          const iPayReference = paymentData.reference || paymentData.transaction_id || transactionId;

          await confirmPayment(iPayReference, paymentData.status);

        } else if (paymentData.status === 'failed' || paymentData.status === 'cancelled') {
          console.log('❌ Payment failed in iPay popup:', paymentData.status);
          setShowModal(false);
          setProcessingPayment(false);
          onError?.('Le paiement a échoué');
        } else if (paymentData.status === 'pending') {
          console.log('⏳ Payment pending, waiting for confirmation...');
          setProcessingPayment(true);

          startPaymentPolling();
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [paymentId, transactionId]);

  const confirmPayment = async (iPayReference: string, iPayStatus: string) => {
    if (!paymentId) {
      console.error('❌ No payment ID available');
      return;
    }

    try {
      console.log('🔄 Calling confirm_payment_secure function...');

      const { data, error } = await supabase.rpc('confirm_payment_secure', {
        p_payment_id: paymentId,
        p_ipay_transaction_id: iPayReference,
        p_ipay_status: iPayStatus,
        p_notes: `Auto-confirmation from popup - ${new Date().toISOString()}`,
      });

      if (error) {
        console.error('❌ Error confirming payment:', error);
        throw error;
      }

      console.log('✅ Payment confirmed successfully:', data);

      if (data && data.success) {
        setProcessingPayment(false);
        setPaymentSuccessful(true);
        setShowModal(false);

        setTimeout(() => {
          onSuccess?.(paymentId);
        }, 1500);
      } else {
        throw new Error(data?.error || 'Payment confirmation failed');
      }
    } catch (error) {
      console.error('❌ Error in confirmPayment:', error);

      console.log('⏳ Falling back to webhook confirmation...');
      startPaymentPolling();
    }
  };

  const startPaymentPolling = () => {
    if (!paymentId) return;

    console.log('🔍 Starting payment status polling...');
    let pollCount = 0;
    const maxPolls = 30;

    const pollInterval = setInterval(async () => {
      pollCount++;
      console.log(`🔍 Polling attempt ${pollCount}/${maxPolls}`);

      const { data: payment, error } = await supabase
        .from('paiements')
        .select('statut')
        .eq('id', paymentId)
        .maybeSingle();

      if (error) {
        console.error('❌ Error polling payment:', error);
        return;
      }

      if (payment) {
        console.log(`📊 Current payment status: ${payment.statut}`);

        if (payment.statut === 'confirme') {
          clearInterval(pollInterval);
          console.log('✅ Payment confirmed via polling');
          setProcessingPayment(false);
          setPaymentSuccessful(true);
          setShowModal(false);

          setTimeout(() => {
            onSuccess?.(paymentId);
          }, 1500);
        } else if (payment.statut === 'echoue') {
          clearInterval(pollInterval);
          console.log('❌ Payment failed via polling');
          setProcessingPayment(false);
          setShowModal(false);
          onError?.('Le paiement a échoué');
        }
      }

      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        console.log('⏱️ Polling timeout');
        setProcessingPayment(false);
        onError?.('La vérification du paiement a pris trop de temps. Veuillez vérifier votre statut d\'abonnement.');
      }
    }, 2000);
  };

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

  const openPaymentModal = async () => {
    if (!paymentId || !transactionId) return;

    setInitiatingPayment(true);

    try {
      console.log('💳 Creating iPay payment token...');

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
        throw new Error(`iPay API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ iPay token created:', data.token);

      const paymentUrl = `https://i-pay.money/api/sdk/payment_pages?token=${data.token}`;
      setIframeUrl(paymentUrl);
      setShowModal(true);
      setIframeLoading(true);

      console.log('🚀 Payment modal opened');
    } catch (error) {
      console.error('❌ Error opening payment modal:', error);
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

  if (paymentSuccessful) {
    return (
      <div className="bg-green-900/50 border border-green-700 text-green-200 px-6 py-8 rounded-lg text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-2xl font-bold mb-2">Paiement réussi !</h3>
        <p className="text-gray-300">
          Votre abonnement a été activé avec succès.
        </p>
        <p className="text-gray-400 text-sm mt-2">
          Redirection en cours...
        </p>
      </div>
    );
  }

  if (processingPayment) {
    return (
      <div className="bg-blue-900/50 border border-blue-700 text-blue-200 px-6 py-8 rounded-lg text-center">
        <Loader className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
        <h3 className="text-xl font-bold mb-2">Vérification du paiement...</h3>
        <p className="text-gray-300">
          Veuillez patienter pendant que nous confirmons votre paiement.
        </p>
        <p className="text-gray-400 text-sm mt-2">
          Ne fermez pas cette page
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          <li>Votre abonnement sera activé automatiquement après le paiement</li>
        </ul>
      </div>

      <div className="text-center">
        <p className="text-gray-400 text-xs">
          Référence de transaction: <span className="font-mono text-gray-300">{transactionId}</span>
        </p>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="relative w-full h-full max-w-4xl max-h-screen p-4">
            <button
              onClick={() => {
                setShowModal(false);
                setProcessingPayment(false);
              }}
              className="absolute top-8 right-8 z-50 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100"
            >
              <X className="w-6 h-6 text-gray-800" />
            </button>

            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white rounded-full p-4">
                  <Loader className="w-12 h-12 animate-spin text-amber-500" />
                </div>
              </div>
            )}

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
