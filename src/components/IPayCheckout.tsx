import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Loader } from 'lucide-react';

const IPAY_PUBLIC_KEY = 'pk_0ac56b86849d4fdca1e44df11a7328e0';

declare global {
  interface Window {
    iPayCheckoutInit?: () => void;
  }
}

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
  const [sdkReady, setSdkReady] = useState(false);
  const buttonContainerRef = useRef<HTMLDivElement>(null);

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
              console.log('📢 Payment status update:', status);
              if (status === 'confirme') {
                onSuccess?.(paymentId);
              } else if (status === 'echoue') {
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
    if (paymentId && transactionId && buttonContainerRef.current) {
      const checkSDK = setInterval(() => {
        if (typeof window !== 'undefined' && (window as any).iPayCheckoutInit) {
          console.log('✅ iPay SDK detected, initializing...');
          clearInterval(checkSDK);
          setSdkReady(true);

          try {
            (window as any).iPayCheckoutInit();
            console.log('✅ iPay SDK initialized');
          } catch (error) {
            console.error('❌ Error initializing iPay SDK:', error);
          }
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkSDK);
        if (!sdkReady) {
          console.warn('⚠️ iPay SDK not detected after 5 seconds');
        }
      }, 5000);

      return () => clearInterval(checkSDK);
    }
  }, [paymentId, transactionId]);

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

  const redirectUrl = `${window.location.origin}/payment-status?payment_id=${paymentId}&reference=${transactionId}`;
  const callbackUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ipay-webhook`;

  return (
    <div className="space-y-4">
      <div ref={buttonContainerRef}>
        <button
          type="button"
          className="ipaymoney-button w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold py-4 px-6 rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all transform hover:scale-105 shadow-lg"
          data-amount={amount.toString()}
          data-environement="live"
          data-key={IPAY_PUBLIC_KEY}
          data-transaction-id={transactionId}
          data-redirect-url={redirectUrl}
          data-callback-url={callbackUrl}
        >
          Payer {amount.toLocaleString()} FCFA
        </button>
      </div>

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
          <li>Vous serez redirigé automatiquement après le paiement</li>
        </ul>
      </div>

      <div className="text-center">
        <p className="text-gray-400 text-xs">
          Référence de transaction: <span className="font-mono text-gray-300">{transactionId}</span>
        </p>
        {!sdkReady && (
          <p className="text-yellow-500 text-xs mt-2">
            Chargement du système de paiement...
          </p>
        )}
      </div>
    </div>
  );
}
