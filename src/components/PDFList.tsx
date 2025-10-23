import { useState } from 'react';
import { FileText, Link2, Trash2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { PDF } from '../lib/supabase';

interface PDFListProps {
  pdfs: PDF[];
  loading: boolean;
  onRefresh: () => void;
}

export function PDFList({ pdfs, loading, onRefresh }: PDFListProps) {
  const { user } = useAuth();
  const [generating, setGenerating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const generateLink = async (pdfId: string) => {
    if (!user) {
      alert('Vous devez être connecté');
      return;
    }

    setGenerating(pdfId);
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

      if (authError) {
        console.error('Auth error:', authError);
        throw new Error(`Erreur d'authentification: ${authError.message}`);
      }

      if (!authUser) {
        throw new Error('Session expirée, veuillez vous reconnecter');
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error } = await supabase
        .from('tokens')
        .insert({
          pdf_id: pdfId,
          user_id: authUser.id,
          token,
          expires_at: expiresAt.toISOString(),
          used: false
        });

      if (error) {
        console.error('Insert error:', error);
        throw new Error(`Erreur d'insertion: ${error.message}`);
      }

      const link = `${window.location.origin}/read/${token}`;
      setGeneratedLink(link);

      try {
        await navigator.clipboard.writeText(link);
        setCopiedToken(token);
        setTimeout(() => {
          setCopiedToken(null);
          setGeneratedLink(null);
        }, 5000);
      } catch (clipboardError) {
        console.warn('Clipboard API failed, showing link instead:', clipboardError);
      }
    } catch (error: any) {
      console.error('Error generating link:', error);
      alert(error.message || 'Erreur lors de la génération du lien');
    } finally {
      setGenerating(null);
    }
  };

  const deletePDF = async (pdf: PDF) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer "${pdf.titre}" ?`)) return;

    setDeleting(pdf.id);
    try {
      const { error: storageError } = await supabase.storage
        .from('secure-pdfs')
        .remove([pdf.url_fichier]);

      if (storageError) console.error('Storage error:', storageError);

      const { error: dbError } = await supabase
        .from('pdfs')
        .delete()
        .eq('id', pdf.id);

      if (dbError) throw dbError;

      onRefresh();
    } catch (error) {
      console.error('Error deleting PDF:', error);
      alert('Erreur lors de la suppression');
    } finally {
      setDeleting(null);
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

  if (pdfs.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">Aucun journal téléversé</p>
      </div>
    );
  }

  return (
    <div>
      {generatedLink && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-amber-500 rounded-lg p-6 max-w-lg w-full">
            <h3 className="text-white font-bold mb-4 text-lg">Lien généré avec succès !</h3>
            <div className="bg-gray-900 border border-gray-700 rounded p-3 mb-4 break-all">
              <p className="text-amber-400 text-sm">{generatedLink}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedLink).catch(() => {});
                  alert('Lien copié !');
                }}
                className="flex-1 px-4 py-2 bg-amber-600 text-black font-medium rounded-lg hover:bg-amber-700 transition-colors"
              >
                Copier le lien
              </button>
              <button
                onClick={() => setGeneratedLink(null)}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold text-white mb-6">
        Journaux téléversés ({pdfs.length})
      </h2>

      <div className="space-y-4">
        {pdfs.map((pdf) => (
          <div
            key={pdf.id}
            className="bg-gray-700 border border-gray-600 rounded-lg p-4 hover:border-amber-500 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <FileText className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-semibold text-white">{pdf.titre}</h3>
                </div>
                <p className="text-sm text-gray-400">
                  Téléversé le {new Date(pdf.date_upload).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => generateLink(pdf.id)}
                  disabled={generating === pdf.id}
                  className="flex items-center space-x-2 px-4 py-2 bg-amber-600 text-black font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copiedToken && generating === pdf.id ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Copié !</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4" />
                      <span>
                        {generating === pdf.id ? 'Génération...' : 'Générer lien'}
                      </span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => deletePDF(pdf)}
                  disabled={deleting === pdf.id}
                  className="p-2 bg-red-900/50 text-red-400 rounded-lg hover:bg-red-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
