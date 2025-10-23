import { useEffect, useState } from 'react';
import {
  Upload,
  FileText,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Newspaper,
  List,
  X,
  PenSquare,
  Trash2,
} from 'lucide-react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Edition, Article } from '../lib/supabase';
import { ArticleZoneEditor } from './ArticleZoneEditor';

GlobalWorkerOptions.workerSrc = pdfjsWorker;

const statusLabels: Record<string, string> = {
  draft: 'Brouillon',
  processing: 'En cours',
  ready: 'Pret',
  published: 'Publie',
  archived: 'Archive',
};

const getStatusColor = (statut: string) => {
  switch (statut) {
    case 'published':
      return 'bg-green-900/50 text-green-300 border-green-700';
    case 'ready':
      return 'bg-blue-900/50 text-blue-300 border-blue-700';
    case 'processing':
      return 'bg-amber-900/50 text-amber-300 border-amber-700';
    default:
      return 'bg-gray-900/50 text-gray-400 border-gray-700';
  }
};

const getStatusIcon = (statut: string) => {
  switch (statut) {
    case 'published':
      return <CheckCircle className="w-4 h-4" />;
    case 'ready':
      return <Eye className="w-4 h-4" />;
    case 'processing':
      return <Loader2 className="w-4 h-4 animate-spin" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
};

export function ArticlesManager() {
  const { user } = useAuth();
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editionTitle, setEditionTitle] = useState('');
  const [editionNumber, setEditionNumber] = useState('');
  const [editionDate, setEditionDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewingEditionId, setViewingEditionId] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [editingEditionId, setEditingEditionId] = useState<string | null>(null);
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(null);
  const [clearingEditionId, setClearingEditionId] = useState<string | null>(null);

  useEffect(() => {
    loadEditions();
  }, []);

  const loadEditions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('editions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEditions(data || []);
    } catch (error) {
      console.error('Error loading editions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadArticles = async (editionId: string) => {
    setLoadingArticles(true);
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('edition_id', editionId)
        .order('ordre_lecture', { ascending: true });

      if (error) throw error;
      setArticles(data || []);
      setViewingEditionId(editionId);
    } catch (error) {
      console.error('Error loading articles:', error);
      alert('Erreur lors du chargement des articles');
    } finally {
      setLoadingArticles(false);
    }
  };

  const closeArticlesView = () => {
    setViewingEditionId(null);
    setArticles([]);
  };

  const openEditor = (editionId: string) => {
    setEditingEditionId(editionId);
  };

  const handleEditorClose = (refresh?: boolean) => {
    const lastEdited = editingEditionId;
    setEditingEditionId(null);

    if (refresh && lastEdited) {
      if (viewingEditionId === lastEdited) {
        loadArticles(lastEdited);
      }
      loadEditions();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.type !== 'application/pdf') {
      alert('Veuillez selectionner un fichier PDF');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (!editionTitle) {
      setEditionTitle(file.name.replace(/\.pdf$/i, ''));
    }
  };

  const handleUploadAndAnnotate = async () => {
    if (!selectedFile || !editionTitle) {
      alert('Veuillez remplir tous les champs requis');
      return;
    }

    setUploading(true);

    try {
      const storageBucket = 'secure-pdfs';
      const fileName = `${Date.now()}_${selectedFile.name}`;
      const filePath = `editions/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(storageBucket)
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: pdfRecord, error: pdfInsertError } = await supabase
        .from('pdfs')
        .insert({
          titre: editionTitle,
          url_fichier: filePath,
          uploaded_by: user?.id || null,
          date_edition: editionDate || null,
          numero_edition: editionNumber ? parseInt(editionNumber, 10) : null,
          statut_publication: 'brouillon',
        } as any)
        .select()
        .single();

      if (pdfInsertError) throw pdfInsertError;

      const { data: editionData, error: editionError } = await supabase
        .from('editions')
        .insert({
          titre: editionTitle,
          numero_edition: editionNumber ? parseInt(editionNumber, 10) : null,
          date_edition: editionDate,
          pdf_url: filePath,
          statut: 'draft',
          created_by: user?.id,
          nb_pages: 0,
        })
        .select()
        .single();

      if (editionError) throw editionError;

      if (pdfRecord?.id) {
        const { error: linkError } = await supabase
          .from('pdfs')
          .update({ edition_id: editionData.id } as any)
          .eq('id', pdfRecord.id);

        if (linkError) {
          console.warn('Impossible de lier le PDF a l edition', linkError);
        }
      }

      try {
        const pdfBytes = await selectedFile.arrayBuffer();
        const pdfDoc = await getDocument({ data: pdfBytes }).promise;
        const totalPages = pdfDoc.numPages;

        if (totalPages > 0) {
          const pageRows = Array.from({ length: totalPages }, (_, index) => ({
            edition_id: editionData.id,
            page_number: index + 1,
          }));

          const { error: pagesError } = await supabase.from('pages').insert(pageRows);
          if (pagesError) {
            console.warn('Erreur lors de la creation des pages', pagesError);
          } else {
            await supabase
              .from('editions')
              .update({ nb_pages: totalPages })
              .eq('id', editionData.id);
          }
        }
      } catch (pdfError) {
        console.warn('Impossible de lire le PDF localement', pdfError);
      }

      alert('PDF televerse avec succes. Lancez l annotation manuelle.');
      setEditingEditionId(editionData.id);

      setSelectedFile(null);
      setEditionTitle('');
      setEditionNumber('');
      setEditionDate(new Date().toISOString().split('T')[0]);

      loadEditions();
    } catch (error) {
      console.error('Error uploading and preparing edition:', error);
      alert('Erreur: ' + (error instanceof Error ? error.message : 'Erreur inconnue'));
    } finally {
      setUploading(false);
    }
  };

  const deleteArticleRecord = async (articleId: string) => {
    if (!confirm('Etes-vous sur de vouloir supprimer cet article ?')) {
      return;
    }

    setDeletingArticleId(articleId);
    try {
      const { error } = await supabase.from('articles').delete().eq('id', articleId);
      if (error) throw error;

      setArticles((prev) => prev.filter((article) => article.id !== articleId));
    } catch (error) {
      console.error('Error deleting article:', error);
      alert('Erreur lors de la suppression de l article');
    } finally {
      setDeletingArticleId(null);
    }
  };

  const deleteEditionArticles = async (editionId: string) => {
    if (!confirm('Supprimer tous les extraits de cette edition ?')) {
      return;
    }

    setClearingEditionId(editionId);
    try {
      const { error } = await supabase.from('articles').delete().eq('edition_id', editionId);
      if (error) throw error;

      if (viewingEditionId === editionId) {
        setArticles([]);
      }
    } catch (error) {
      console.error('Error deleting edition articles:', error);
      alert('Erreur lors de la suppression des extraits');
    } finally {
      setClearingEditionId(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-4" />
        <p className="text-gray-400">Chargement des editions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
          <Newspaper className="w-7 h-7 text-amber-500" />
          Gestion des editions
        </h2>
        <p className="text-gray-400">
          Televersement des journaux et annotation manuelle des articles.
        </p>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-amber-500" />
          Nouvelle edition
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Titre de l edition *
            </label>
            <input
              type="text"
              value={editionTitle}
              onChange={(e) => setEditionTitle(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
              placeholder="Ex: L'Enqueteur - edition du 14 Octobre 2024"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Numero d edition
              </label>
              <input
                type="number"
                value={editionNumber}
                onChange={(e) => setEditionNumber(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                placeholder="Ex: 245"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Date d edition
              </label>
              <input
                type="date"
                value={editionDate}
                onChange={(e) => setEditionDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Fichier PDF *
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-amber-600 file:text-black hover:file:bg-amber-700"
            />
            {selectedFile && (
              <p className="text-sm text-gray-400 mt-2">
                Fichier selectionne: {selectedFile.name} (
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <p className="font-medium mb-1">Annotation manuelle des zones</p>
                <p className="text-blue-300">
                  Une fois le PDF televerse, lancez l outil d annotation pour dessiner vos hotspots
                  page par page, saisir le contenu correspondant et confirmer l edition.
                </p>
                <ul className="mt-2 space-y-1 text-blue-300">
                  <li>- Tracez un rectangle pour chaque article.</li>
                  <li>- Renseignez titre, texte et image manuellement.</li>
                  <li>- Parcourez toutes les pages du journal.</li>
                  <li>- Confirmez vos annotations pour preparer la publication.</li>
                </ul>
              </div>
            </div>
          </div>

          <button
            onClick={handleUploadAndAnnotate}
            disabled={!selectedFile || !editionTitle || uploading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-amber-600 text-black font-semibold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Preparation en cours...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Televerser et annoter
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h3 className="text-white font-semibold mb-4">Editions existantes</h3>

        {editions.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Aucune edition pour le moment</p>
            <p className="text-gray-500 text-sm mt-1">Uploadez votre premiere edition ci-dessus</p>
          </div>
        ) : (
          <div className="space-y-3">
            {editions.map((edition) => (
              <div
                key={edition.id}
                className="bg-gray-700 border border-gray-600 rounded-lg p-4 hover:border-amber-500 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-white font-semibold">{edition.titre}</h4>
                      <span
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${getStatusColor(
                          edition.statut
                        )}`}
                      >
                        {getStatusIcon(edition.statut)}
                        {statusLabels[edition.statut] || edition.statut}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-gray-300 mb-3">
                      {edition.numero_edition && (
                        <div>No {edition.numero_edition}</div>
                      )}
                      {edition.date_edition && (
                        <div>{new Date(edition.date_edition).toLocaleDateString('fr-FR')}</div>
                      )}
                      {edition.nb_pages > 0 && (
                        <div>{edition.nb_pages} pages</div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(edition.statut === 'ready' || edition.statut === 'published') && (
                        <button
                          onClick={() => loadArticles(edition.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-black font-medium rounded-lg hover:bg-amber-700 transition-colors text-sm"
                        >
                          <List className="w-4 h-4" />
                          Voir les articles extraits
                        </button>
                      )}

                      <button
                        onClick={() => openEditor(edition.id)}
                        className="flex items-center gap-2 rounded-lg border border-amber-600 px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/10"
                      >
                        <PenSquare className="w-4 h-4" />
                        Annoter les pages
                      </button>

                      <button
                        onClick={() => deleteEditionArticles(edition.id)}
                        disabled={clearingEditionId === edition.id}
                        className="flex items-center gap-2 rounded-lg border border-red-700 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-900/40 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {clearingEditionId === edition.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        Supprimer extraits
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingEditionId && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <List className="w-6 h-6 text-amber-500" />
                Articles extraits ({articles.length})
              </h3>
              <button
                onClick={closeArticlesView}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              {loadingArticles ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-4" />
                  <p className="text-gray-400">Chargement des articles...</p>
                </div>
              ) : articles.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">Aucun article trouve</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {articles.map((article, index) => (
                    <div
                      key={article.id}
                      className="bg-gray-700 border border-gray-600 rounded-lg p-4 hover:border-amber-500 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-amber-600 text-black rounded-lg flex items-center justify-center font-bold text-lg">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-white font-semibold mb-1">{article.titre}</h4>
                          {article.sous_titre && (
                            <p className="text-amber-400 text-sm mb-2 italic">
                              {article.sous_titre}
                            </p>
                          )}
                          {article.auteur && (
                            <p className="text-gray-400 text-xs mb-2">Par {article.auteur}</p>
                          )}
                          <p className="text-gray-300 text-sm mb-3 line-clamp-2">
                            {article.contenu_texte}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <div className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {article.mots_count} mots
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {Math.ceil((article.temps_lecture_estime || 0) / 60)} min de lecture
                            </div>
                          </div>
                          <div className="mt-4 flex justify-end">
                            <button
                              onClick={() => deleteArticleRecord(article.id)}
                              disabled={
                                deletingArticleId === article.id ||
                                clearingEditionId === article.edition_id
                              }
                              className="flex items-center gap-2 rounded-lg border border-red-700 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-900/40 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {deletingArticleId === article.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                              Supprimer
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={closeArticlesView}
                className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {editingEditionId && (
        <ArticleZoneEditor editionId={editingEditionId} onClose={handleEditorClose} />
      )}
    </div>
  );
}
