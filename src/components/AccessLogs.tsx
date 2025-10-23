import { useState, useEffect } from 'react';
import { Eye, Calendar, Monitor } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LogEntry {
  id: string;
  pdf_id: string;
  user_id: string;
  ip: string | null;
  user_agent: string | null;
  date_access: string;
  pdfs: {
    titre: string;
  } | null;
  users: {
    nom: string;
    email: string;
  } | null;
}

export function AccessLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('logs')
        .select(`
          *,
          pdfs (titre),
          users (nom, email)
        `)
        .order('date_access', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        <p className="text-gray-400 mt-4">Chargement...</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <Eye className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">Aucun accès enregistré</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">
        Historique des accès ({logs.length})
      </h2>

      <div className="space-y-3">
        {logs.map((log) => (
          <div
            key={log.id}
            className="bg-gray-700 border border-gray-600 rounded-lg p-4 hover:border-gray-500 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">
                  {log.pdfs?.titre || 'Journal supprimé'}
                </h3>
                <div className="space-y-1 text-sm text-gray-400">
                  <div className="flex items-center space-x-2">
                    <Eye className="w-4 h-4" />
                    <span>
                      {log.users?.nom || 'Utilisateur inconnu'} ({log.users?.email || 'N/A'})
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {new Date(log.date_access).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>
                  {log.ip && (
                    <div className="flex items-center space-x-2">
                      <Monitor className="w-4 h-4" />
                      <span>IP: {log.ip}</span>
                    </div>
                  )}
                  {log.user_agent && (
                    <div className="text-xs text-gray-500 mt-1">
                      {log.user_agent.substring(0, 100)}
                      {log.user_agent.length > 100 ? '...' : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
