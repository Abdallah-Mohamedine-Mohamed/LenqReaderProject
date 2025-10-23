import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Ban, CheckCircle, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AccesSuspect, User } from '../lib/supabase';

interface AccesSuspectWithDetails extends AccesSuspect {
  users?: User;
}

export function SecurityAlerts() {
  const [alerts, setAlerts] = useState<AccesSuspectWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('tous');
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 30000);
    return () => clearInterval(interval);
  }, [showResolved]);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('acces_suspects')
        .select(`
          *,
          users (nom, email, numero_abonne, statut_abonnement)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!showResolved) {
        query = query.eq('resolu', false);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('acces_suspects')
        .update({ resolu: true })
        .eq('id', alertId);

      if (error) throw error;
      await loadAlerts();
    } catch (error) {
      console.error('Error resolving alert:', error);
      alert('Erreur lors de la résolution de l\'alerte');
    }
  };

  const suspendUser = async (userId: string, alertId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir suspendre cet utilisateur?')) return;

    try {
      const { error: userError } = await supabase
        .from('users')
        .update({ statut_abonnement: 'suspendu' })
        .eq('id', userId);

      if (userError) throw userError;

      const { error: alertError } = await supabase
        .from('acces_suspects')
        .update({
          resolu: true,
          action_prise: 'Utilisateur suspendu',
        })
        .eq('id', alertId);

      if (alertError) throw alertError;

      await loadAlerts();
      alert('Utilisateur suspendu avec succès');
    } catch (error) {
      console.error('Error suspending user:', error);
      alert('Erreur lors de la suspension');
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesSeverity = filterSeverity === 'tous' || alert.severity === filterSeverity;
    return matchesSeverity;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-900/50 text-red-200 border-red-700';
      case 'high':
        return 'bg-orange-900/50 text-orange-200 border-orange-700';
      case 'medium':
        return 'bg-amber-900/50 text-amber-200 border-amber-700';
      case 'low':
        return 'bg-blue-900/50 text-blue-200 border-blue-700';
      default:
        return 'bg-gray-900/50 text-gray-400 border-gray-700';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <AlertTriangle className="w-5 h-5" />;
      case 'medium':
        return <Eye className="w-5 h-5" />;
      case 'low':
        return <Shield className="w-5 h-5" />;
      default:
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'acces_multiple':
        return 'Accès multiples simultanés';
      case 'ip_differente':
        return 'Adresses IP différentes';
      case 'device_multiple':
        return 'Devices multiples';
      case 'geo_suspect':
        return 'Localisation suspecte';
      case 'vitesse_lecture_anormale':
        return 'Vitesse de lecture anormale';
      default:
        return type;
    }
  };

  const stats = {
    critical: alerts.filter(a => !a.resolu && a.severity === 'critical').length,
    high: alerts.filter(a => !a.resolu && a.severity === 'high').length,
    total: alerts.filter(a => !a.resolu).length,
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        <p className="text-gray-400 mt-4">Chargement des alertes...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
          <Shield className="w-7 h-7 text-amber-500" />
          Alertes de Sécurité
        </h2>
        <p className="text-gray-400 text-sm">
          Surveillance en temps réel des activités suspectes
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 border border-red-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-red-400 text-sm mb-1">Critiques</div>
              <div className="text-3xl font-bold text-white">{stats.critical}</div>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 border border-orange-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-orange-400 text-sm mb-1">Élevées</div>
              <div className="text-3xl font-bold text-white">{stats.high}</div>
            </div>
            <AlertTriangle className="w-8 h-8 text-orange-400" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 border border-amber-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-amber-400 text-sm mb-1">Total Non Résolues</div>
              <div className="text-3xl font-bold text-white">{stats.total}</div>
            </div>
            <Shield className="w-8 h-8 text-amber-400" />
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="tous">Toutes les sévérités</option>
          <option value="critical">Critique</option>
          <option value="high">Élevée</option>
          <option value="medium">Moyenne</option>
          <option value="low">Faible</option>
        </select>
        <label className="flex items-center gap-2 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="w-4 h-4 text-amber-500 bg-gray-600 border-gray-500 rounded focus:ring-amber-500"
          />
          <span className="text-sm">Afficher résolues</span>
        </label>
      </div>

      {filteredAlerts.length === 0 ? (
        <div className="text-center py-12">
          <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">
            {showResolved ? 'Aucune alerte trouvée' : 'Aucune alerte non résolue'}
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Excellent! Aucune activité suspecte détectée
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`border rounded-lg p-4 ${
                alert.resolu
                  ? 'bg-gray-800 border-gray-700 opacity-60'
                  : 'bg-gray-700 border-gray-600 hover:border-red-500'
              } transition-colors`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`flex items-center gap-2 px-3 py-1 rounded text-sm font-medium border ${getSeverityColor(alert.severity)}`}>
                      {getSeverityIcon(alert.severity)}
                      {alert.severity.toUpperCase()}
                    </span>
                    <span className="text-amber-400 text-sm font-medium">
                      {getTypeLabel(alert.type_alerte)}
                    </span>
                    {alert.resolu && (
                      <span className="flex items-center gap-1 text-green-400 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        Résolu
                      </span>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="text-white font-semibold mb-1">
                      {alert.users?.nom || 'Utilisateur inconnu'}
                    </div>
                    <div className="text-sm text-gray-400">
                      {alert.users?.numero_abonne && (
                        <span className="font-mono text-amber-400 mr-3">
                          {alert.users.numero_abonne}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        alert.users?.statut_abonnement === 'suspendu'
                          ? 'bg-red-900/50 text-red-300'
                          : 'bg-gray-800 text-gray-300'
                      }`}>
                        {alert.users?.statut_abonnement || 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-gray-800 border border-gray-700 rounded p-3 mb-3">
                    <p className="text-gray-300 text-sm">{alert.description}</p>
                  </div>

                  {alert.data && Object.keys(alert.data).length > 0 && (
                    <details className="mb-3">
                      <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                        Détails techniques
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-900 p-2 rounded overflow-x-auto text-gray-400">
                        {JSON.stringify(alert.data, null, 2)}
                      </pre>
                    </details>
                  )}

                  {alert.action_prise && (
                    <div className="text-xs text-green-400 bg-green-900/20 border border-green-700 p-2 rounded mb-2">
                      Action prise: {alert.action_prise}
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    Détecté le {new Date(alert.created_at).toLocaleString('fr-FR')}
                  </div>
                </div>

                {!alert.resolu && (
                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => suspendUser(alert.user_id, alert.id)}
                      className="px-3 py-1.5 bg-red-900/50 text-red-300 rounded hover:bg-red-900 transition-colors text-sm flex items-center gap-1 whitespace-nowrap"
                    >
                      <Ban className="w-4 h-4" />
                      Suspendre
                    </button>
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="px-3 py-1.5 bg-green-900/50 text-green-300 rounded hover:bg-green-900 transition-colors text-sm flex items-center gap-1 whitespace-nowrap"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Résoudre
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-200">
            <p className="font-medium mb-1">Protection anti-partage</p>
            <p className="text-blue-300">
              Le système détecte automatiquement les comportements suspects comme les accès depuis plusieurs appareils simultanément,
              les changements fréquents d'adresse IP, et les patterns de lecture anormaux. Agissez rapidement sur les alertes critiques
              pour protéger votre contenu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
