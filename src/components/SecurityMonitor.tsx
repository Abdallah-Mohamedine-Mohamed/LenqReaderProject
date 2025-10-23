import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Users, Activity, Eye, XCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ActiveSession {
  id: string;
  session_id: string;
  user_id: string;
  token_id: string;
  ip_address: string;
  started_at: string;
  last_heartbeat: string;
  current_page: number;
  is_active: boolean;
  users: {
    nom: string;
    numero_abonne: string;
  };
  tokens: {
    pdf_id: string;
    access_count: number;
    revoked: boolean;
  };
}

interface SuspiciousAccess {
  id: string;
  user_id: string;
  token_id: string;
  type_alerte: string;
  description: string;
  severity: string;
  created_at: string;
  resolu: boolean;
  users: {
    nom: string;
    numero_abonne: string;
  };
}

interface SecurityStats {
  active_sessions_count: number;
  suspicious_tokens_count: number;
  revoked_today_count: number;
  unique_readers_today: number;
}

export function SecurityMonitor() {
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [suspiciousAccess, setSuspiciousAccess] = useState<SuspiciousAccess[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadSecurityData();

    if (autoRefresh) {
      const interval = setInterval(loadSecurityData, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadSecurityData = async () => {
    try {
      const [sessionsResult, suspiciousResult, statsResult] = await Promise.all([
        supabase
          .from('active_sessions')
          .select(`
            *,
            users(nom, numero_abonne),
            tokens(pdf_id, access_count, revoked)
          `)
          .eq('is_active', true)
          .order('started_at', { ascending: false }),

        supabase
          .from('acces_suspects')
          .select(`
            *,
            users(nom, numero_abonne)
          `)
          .eq('resolu', false)
          .order('created_at', { ascending: false })
          .limit(20),

        supabase.rpc('get_security_stats')
      ]);

      if (sessionsResult.data) {
        setActiveSessions(sessionsResult.data as any);
      }

      if (suspiciousResult.data) {
        setSuspiciousAccess(suspiciousResult.data as any);
      }

      if (statsResult.data && statsResult.data.length > 0) {
        setStats(statsResult.data[0]);
      }
    } catch (error) {
      console.error('Error loading security data:', error);
    } finally {
      setLoading(false);
    }
  };

  const revokeToken = async (tokenId: string, reason: string) => {
    try {
      const { error } = await supabase
        .from('tokens')
        .update({
          revoked: true,
          revoked_reason: reason,
        })
        .eq('id', tokenId);

      if (error) throw error;

      await supabase.from('revocation_log').insert({
        token_id: tokenId,
        user_id: activeSessions.find(s => s.token_id === tokenId)?.user_id,
        reason,
        revocation_type: 'manual',
      });

      alert('Token révoqué avec succès');
      loadSecurityData();
    } catch (error) {
      console.error('Error revoking token:', error);
      alert('Erreur lors de la révocation du token');
    }
  };

  const markAsResolved = async (accessId: string) => {
    try {
      const { error } = await supabase
        .from('acces_suspects')
        .update({ resolu: true })
        .eq('id', accessId);

      if (error) throw error;
      loadSecurityData();
    } catch (error) {
      console.error('Error marking as resolved:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-900/50 text-red-300 border-red-700';
      case 'high':
        return 'bg-orange-900/50 text-orange-300 border-orange-700';
      case 'medium':
        return 'bg-yellow-900/50 text-yellow-300 border-yellow-700';
      default:
        return 'bg-blue-900/50 text-blue-300 border-blue-700';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        <p className="text-gray-400 mt-4">Chargement du monitoring...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-7 h-7 text-amber-500" />
          Monitoring de Sécurité
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              autoRefresh
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Activity className={`w-4 h-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          <button
            onClick={loadSecurityData}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Sessions Actives</span>
              <Users className="w-5 h-5 text-green-400" />
            </div>
            <p className="text-3xl font-bold text-white">{stats.active_sessions_count}</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Tokens Révoqués</span>
              <XCircle className="w-5 h-5 text-red-400" />
            </div>
            <p className="text-3xl font-bold text-white">{stats.suspicious_tokens_count}</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Révocations 24h</span>
              <AlertTriangle className="w-5 h-5 text-orange-400" />
            </div>
            <p className="text-3xl font-bold text-white">{stats.revoked_today_count}</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Lecteurs Uniques 24h</span>
              <Eye className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-3xl font-bold text-white">{stats.unique_readers_today}</p>
          </div>
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-400" />
          Sessions de Lecture Actives ({activeSessions.length})
        </h3>

        {activeSessions.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Aucune session active pour le moment</p>
        ) : (
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="bg-gray-700 border border-gray-600 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-white font-semibold">
                        {session.users?.nom || 'Utilisateur inconnu'}
                      </span>
                      <span className="text-sm text-gray-400">
                        ({session.users?.numero_abonne})
                      </span>
                      {session.tokens?.revoked && (
                        <span className="px-2 py-1 bg-red-900/50 text-red-300 text-xs rounded border border-red-700">
                          Révoqué
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
                      <div>IP: {session.ip_address || 'N/A'}</div>
                      <div>Page: {session.current_page}</div>
                      <div>Accès: {session.tokens?.access_count || 0}</div>
                      <div>
                        Dernière activité:{' '}
                        {new Date(session.last_heartbeat).toLocaleTimeString('fr-FR')}
                      </div>
                    </div>
                  </div>
                  {!session.tokens?.revoked && (
                    <button
                      onClick={() => {
                        if (confirm('Voulez-vous révoquer ce token pour partage suspect ?')) {
                          revokeToken(session.token_id, 'Révocation manuelle - Activité suspecte');
                        }
                      }}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                    >
                      Révoquer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-400" />
          Accès Suspects Non Résolus ({suspiciousAccess.length})
        </h3>

        {suspiciousAccess.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-400">Aucun accès suspect détecté</p>
          </div>
        ) : (
          <div className="space-y-3">
            {suspiciousAccess.map((access) => (
              <div
                key={access.id}
                className={`border rounded-lg p-4 ${getSeverityColor(access.severity)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold">
                        {access.users?.nom || 'Utilisateur inconnu'}
                      </span>
                      <span className="text-sm opacity-80">
                        ({access.users?.numero_abonne})
                      </span>
                      <span className="px-2 py-1 bg-black/30 text-xs rounded uppercase">
                        {access.type_alerte}
                      </span>
                    </div>
                    <p className="text-sm mb-2">{access.description}</p>
                    <p className="text-xs opacity-70">
                      {new Date(access.created_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <button
                    onClick={() => markAsResolved(access.id)}
                    className="px-3 py-1 bg-gray-900 text-white text-sm rounded hover:bg-gray-950 transition-colors"
                  >
                    Marquer résolu
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
