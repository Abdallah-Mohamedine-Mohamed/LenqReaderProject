import { useState, useEffect } from 'react';
import { Newspaper, CheckCircle, Clock, Shield, Smartphone, Users, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Formule } from '../lib/supabase';
import { Link } from 'react-router-dom';

export function LandingPage() {
  const [formules, setFormules] = useState<Formule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFormules();
  }, []);

  const loadFormules = async () => {
    try {
      const { data, error } = await supabase
        .from('formules')
        .select('*')
        .eq('actif', true)
        .order('priorite', { ascending: true });

      if (error) throw error;
      setFormules(data || []);
    } catch (error) {
      console.error('Error loading formules:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'decimal',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const getPeriodLabel = (jours: number) => {
    if (jours === 7) return 'semaine';
    if (jours === 30) return 'mois';
    if (jours === 365) return 'an';
    return `${jours} jours`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Newspaper className="w-8 h-8 text-amber-500" />
            <div>
              <h1 className="text-2xl font-bold text-white">L'Enquêteur</h1>
              <p className="text-xs text-gray-400">Journal d'Investigation</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
            >
              Se connecter
            </Link>
            <Link
              to="/admin-login"
              className="px-4 py-2 text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Shield className="w-4 h-4" />
              Admin
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            L'Information qui
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600"> Compte</span>
          </h2>
          <p className="text-xl text-gray-300 mb-8 leading-relaxed">
            Accédez à un journalisme d'investigation de qualité, protégé et sécurisé.
            Recevez vos éditions directement sur WhatsApp.
          </p>
          <Link
            to="/subscribe"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold text-lg rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all duration-200 shadow-lg hover:shadow-amber-500/50"
          >
            S'abonner maintenant
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <div className="bg-amber-500/10 p-3 rounded-lg w-fit mb-4">
              <Shield className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Lecture Sécurisée</h3>
            <p className="text-gray-400">
              Protection DRM avancée contre les captures d'écran et le partage non autorisé.
            </p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <div className="bg-green-500/10 p-3 rounded-lg w-fit mb-4">
              <Smartphone className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Livraison WhatsApp</h3>
            <p className="text-gray-400">
              Recevez vos éditions quotidiennes directement sur votre numéro WhatsApp.
            </p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <div className="bg-blue-500/10 p-3 rounded-lg w-fit mb-4">
              <Clock className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Accès Illimité</h3>
            <p className="text-gray-400">
              Lisez et relisez vos éditions pendant toute la durée de votre abonnement.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Plans */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">Nos Formules</h2>
          <p className="text-gray-400 text-lg">
            Choisissez la formule qui vous convient
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
            <p className="text-gray-400 mt-4">Chargement des formules...</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {formules.map((formule) => (
              <div
                key={formule.id}
                className={`bg-gray-800 border-2 rounded-lg p-8 relative ${
                  formule.essai_gratuit
                    ? 'border-green-500 shadow-lg shadow-green-500/20'
                    : 'border-gray-700 hover:border-amber-500/50'
                } transition-all duration-200`}
              >
                {formule.essai_gratuit && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-green-500 text-black text-sm font-bold rounded-full">
                    ESSAI GRATUIT
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-white mb-2">{formule.nom}</h3>
                  <div className="text-4xl font-bold text-amber-500 mb-1">
                    {formule.prix_fcfa === 0 ? 'Gratuit' : `${formatPrice(formule.prix_fcfa)} FCFA`}
                  </div>
                  <p className="text-gray-400 text-sm">par {getPeriodLabel(formule.duree_jours)}</p>
                </div>

                {formule.description && (
                  <p className="text-gray-300 text-center mb-6 text-sm leading-relaxed">
                    {formule.description}
                  </p>
                )}

                <div className="space-y-3 mb-8">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300 text-sm">
                      Accès illimité pendant {formule.duree_jours} jours
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300 text-sm">
                      Livraison WhatsApp quotidienne
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300 text-sm">
                      Lecture sécurisée et protégée
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300 text-sm">
                      Support client dédié
                    </span>
                  </div>
                </div>

                <Link
                  to={`/subscribe?formule=${formule.id}`}
                  className={`block w-full py-3 rounded-lg font-semibold text-center transition-all duration-200 ${
                    formule.essai_gratuit
                      ? 'bg-green-500 text-black hover:bg-green-600'
                      : 'bg-amber-500 text-black hover:bg-amber-600'
                  }`}
                >
                  {formule.essai_gratuit ? 'Commencer gratuitement' : 'Choisir cette formule'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Social Proof */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="bg-gradient-to-r from-amber-500/10 to-yellow-600/10 border border-amber-500/20 rounded-lg p-8 text-center">
          <Users className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-white mb-2">
            Rejoignez des centaines de lecteurs informés
          </h3>
          <p className="text-gray-300 max-w-2xl mx-auto">
            L'Enquêteur est devenu la référence en matière de journalisme d'investigation de qualité.
            Rejoignez notre communauté de lecteurs exigeants.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-700 bg-gray-900 mt-20">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-gray-400 text-sm">
            <p className="mb-2">© 2025 L'Enquêteur - Tous droits réservés</p>
            <p>Journalisme d'investigation de qualité</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
