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

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);

      const { data: payment, error: paymentError } = await supabase
        .from('paiements')
        .insert({
          user_id: userId,
          abonnement_id: abonnementId,
          formule_id: formuleId,
          montant_fcfa: amount,
          methode_paiement: 'iPayMoney-SDK',
          reference_transaction: txnId,
          ipay_transaction_id: txnId,
          statut: 'en_attente',
          currency: 'XOF',
          country_code: 'BJ',
          expires_at: expiresAt.toISOString(),
          notes: 'Payment via iPay SDK',
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      setPaymentId(payment.id);

      await supabase.from('payment_events').insert({
        payment_id: payment.id,
        user_id: userId,
        event_type: 'created',
        old_status: null,
        new_status: 'en_attente',
        metadata: {
          transaction_id: txnId,
          method: 'iPay SDK',
        },
        notes: 'Payment created via iPay SDK',
      });

      renderIPayButton(txnId, payment.id);
    } catch (error) {
      console.error('Error initializing payment:', error);
      onError?.('Erreur lors de l\'initialisation du paiement');
    } finally {
      setLoading(false);
    }
  };

  const renderIPayButton = (txnId: string, paymentId: string) => {
    if (!containerRef.current) return;

    const redirectUrl = `${window.location.origin}/payment-status?payment_id=${paymentId}&reference=${txnId}`;

    const callbackUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ipay-webhook`;

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

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(button);

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
      <div ref={containerRef} className="w-full"></div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <p className="text-amber-300 text-sm mb-2">
          <strong>Important :</strong>
        </p>
        <ul className="text-gray-300 text-sm space-y-1 list-disc list-inside">
          <li>Cliquez sur le bouton pour accéder à la page de paiement iPay</li>
          <li>Choisissez votre mode de paiement (Mobile Money, Carte bancaire, etc.)</li>
          <li>Suivez les instructions pour compléter le paiement</li>
          <li>Vous serez redirigé automatiquement après le paiement</li>
        </ul>
      </div>

      {paymentId && (
        <div className="text-center">
          <p className="text-gray-400 text-xs">
            Référence de transaction: <span className="font-mono text-gray-300">{transactionId}</span>
          </p>
        </div>
      )}
    </div>
  );
}
