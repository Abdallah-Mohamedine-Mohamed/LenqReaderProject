import { Clock, CheckCircle, Phone, CreditCard, Newspaper } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SubscriptionPending() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <Newspaper className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white">L'Enquêteur</h1>
        </div>

        <div className="bg-gray-800 border border-amber-500/30 rounded-lg p-8">
          <div className="text-center mb-8">
            <div className="bg-amber-500/10 p-4 rounded-full w-fit mx-auto mb-4">
              <Clock className="w-12 h-12 text-amber-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Votre abonnement est en attente
            </h2>
            <p className="text-gray-300">
              Nous avons bien reçu votre demande d'abonnement !
            </p>
          </div>

          <div className="space-y-6 mb-8">
            <div className="bg-gray-700/50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-500" />
                Étapes suivantes
              </h3>
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <div className="bg-amber-500 text-black font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-sm">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">Effectuez votre paiement</p>
                    <p className="text-gray-400 text-sm mt-1">
                      Utilisez la méthode de paiement que vous avez sélectionnée
                    </p>
                  </div>
                </li>

                <li className="flex gap-3">
                  <div className="bg-amber-500 text-black font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-sm">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">Validation par notre équipe</p>
                    <p className="text-gray-400 text-sm mt-1">
                      Un administrateur validera votre paiement dans les 24 heures
                    </p>
                  </div>
                </li>

                <li className="flex gap-3">
                  <div className="bg-amber-500 text-black font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-sm">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">Recevez votre accès</p>
                    <p className="text-gray-400 text-sm mt-1">
                      Vous recevrez un lien d'accès directement sur WhatsApp
                    </p>
                  </div>
                </li>
              </ol>
            </div>

            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <Phone className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-semibold mb-2">
                    Notification WhatsApp
                  </h4>
                  <p className="text-gray-300 text-sm">
                    Dès que votre paiement sera validé, vous recevrez automatiquement
                    un message WhatsApp avec votre lien d'accès personnel et sécurisé.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-semibold mb-2">
                    Votre compte est créé
                  </h4>
                  <p className="text-gray-300 text-sm mb-3">
                    Vous pouvez vous connecter à tout moment pour consulter le statut
                    de votre abonnement.
                  </p>
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
                  >
                    Se connecter à mon espace
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
