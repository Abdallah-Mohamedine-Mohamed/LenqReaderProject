import { useState, useEffect } from 'react';
import { Users, FileText, Eye, TrendingUp, AlertTriangle, DollarSign, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DashboardStats {
  totalSubscribers: number;
  activeSubscribers: number;
  totalEditions: number;
  publishedEditions: number;
  totalReads: number;
  readsToday: number;
  suspiciousActivity: number;
  revenue: number;
  recentActivities: Array<{
    type: string;
    message: string;
    timestamp: string;
    icon: string;
  }>;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [
        subscribersRes,
        editionsRes,
        logsRes,
        alertsRes,
        paymentsRes,
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact' }).eq('role', 'lecteur'),
        supabase.from('editions').select('*', { count: 'exact' }),
        supabase.from('logs').select('*', { count: 'exact' }),
        supabase.from('acces_suspects').select('*', { count: 'exact' }).eq('resolu', false),
        supabase.from('paiements').select('montant_fcfa').eq('statut', 'confirme'),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayLogs = await supabase
        .from('logs')
        .select('*', { count: 'exact' })
        .gte('date_access', today.toISOString());

      const activeSubscribers = (subscribersRes.data || []).filter(user => {
        if (!user.date_fin_abonnement) {
          return user.statut_abonnement === 'actif' || user.statut_abonnement === 'essai';
        }
        return new Date(user.date_fin_abonnement) >= new Date();
      });

      const publishedEditions = (editionsRes.data || []).filter(
        ed => ed.statut === 'published'
      );

      const totalRevenue = (paymentsRes.data || []).reduce(
        (sum, p) => sum + (p.montant_fcfa || 0),
        0
      );

      const recentActivities = await getRecentActivities();

      setStats({
        totalSubscribers: subscribersRes.count || 0,
        activeSubscribers: activeSubscribers.length,
        totalEditions: editionsRes.count || 0,
        publishedEditions: publishedEditions.length,
        totalReads: logsRes.count || 0,
        readsToday: todayLogs.count || 0,
        suspiciousActivity: alertsRes.count || 0,
        revenue: totalRevenue,
        recentActivities,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRecentActivities = async () => {
    const activities: Array<{
      type: string;
      message: string;
      timestamp: string;
      icon: string;
    }> = [];

    const { data: recentLogs } = await supabase
      .from('logs')
      .select('*, users(nom), pdfs(titre)')
      .order('date_access', { ascending: false })
      .limit(5);

    recentLogs?.forEach(log => {
      activities.push({
        type: 'read',
        message: `${(log as any).users?.nom || 'Utilisateur'} a lu ${(log as any).pdfs?.titre || 'une édition'}`,
        timestamp: log.date_access,
        icon: 'eye',
      });
    });

    const { data: recentAlerts } = await supabase
      .from('acces_suspects')
      .select('*, users(nom)')
      .eq('resolu', false)
      .order('created_at', { ascending: false })
      .limit(3);

    recentAlerts?.forEach(alert => {
      activities.push({
        type: 'alert',
        message: `Activité suspecte détectée: ${alert.type_alerte} - ${(alert as any).users?.nom || 'Utilisateur'}`,
        timestamp: alert.created_at,
        icon: 'alert',
      });
    });

    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        <p className="text-gray-400 mt-4">Chargement du tableau de bord...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-gray-400">
        Impossible de charger les statistiques
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Tableau de bord</h2>
        <p className="text-gray-400">Vue d'ensemble de votre plateforme</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Abonnés"
          value={stats.totalSubscribers}
          subtitle={`${stats.activeSubscribers} actifs`}
          icon={<Users className="w-6 h-6" />}
          color="blue"
          trend={stats.activeSubscribers > 0 ? '+' + Math.round((stats.activeSubscribers / stats.totalSubscribers) * 100) + '%' : ''}
        />

        <StatCard
          title="Éditions"
          value={stats.totalEditions}
          subtitle={`${stats.publishedEditions} publiées`}
          icon={<FileText className="w-6 h-6" />}
          color="green"
        />

        <StatCard
          title="Lectures"
          value={stats.totalReads}
          subtitle={`${stats.readsToday} aujourd'hui`}
          icon={<Eye className="w-6 h-6" />}
          color="amber"
          trend={stats.readsToday > 0 ? `+${stats.readsToday}` : ''}
        />

        <StatCard
          title="Revenus"
          value={`${(stats.revenue / 1000).toFixed(0)}K`}
          subtitle="FCFA"
          icon={<DollarSign className="w-6 h-6" />}
          color="purple"
        />
      </div>

      {stats.suspiciousActivity > 0 && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <div>
              <h3 className="text-red-300 font-semibold">
                {stats.suspiciousActivity} activité{stats.suspiciousActivity > 1 ? 's' : ''} suspecte{stats.suspiciousActivity > 1 ? 's' : ''}
              </h3>
              <p className="text-red-400 text-sm">
                Vérifiez l'onglet Sécurité pour plus de détails
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-amber-500" />
          Activité récente
        </h3>

        {stats.recentActivities.length === 0 ? (
          <p className="text-gray-400 text-sm">Aucune activité récente</p>
        ) : (
          <div className="space-y-3">
            {stats.recentActivities.map((activity, index) => (
              <div
                key={index}
                className="flex items-start gap-3 pb-3 border-b border-gray-700 last:border-0 last:pb-0"
              >
                <div className={`p-2 rounded-lg ${
                  activity.type === 'alert'
                    ? 'bg-red-900/30 text-red-400'
                    : 'bg-blue-900/30 text-blue-400'
                }`}>
                  {activity.icon === 'alert' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300">{activity.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(activity.timestamp).toLocaleString('fr-FR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickActionCard
          title="Publier une édition"
          description="Envoyer la dernière édition aux abonnés"
          icon={<Send className="w-5 h-5" />}
          onClick={() => {}}
        />
        <QuickActionCard
          title="Ajouter un abonné"
          description="Créer un nouveau compte abonné"
          icon={<Users className="w-5 h-5" />}
          onClick={() => {}}
        />
        <QuickActionCard
          title="Voir les alertes"
          description="Consulter les activités suspectes"
          icon={<AlertTriangle className="w-5 h-5" />}
          onClick={() => {}}
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'amber' | 'purple';
  trend?: string;
}

function StatCard({ title, value, subtitle, icon, color, trend }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-900/30 text-blue-400',
    green: 'bg-green-900/30 text-green-400',
    amber: 'bg-amber-900/30 text-amber-400',
    purple: 'bg-purple-900/30 text-purple-400',
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        {trend && (
          <span className="text-xs font-medium text-green-400 bg-green-900/30 px-2 py-1 rounded">
            {trend}
          </span>
        )}
      </div>
      <div>
        <h3 className="text-3xl font-bold text-white mb-1">{value}</h3>
        <p className="text-sm text-gray-400">{title}</p>
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

interface QuickActionCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function QuickActionCard({ title, description, icon, onClick }: QuickActionCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-amber-500 transition-colors group"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-amber-900/30 text-amber-400 group-hover:bg-amber-600 group-hover:text-black transition-colors">
          {icon}
        </div>
        <h4 className="text-white font-semibold">{title}</h4>
      </div>
      <p className="text-sm text-gray-400">{description}</p>
    </button>
  );
}
