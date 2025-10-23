import { useState } from 'react';
import { CreditCard, Smartphone, Wallet } from 'lucide-react';
import { PaymentType } from '../lib/ipay';

interface PaymentMethodSelectorProps {
  onSelect: (paymentType: PaymentType, msisdn?: string) => void;
  loading?: boolean;
}

export function PaymentMethodSelector({ onSelect, loading }: PaymentMethodSelectorProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentType | null>(null);
  const [msisdn, setMsisdn] = useState('');
  const [error, setError] = useState('');

  const paymentMethods = [
    {
      type: 'mobile' as PaymentType,
      icon: Smartphone,
      title: 'Mobile Money',
      description: 'Moov, MTN, Celtiis',
      requiresMsisdn: true,
    },
    {
      type: 'card' as PaymentType,
      icon: CreditCard,
      title: 'Carte Bancaire',
      description: 'Visa, Mastercard',
      requiresMsisdn: false,
    },
    {
      type: 'sta' as PaymentType,
      icon: Wallet,
      title: 'Nita / Amanata',
      description: 'Portefeuille électronique',
      requiresMsisdn: true,
    },
  ];

  const handleMethodSelect = (type: PaymentType) => {
    setSelectedMethod(type);
    setError('');
    setMsisdn('');
  };

  const handleSubmit = () => {
    if (!selectedMethod) {
      setError('Veuillez sélectionner une méthode de paiement');
      return;
    }

    const method = paymentMethods.find(m => m.type === selectedMethod);
    if (method?.requiresMsisdn) {
      if (!msisdn) {
        setError('Veuillez entrer votre numéro de téléphone');
        return;
      }
      if (!/^(\+)?(227|229)\d{8}$/.test(msisdn)) {
        setError('Numéro invalide. Format: 227XXXXXXXX ou 229XXXXXXXX');
        return;
      }
    }

    onSelect(selectedMethod, msisdn || undefined);
  };

  const selectedMethodData = paymentMethods.find(m => m.type === selectedMethod);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-2">
          Choisissez votre méthode de paiement
        </h3>
        <p className="text-gray-400 text-sm">
          Sélectionnez comment vous souhaitez payer votre abonnement
        </p>
      </div>

      <div className="grid gap-4">
        {paymentMethods.map((method) => {
          const Icon = method.icon;
          const isSelected = selectedMethod === method.type;

          return (
            <button
              key={method.type}
              onClick={() => handleMethodSelect(method.type)}
              disabled={loading}
              className={`w-full p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-3 rounded-lg ${
                    isSelected ? 'bg-blue-500/20' : 'bg-gray-700/50'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`} />
                </div>
                <div className="text-left flex-1">
                  <div className={`font-semibold ${isSelected ? 'text-blue-400' : 'text-white'}`}>
                    {method.title}
                  </div>
                  <div className="text-sm text-gray-400">{method.description}</div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    isSelected ? 'border-blue-500' : 'border-gray-600'
                  }`}
                >
                  {isSelected && <div className="w-3 h-3 rounded-full bg-blue-500" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedMethodData?.requiresMsisdn && (
        <div>
          <label htmlFor="msisdn" className="block text-sm font-medium text-gray-300 mb-2">
            Numéro de téléphone
          </label>
          <input
            type="tel"
            id="msisdn"
            value={msisdn}
            onChange={(e) => {
              setMsisdn(e.target.value);
              setError('');
            }}
            placeholder="227XXXXXXXX ou 229XXXXXXXX"
            disabled={loading}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-gray-500">
            Entrez votre numéro sans espaces (227 pour Niger, 229 pour Bénin)
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!selectedMethod || loading}
        className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Traitement en cours...' : 'Procéder au paiement'}
      </button>
    </div>
  );
}
