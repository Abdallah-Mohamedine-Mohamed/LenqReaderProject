import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader } from 'lucide-react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string>('');

  useEffect(() => {
    initializePayment();
  }, []);

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
        console.error('Payment creation error:', result);
        throw new Error(result.message || 'Impossible de créer le paiement');
      }

      setPaymentId(result.payment_id);
      renderIPayButton(txnId, result.payment_id);
    } catch (error) {
      console.error('Error initializing payment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'initialisation du paiement';
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderIPayButton = (txnId: string, paymentId: string) => {
    if (!containerRef.current) return;

    const redirectUrl = `${window.location.origin}/payment-status?payment_id=${paymentId}&reference=${txnId}`;
    const callbackUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ipay-webhook`;

    containerRef.current.innerHTML = '';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ipaymoney-button w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold py-4 px-6 rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all transform hover:scale-105 shadow-lg';
    button.setAttribute('data-amount', amount.toString());
    button.setAttribute('data-environement', 'live');
    button.setAttribute('data-key', IPAY_PUBLIC_KEY);
    button.setAttribute('data-transaction-id', txnId);
    button.setAttribute('data-redirect-url', redirectUrl);
    button.setAttribute('data-callback-url', callbackUrl);
    button.textContent = `Payer ${amount.toLocaleString()} FCFA`;

    containerRef.current.appendChild(button);

    console.log('iPay button attributes:', {
      amount: amount.toString(),
      environement: 'live',
      key: IPAY_PUBLIC_KEY,
      transactionId: txnId,
      redirectUrl,
      callbackUrl,
    });

    setTimeout(() => {
      const btn = containerRef.current?.querySelector('.ipaymoney-button');
      if (btn) {
        console.log('✅ Button rendered with class ipaymoney-button');
        console.log('Button element:', btn);
        console.log('All data attributes:', {
          amount: btn.getAttribute('data-amount'),
          env: btn.getAttribute('data-environement'),
          key: btn.getAttribute('data-key'),
          txnId: btn.getAttribute('data-transaction-id'),
        });
      } else {
        console.error('❌ Button not found after render');
      }

      if (typeof window !== 'undefined' && (window as any).iPayMoney) {
        console.log('✅ iPay SDK is loaded');
      } else {
        console.warn('⚠️ iPay SDK not detected on window');
      }
    }, 500);

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
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-8 h-8 animate-spin text-amber-500" />
        <span className="ml-3 text-gray-300">Préparation du paiement...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="w-full min-h-[60px] flex items-center justify-center">
        {!paymentId && (
          <div className="text-gray-400 text-sm">Chargement du bouton de paiement...</div>
        )}
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <p className="text-amber-300 text-sm mb-2">
          <strong>Important :</strong>
        </p>
        <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
          <li>Cliquez sur le bouton orange pour accéder à la page de paiement iPay</li>
          <li>Choisissez votre mode de paiement (Mobile Money, Carte bancaire, etc.)</li>
          <li>Suivez les instructions pour compléter le paiement</li>
          <li>Vous serez redirigé automatiquement après le paiement</li>
        </ul>
      </div>

      {paymentId && (
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-xs">
            Référence de transaction: <span className="font-mono text-gray-300">{transactionId}</span>
          </p>

          <div className="pt-2 border-t border-gray-700">
            <p className="text-gray-500 text-xs mb-2">Le bouton ne s'affiche pas ?</p>
            <button
              onClick={() => {
                const redirectUrl = `${window.location.origin}/payment-status?payment_id=${paymentId}&reference=${transactionId}`;
                window.open(`https://i-pay.money/checkout?amount=${amount}&key=${IPAY_PUBLIC_KEY}&transaction_id=${transactionId}&redirect_url=${encodeURIComponent(redirectUrl)}`, '_blank');
              }}
              className="text-amber-500 hover:text-amber-400 text-sm underline"
            >
              Ouvrir le portail de paiement iPay directement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
