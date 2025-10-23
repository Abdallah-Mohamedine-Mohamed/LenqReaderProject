import { useState, useEffect } from 'react';
import { Users, Search, UserPlus, Ban, CheckCircle, AlertTriangle, Calendar, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { User, Abonnement } from '../lib/supabase';

interface SubscriberWithDetails extends User {
  abonnements?: Abonnement[];
}

export function SubscriberManagement() {
  const [subscribers, setSubscribers] = useState<SubscriberWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('tous');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadSubscribers();
  }, []);

  const loadSubscribers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          abonnements (
            *,
            formules (*)
          )
        `)
        .eq('role', 'lecteur')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscribers(data || []);
    } catch (error) {
      console.error('Error loading subscribers:', error);
    } finally {
      setLoading(false);
    }
  };

  const suspendSubscriber = async (userId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir suspendre cet abonné ?')) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ statut_abonnement: 'suspendu' })
        .eq('id', userId);

      if (error) throw error;
      await loadSubscribers();
      alert('Abonné suspendu avec succès');
    } catch (error) {
      console.error('Error suspending subscriber:', error);
      alert('Erreur lors de la suspension');
    }
  };

  const activateSubscriber = async (userId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir réactiver cet abonné ?')) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ statut_abonnement: 'actif' })
        .eq('id', userId);

      if (error) throw error;
      await loadSubscribers();
      alert('Abonné réactivé avec succès');
    } catch (error) {
      console.error('Error activating subscriber:', error);
      alert('Erreur lors de la réactivation');
    }
  };

  const filteredSubscribers = subscribers.filter(sub => {
    const matchesSearch =
      sub.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.numero_abonne?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.numero_whatsapp?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterStatus === 'tous' || sub.statut_abonnement === filterStatus;

    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (statut?: string) => {
    switch (statut) {
      case 'actif':
        return 'bg-green-900/50 text-green-300 border-green-700';
      case 'essai':
        return 'bg-blue-900/50 text-blue-300 border-blue-700';
      case 'expire':
        return 'bg-gray-900/50 text-gray-400 border-gray-700';
      case 'suspendu':
        return 'bg-red-900/50 text-red-300 border-red-700';
      default:
        return 'bg-gray-900/50 text-gray-400 border-gray-700';
    }
  };

  const getStatusIcon = (statut?: string) => {
    switch (statut) {
      case 'actif':
      case 'essai':
        return <CheckCircle className="w-4 h-4" />;
      case 'suspendu':
        return <Ban className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        <p className="text-gray-400 mt-4">Chargement des abonnés...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-amber-500" />
            Gestion des Abonnés
          </h2>
          <p className="text-gray-400 mt-1">
            {subscribers.length} abonné{subscribers.length > 1 ? 's' : ''} au total
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-black font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          Nouvel Abonné
        </button>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Rechercher par nom, email, numéro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="tous">Tous les statuts</option>
          <option value="actif">Actif</option>
          <option value="essai">En essai</option>
          <option value="expire">Expiré</option>
          <option value="suspendu">Suspendu</option>
          <option value="inactif">Inactif</option>
        </select>
      </div>

      {filteredSubscribers.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">
            {searchTerm || filterStatus !== 'tous'
              ? 'Aucun abonné trouvé avec ces filtres'
              : 'Aucun abonné enregistré'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSubscribers.map((subscriber) => (
            <div
              key={subscriber.id}
              className="bg-gray-700 border border-gray-600 rounded-lg p-4 hover:border-amber-500 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-white font-semibold text-lg">{subscriber.nom}</h3>
                    <span className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${getStatusBadge(subscriber.statut_abonnement)}`}>
                      {getStatusIcon(subscriber.statut_abonnement)}
                      {subscriber.statut_abonnement || 'Inactif'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-300 mb-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span className="font-mono text-amber-400">{subscriber.numero_abonne || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{subscriber.numero_whatsapp || 'Non renseigné'}</span>
                      {subscriber.whatsapp_verifie && (
                        <CheckCircle className="w-3 h-3 text-green-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Email:</span>
                      <span>{subscriber.email}</span>
                    </div>
                    {subscriber.date_fin_abonnement && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>
                          Expire le {new Date(subscriber.date_fin_abonnement).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>Score de confiance: {subscriber.score_confiance || 100}/100</span>
                    <span>•</span>
                    <span>Devices autorisés: {subscriber.devices_autorises || 1}</span>
                    <span>•</span>
                    <span>Inscrit le {new Date(subscriber.created_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {subscriber.statut_abonnement === 'suspendu' ? (
                    <button
                      onClick={() => activateSubscriber(subscriber.id)}
                      className="px-3 py-1 bg-green-900/50 text-green-300 rounded hover:bg-green-900 transition-colors text-sm"
                    >
                      Réactiver
                    </button>
                  ) : (
                    <button
                      onClick={() => suspendSubscriber(subscriber.id)}
                      className="px-3 py-1 bg-red-900/50 text-red-300 rounded hover:bg-red-900 transition-colors text-sm"
                    >
                      Suspendre
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddSubscriberModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadSubscribers();
          }}
        />
      )}
    </div>
  );
}

interface AddSubscriberModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddSubscriberModal({ onClose, onSuccess }: AddSubscriberModalProps) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [numeroWhatsapp, setNumeroWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Erreur lors de la création du compte');

      const { error: userError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          nom,
          role: 'lecteur',
          numero_whatsapp: numeroWhatsapp || null,
          statut_abonnement: 'actif',
        })
        .select()
        .single();

      if (userError) {
        if (userError.code === '23505') {
          const { error: updateError } = await supabase
            .from('users')
            .update({
              nom,
              numero_whatsapp: numeroWhatsapp || null,
              statut_abonnement: 'actif',
            })
            .eq('id', authData.user.id);

          if (updateError) throw updateError;
        } else {
          throw userError;
        }
      }

      alert('Abonné créé avec succès!');
      onSuccess();
    } catch (err) {
      console.error('Error creating subscriber:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full">
        <h3 className="text-white font-bold text-xl mb-4">Nouvel Abonné</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Nom complet
            </label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Numéro WhatsApp (avec code pays)
            </label>
            <input
              type="tel"
              value={numeroWhatsapp}
              onChange={(e) => setNumeroWhatsapp(e.target.value)}
              placeholder="+227 XX XX XX XX"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Mot de passe initial
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-amber-600 text-black font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
