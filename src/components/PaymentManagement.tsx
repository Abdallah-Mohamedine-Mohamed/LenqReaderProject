import { useState, useEffect } from 'react';
import { DollarSign, CheckCircle, Clock, XCircle, Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Paiement, User, Formule } from '../lib/supabase';

interface PaiementWithDetails extends Paiement {
  users?: User;
}

export function PaymentManagement() {
  const { user } = useAuth();
  const [paiements, setPaiements] = useState<PaiementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('tous');
  const [showAddModal, setShowAddModal] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    confirme: 0,
    en_attente: 0,
    ce_mois: 0,
  });

  useEffect(() => {
    loadPaiements();
  }, []);

  const loadPaiements = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('paiements')
        .select(`
          *,
          users (nom, email, numero_abonne)
        `)
        .order('date_paiement', { ascending: false })
        .limit(100);

      if (error) throw error;
      setPaiements(data || []);

      const total = data?.reduce((sum, p) => p.statut === 'confirme' ? sum + p.montant_fcfa : sum, 0) || 0;
      const confirme = data?.filter(p => p.statut === 'confirme').length || 0;
      const en_attente = data?.filter(p => p.statut === 'en_attente').length || 0;

      const currentMonth = new Date().getMonth();
      const ce_mois = data?.reduce((sum, p) => {
        const pDate = new Date(p.date_paiement);
        return p.statut === 'confirme' && pDate.getMonth() === currentMonth ? sum + p.montant_fcfa : sum;
      }, 0) || 0;

      setStats({ total, confirme, en_attente, ce_mois });
    } catch (error) {
      console.error('Error loading paiements:', error);
    } finally {
      setLoading(false);
    }
  };

  const confirmPayment = async (paiementId: string, abonnementId: string | null) => {
    if (!confirm('Confirmer ce paiement?')) return;

    try {
      const { error } = await supabase
        .from('paiements')
        .update({
          statut: 'confirme',
          confirme_par: user?.id,
        })
        .eq('id', paiementId);

      if (error) throw error;

      if (abonnementId) {
        const { error: abonnementError } = await supabase
          .from('abonnements')
          .update({ statut: 'actif' })
          .eq('id', abonnementId);

        if (abonnementError) console.error('Error updating subscription:', abonnementError);
      }

      await loadPaiements();
      alert('Paiement confirmé avec succès');
    } catch (error) {
      console.error('Error confirming payment:', error);
      alert('Erreur lors de la confirmation');
    }
  };

  const rejectPayment = async (paiementId: string) => {
    if (!confirm('Rejeter ce paiement?')) return;

    try {
      const { error } = await supabase
        .from('paiements')
        .update({ statut: 'echoue' })
        .eq('id', paiementId);

      if (error) throw error;
      await loadPaiements();
      alert('Paiement rejeté');
    } catch (error) {
      console.error('Error rejecting payment:', error);
      alert('Erreur lors du rejet');
    }
  };

  const filteredPaiements = paiements.filter(p => {
    const matchesSearch =
      p.users?.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.users?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.reference_transaction?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterStatus === 'tous' || p.statut === filterStatus;

    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case 'confirme':
        return 'bg-green-900/50 text-green-300 border-green-700';
      case 'en_attente':
        return 'bg-amber-900/50 text-amber-300 border-amber-700';
      case 'echoue':
        return 'bg-red-900/50 text-red-300 border-red-700';
      case 'rembourse':
        return 'bg-blue-900/50 text-blue-300 border-blue-700';
      default:
        return 'bg-gray-900/50 text-gray-400 border-gray-700';
    }
  };

  const getStatusIcon = (statut: string) => {
    switch (statut) {
      case 'confirme':
        return <CheckCircle className="w-4 h-4" />;
      case 'en_attente':
        return <Clock className="w-4 h-4" />;
      case 'echoue':
      case 'rembourse':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        <p className="text-gray-400 mt-4">Chargement des paiements...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <DollarSign className="w-7 h-7 text-amber-500" />
          Gestion des Paiements
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700 rounded-lg p-4">
          <div className="text-green-400 text-sm mb-1">Total Confirmé</div>
          <div className="text-2xl font-bold text-white">{stats.total.toLocaleString()} FCFA</div>
        </div>
        <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700 rounded-lg p-4">
          <div className="text-blue-400 text-sm mb-1">Ce Mois</div>
          <div className="text-2xl font-bold text-white">{stats.ce_mois.toLocaleString()} FCFA</div>
        </div>
        <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700 rounded-lg p-4">
          <div className="text-green-400 text-sm mb-1">Paiements Confirmés</div>
          <div className="text-2xl font-bold text-white">{stats.confirme}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 border border-amber-700 rounded-lg p-4">
          <div className="text-amber-400 text-sm mb-1">En Attente</div>
          <div className="text-2xl font-bold text-white">{stats.en_attente}</div>
        </div>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Rechercher par nom, email, référence..."
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
          <option value="en_attente">En attente</option>
          <option value="confirme">Confirmé</option>
          <option value="echoue">Échoué</option>
          <option value="rembourse">Remboursé</option>
        </select>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-black font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Enregistrer Paiement
        </button>
      </div>

      {filteredPaiements.length === 0 ? (
        <div className="text-center py-12">
          <DollarSign className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Aucun paiement trouvé</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPaiements.map((paiement) => (
            <div
              key={paiement.id}
              className="bg-gray-700 border border-gray-600 rounded-lg p-4 hover:border-amber-500 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-white font-semibold">{paiement.users?.nom || 'Utilisateur inconnu'}</h3>
                    <span className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${getStatusBadge(paiement.statut)}`}>
                      {getStatusIcon(paiement.statut)}
                      {paiement.statut.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-300 mb-2">
                    <div>
                      <span className="text-amber-400 font-bold text-lg">{paiement.montant_fcfa.toLocaleString()} FCFA</span>
                    </div>
                    <div>Méthode: {paiement.methode_paiement}</div>
                    {paiement.ipay_reference && (
                      <div className="font-mono text-xs">iPay Réf: {paiement.ipay_reference}</div>
                    )}
                    {paiement.ipay_transaction_id && (
                      <div className="font-mono text-xs">TXN: {paiement.ipay_transaction_id}</div>
                    )}
                    {paiement.msisdn && (
                      <div>Mobile: {paiement.msisdn}</div>
                    )}
                    {paiement.country_code && (
                      <div>Pays: {paiement.country_code}</div>
                    )}
                    {paiement.ipay_status && (
                      <div>Statut iPay: <span className="font-semibold">{paiement.ipay_status}</span></div>
                    )}
                    <div>
                      {new Date(paiement.date_paiement).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  {paiement.notes && (
                    <div className="text-xs text-gray-400 bg-gray-800 p-2 rounded mt-2">
                      {paiement.notes}
                    </div>
                  )}
                </div>

                {paiement.statut === 'en_attente' && (
                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => confirmPayment(paiement.id, paiement.abonnement_id)}
                      className="px-3 py-1 bg-green-900/50 text-green-300 rounded hover:bg-green-900 transition-colors text-sm flex items-center gap-1"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Confirmer
                    </button>
                    <button
                      onClick={() => rejectPayment(paiement.id)}
                      className="px-3 py-1 bg-red-900/50 text-red-300 rounded hover:bg-red-900 transition-colors text-sm flex items-center gap-1"
                    >
                      <XCircle className="w-4 h-4" />
                      Rejeter
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddPaymentModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadPaiements();
          }}
          adminId={user?.id || ''}
        />
      )}
    </div>
  );
}

interface AddPaymentModalProps {
  onClose: () => void;
  onSuccess: () => void;
  adminId: string;
}

function AddPaymentModal({ onClose, onSuccess, adminId }: AddPaymentModalProps) {
  const [subscribers, setSubscribers] = useState<User[]>([]);
  const [formules, setFormules] = useState<Formule[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedFormule, setSelectedFormule] = useState('');
  const [montant, setMontant] = useState('');
  const [methode, setMethode] = useState('Mobile Money');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [subscribersRes, formulesRes] = await Promise.all([
        supabase.from('users').select('*').eq('role', 'lecteur').order('nom'),
        supabase.from('formules').select('*').eq('actif', true).order('priorite'),
      ]);

      if (subscribersRes.data) setSubscribers(subscribersRes.data);
      if (formulesRes.data) {
        setFormules(formulesRes.data);
        if (formulesRes.data.length > 0) {
          setSelectedFormule(formulesRes.data[0].id);
          setMontant(formulesRes.data[0].prix_fcfa.toString());
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleFormuleChange = (formuleId: string) => {
    setSelectedFormule(formuleId);
    const formule = formules.find(f => f.id === formuleId);
    if (formule) {
      setMontant(formule.prix_fcfa.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formule = formules.find(f => f.id === selectedFormule);
      if (!formule) throw new Error('Formule introuvable');

      const dateDebut = new Date();
      const dateFin = new Date();
      dateFin.setDate(dateFin.getDate() + formule.duree_jours);

      const { data: abonnement, error: abonnementError } = await supabase
        .from('abonnements')
        .insert({
          user_id: selectedUser,
          formule_id: selectedFormule,
          date_debut: dateDebut.toISOString(),
          date_fin: dateFin.toISOString(),
          statut: 'actif',
        })
        .select()
        .single();

      if (abonnementError) throw abonnementError;

      const { error: paiementError } = await supabase
        .from('paiements')
        .insert({
          user_id: selectedUser,
          abonnement_id: abonnement.id,
          montant_fcfa: parseInt(montant),
          methode_paiement: methode,
          reference_transaction: reference || null,
          statut: 'confirme',
          notes,
          confirme_par: adminId,
        });

      if (paiementError) throw paiementError;

      const { error: userError } = await supabase
        .from('users')
        .update({
          statut_abonnement: 'actif',
          date_fin_abonnement: dateFin.toISOString(),
        })
        .eq('id', selectedUser);

      if (userError) throw userError;

      alert('Paiement enregistré et abonnement activé avec succès!');
      onSuccess();
    } catch (error) {
      console.error('Error creating payment:', error);
      alert('Erreur lors de l\'enregistrement du paiement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-white font-bold text-xl mb-4">Enregistrer un Paiement</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Abonné
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            >
              <option value="">Sélectionner un abonné</option>
              {subscribers.map(sub => (
                <option key={sub.id} value={sub.id}>
                  {sub.nom} ({sub.numero_abonne})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Formule
            </label>
            <select
              value={selectedFormule}
              onChange={(e) => handleFormuleChange(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            >
              {formules.map(formule => (
                <option key={formule.id} value={formule.id}>
                  {formule.nom} - {formule.prix_fcfa} FCFA ({formule.duree_jours} jours)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Montant (FCFA)
            </label>
            <input
              type="number"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Méthode de paiement
            </label>
            <select
              value={methode}
              onChange={(e) => setMethode(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            >
              <option value="Mobile Money">Mobile Money</option>
              <option value="Orange Money">Orange Money</option>
              <option value="Airtel Money">Airtel Money</option>
              <option value="Moov Money">Moov Money</option>
              <option value="Espèces">Espèces</option>
              <option value="Virement bancaire">Virement bancaire</option>
              <option value="Autre">Autre</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Référence de transaction (optionnel)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex: TXN123456789"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Notes (optionnel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !selectedUser || !selectedFormule}
              className="flex-1 px-4 py-2 bg-amber-600 text-black font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
