import { useState, useEffect } from 'react';
import { LogOut, Upload, FileText, Eye, Users, DollarSign, Shield, Send, Newspaper, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { PDF } from '../lib/supabase';
import { PDFUpload } from './PDFUpload';
import { PDFList } from './PDFList';
import { AccessLogs } from './AccessLogs';
import { SubscriberManagement } from './SubscriberManagement';
import { EditionPublisher } from './EditionPublisher';
import { PaymentManagement } from './PaymentManagement';
import { SecurityAlerts } from './SecurityAlerts';
import { ArticlesManager } from './ArticlesManager';
import { Dashboard } from './Dashboard';
import { SecurityMonitor } from './SecurityMonitor';

type TabType = 'dashboard' | 'subscribers' | 'publish' | 'articles' | 'upload' | 'list' | 'payments' | 'security' | 'monitor' | 'logs';

export function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPDFs();
  }, []);

  const loadPDFs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pdfs')
        .select('*')
        .order('date_upload', { ascending: false });

      if (error) throw error;
      setPdfs(data || []);
    } catch (error) {
      console.error('Error loading PDFs:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">L'Enquêteur</h1>
              <span className="ml-3 text-sm text-gray-400">Admin</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-300">{user?.nom}</span>
              <button
                onClick={signOut}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex space-x-2 border-b border-gray-700 overflow-x-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Tableau de bord</span>
            </button>
            <button
              onClick={() => setActiveTab('subscribers')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'subscribers'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>Abonnés</span>
            </button>
            <button
              onClick={() => setActiveTab('articles')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'articles'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Newspaper className="w-5 h-5" />
              <span>Articles</span>
            </button>
            <button
              onClick={() => setActiveTab('publish')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'publish'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Send className="w-5 h-5" />
              <span>Publication</span>
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'upload'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Upload className="w-5 h-5" />
              <span>Upload</span>
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'list'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>Éditions</span>
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'payments'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <DollarSign className="w-5 h-5" />
              <span>Paiements</span>
            </button>
            <button
              onClick={() => setActiveTab('monitor')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'monitor'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span>Monitoring</span>
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'security'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span>Alertes</span>
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center space-x-2 px-4 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'logs'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <Eye className="w-5 h-5" />
              <span>Accès</span>
            </button>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'subscribers' && <SubscriberManagement />}
          {activeTab === 'articles' && <ArticlesManager />}
          {activeTab === 'publish' && <EditionPublisher />}
          {activeTab === 'upload' && <PDFUpload onUploadComplete={loadPDFs} />}
          {activeTab === 'list' && <PDFList pdfs={pdfs} loading={loading} onRefresh={loadPDFs} />}
          {activeTab === 'payments' && <PaymentManagement />}
          {activeTab === 'monitor' && <SecurityMonitor />}
          {activeTab === 'security' && <SecurityAlerts />}
          {activeTab === 'logs' && <AccessLogs />}
        </div>
      </div>
    </div>
  );
}

