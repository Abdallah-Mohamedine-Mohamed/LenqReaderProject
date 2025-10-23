import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, BookOpen, Clock, Bookmark, BookmarkCheck, List, Grid, Maximize, Type, Settings, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Edition, Page, Article } from '../lib/supabase';

interface MagazineReaderProps {
  editionId: string;
  userId: string;
}

export function MagazineReader({ editionId, userId }: MagazineReaderProps) {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [readArticles, setReadArticles] = useState<Set<string>>(new Set());
  const [bookmarkedArticles, setBookmarkedArticles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'page' | 'list'>('page');
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadEditionData();
    loadReadingProgress();
  }, [editionId, userId]);

  const loadEditionData = async () => {
    try {
      const { data: editionData, error: editionError } = await supabase
        .from('editions')
        .select('*')
        .eq('id', editionId)
        .single();

      if (editionError) throw editionError;
      setEdition(editionData);

      const { data: pagesData, error: pagesError } = await supabase
        .from('pages')
        .select('*')
        .eq('edition_id', editionId)
        .order('page_number');

      if (pagesError) throw pagesError;
      setPages(pagesData || []);

      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .eq('edition_id', editionId)
        .order('ordre_lecture');

      if (articlesError) throw articlesError;
      setArticles(articlesData || []);
    } catch (error) {
      console.error('Error loading edition:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReadingProgress = async () => {
    try {
      const { data, error } = await supabase
        .from('lectures_articles')
        .select('article_id, bookmarked')
        .eq('user_id', userId);

      if (error) throw error;

      const read = new Set<string>();
      const bookmarked = new Set<string>();

      data?.forEach((lecture) => {
        read.add(lecture.article_id);
        if (lecture.bookmarked) {
          bookmarked.add(lecture.article_id);
        }
      });

      setReadArticles(read);
      setBookmarkedArticles(bookmarked);
    } catch (error) {
      console.error('Error loading reading progress:', error);
    }
  };

  const currentPage = pages[currentPageIndex];
  const pageArticles = articles.filter((a) => a.page_id === currentPage?.id);

  const openArticle = async (article: Article) => {
    setSelectedArticle(article);

    await supabase.from('lectures_articles').upsert(
      {
        user_id: userId,
        article_id: article.id,
        complete: false,
        bookmarked: bookmarkedArticles.has(article.id),
      },
      { onConflict: 'user_id,article_id' }
    );

    setReadArticles((prev) => new Set(prev).add(article.id));
  };

  const closeArticle = () => {
    setSelectedArticle(null);
  };

  const toggleBookmark = async (article: Article) => {
    const isBookmarked = bookmarkedArticles.has(article.id);

    await supabase
      .from('lectures_articles')
      .upsert(
        {
          user_id: userId,
          article_id: article.id,
          bookmarked: !isBookmarked,
          complete: false,
        },
        { onConflict: 'user_id,article_id' }
      );

    setBookmarkedArticles((prev) => {
      const newSet = new Set(prev);
      if (isBookmarked) {
        newSet.delete(article.id);
      } else {
        newSet.add(article.id);
      }
      return newSet;
    });
  };

  const goToNextArticle = () => {
    if (!selectedArticle) return;
    const currentIndex = articles.findIndex((a) => a.id === selectedArticle.id);
    if (currentIndex < articles.length - 1) {
      openArticle(articles[currentIndex + 1]);
    }
  };

  const goToPreviousArticle = () => {
    if (!selectedArticle) return;
    const currentIndex = articles.findIndex((a) => a.id === selectedArticle.id);
    if (currentIndex > 0) {
      openArticle(articles[currentIndex - 1]);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const progress = pages.length > 0 ? ((currentPageIndex + 1) / pages.length) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-amber-500/20 border-t-amber-500 mb-6"></div>
          <p className="text-gray-300 text-lg font-medium">Chargement de l'édition...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-lg border-b border-slate-800 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 truncate">{edition?.titre}</h1>
              <div className="flex items-center gap-3 text-gray-400 text-sm">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  {pages.length} pages
                </span>
                <span>•</span>
                <span>{articles.length} articles</span>
                <span>•</span>
                <span className="text-green-400 font-medium">{readArticles.size}/{articles.length} lus</span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => setViewMode(viewMode === 'page' ? 'list' : 'page')}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all duration-200 hover:scale-105"
                title={viewMode === 'page' ? 'Vue liste' : 'Vue page'}
              >
                {viewMode === 'page' ? <List className="w-5 h-5" /> : <Grid className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all duration-200 hover:scale-105"
                title="Paramètres de lecture"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all duration-200 hover:scale-105"
                title="Plein écran"
              >
                <Maximize className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Eye className="w-6 h-6 text-amber-500" />
                Paramètres de lecture
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="flex items-center justify-between text-white mb-3">
                  <span className="flex items-center gap-2">
                    <Type className="w-5 h-5 text-amber-500" />
                    Taille du texte
                  </span>
                  <span className="text-amber-500 font-semibold">{fontSize}px</span>
                </label>
                <input
                  type="range"
                  min="14"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-white mb-3">
                  <span>Interligne</span>
                  <span className="text-amber-500 font-semibold">{lineHeight.toFixed(1)}</span>
                </label>
                <input
                  type="range"
                  min="1.4"
                  max="2.2"
                  step="0.1"
                  value={lineHeight}
                  onChange={(e) => setLineHeight(Number(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
              <button
                onClick={() => {
                  setFontSize(18);
                  setLineHeight(1.8);
                }}
                className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {viewMode === 'page' && currentPage && (
          <div className="relative">
            <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
              <div className="relative group">
                {currentPage.image_url ? (
                  <img
                    src={currentPage.image_url}
                    alt={`Page ${currentPage.page_number}`}
                    className="w-full h-auto"
                  />
                ) : (
                  <div className="w-full aspect-[8.5/11] bg-slate-800 flex items-center justify-center">
                    <p className="text-gray-500 text-lg">Image de page non disponible</p>
                  </div>
                )}

                {pageArticles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => openArticle(article)}
                    className="absolute border-2 border-transparent hover:border-amber-400 hover:bg-amber-500/20 transition-all duration-300 cursor-pointer group/article rounded-sm"
                    style={{
                      left: `${article.position_x * 100}%`,
                      top: `${article.position_y * 100}%`,
                      width: `${article.width * 100}%`,
                      height: `${article.height * 100}%`,
                    }}
                    title={article.titre}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 to-amber-500/0 group-hover/article:from-amber-500/30 group-hover/article:to-orange-500/30 transition-all duration-300 flex items-center justify-center">
                      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg opacity-0 group-hover/article:opacity-100 transition-opacity duration-300 transform group-hover/article:scale-105">
                        {article.titre}
                      </div>
                    </div>
                    {readArticles.has(article.id) && (
                      <div className="absolute top-2 right-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white p-1.5 rounded-full shadow-lg">
                        <BookOpen className="w-3.5 h-3.5" />
                      </div>
                    )}
                    {bookmarkedArticles.has(article.id) && (
                      <div className="absolute top-2 left-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white p-1.5 rounded-full shadow-lg">
                        <Bookmark className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6">
              <button
                onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
                disabled={currentPageIndex === 0}
                className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 shadow-lg font-medium"
              >
                <ChevronLeft className="w-5 h-5" />
                Page précédente
              </button>

              <div className="flex items-center gap-3">
                <span className="text-white font-semibold text-lg">
                  Page {currentPageIndex + 1}
                </span>
                <span className="text-gray-500">/</span>
                <span className="text-gray-400">{pages.length}</span>
              </div>

              <button
                onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
                disabled={currentPageIndex === pages.length - 1}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 shadow-lg font-medium"
              >
                Page suivante
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {viewMode === 'list' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white mb-6">Tous les articles</h2>
            <div className="grid gap-4">
              {articles.map((article, index) => (
                <button
                  key={article.id}
                  onClick={() => openArticle(article)}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-amber-500/50 transition-all duration-300 text-left group hover:shadow-xl hover:shadow-amber-500/10"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-semibold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full">
                          #{index + 1}
                        </span>
                        {readArticles.has(article.id) && (
                          <span className="text-xs font-medium text-green-400 bg-green-500/10 px-3 py-1 rounded-full flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            Lu
                          </span>
                        )}
                        {bookmarkedArticles.has(article.id) && (
                          <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full flex items-center gap-1">
                            <Bookmark className="w-3 h-3" />
                            Favori
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-amber-400 transition-colors">{article.titre}</h3>
                      {article.sous_titre && (
                        <p className="text-gray-300 text-base mb-3 italic">{article.sous_titre}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                        {article.auteur && (
                          <span className="flex items-center gap-1 text-amber-400 font-medium">
                            Par {article.auteur}
                          </span>
                        )}
                        {article.categorie && (
                          <span className="px-2 py-1 bg-slate-800 text-amber-400 rounded">
                            {article.categorie}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {Math.ceil(article.temps_lecture_estime / 60)} min
                        </span>
                        {article.extraction_method === 'textract' && (
                          <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs font-medium">
                            Extraction IA
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 text-gray-600 group-hover:text-amber-500 transition-colors flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedArticle && (
        <ArticleModal
          article={selectedArticle}
          userId={userId}
          isBookmarked={bookmarkedArticles.has(selectedArticle.id)}
          onClose={closeArticle}
          onToggleBookmark={() => toggleBookmark(selectedArticle)}
          onNext={goToNextArticle}
          onPrevious={goToPreviousArticle}
          hasNext={articles.findIndex((a) => a.id === selectedArticle.id) < articles.length - 1}
          hasPrevious={articles.findIndex((a) => a.id === selectedArticle.id) > 0}
        />
      )}
    </div>
  );
}

interface ArticleModalProps {
  article: Article;
  userId: string;
  isBookmarked: boolean;
  onClose: () => void;
  onToggleBookmark: () => void;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
}

function ArticleModal({
  article,
  userId,
  isBookmarked,
  onClose,
  onToggleBookmark,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
}: ArticleModalProps) {
  const [startTime] = useState(Date.now());
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight] = useState(1.8);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    return () => {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      supabase.from('lectures_articles').upsert(
        {
          user_id: userId,
          article_id: article.id,
          temps_lecture_secondes: timeSpent,
          complete: timeSpent > 10,
          pourcentage_lu: 100,
        },
        { onConflict: 'user_id,article_id' }
      );
    };
  }, []);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrevious) onPrevious();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [hasNext, hasPrevious]);

  return (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl max-w-4xl w-full my-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseMove={() => setShowControls(true)}
      >
        <div className={`sticky top-0 bg-slate-900/95 backdrop-blur-lg border-b border-slate-800 p-5 flex items-center justify-between transition-all duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={onPrevious}
              disabled={!hasPrevious}
              className="p-2.5 hover:bg-slate-800 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>

            <button
              onClick={onNext}
              disabled={!hasNext}
              className="p-2.5 hover:bg-slate-800 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>

            <div className="hidden sm:flex items-center gap-2 ml-4">
              <button
                onClick={() => setFontSize(prev => Math.max(14, prev - 1))}
                className="p-2 hover:bg-slate-800 rounded-lg transition-all text-white"
                title="Réduire la taille"
              >
                <Type className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400 font-medium min-w-[3rem] text-center">{fontSize}px</span>
              <button
                onClick={() => setFontSize(prev => Math.min(24, prev + 1))}
                className="p-2 hover:bg-slate-800 rounded-lg transition-all text-white"
                title="Augmenter la taille"
              >
                <Type className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleBookmark}
              className={`p-2.5 rounded-xl transition-all duration-200 hover:scale-105 ${
                isBookmarked
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30'
                  : 'hover:bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              {isBookmarked ? (
                <BookmarkCheck className="w-5 h-5" />
              ) : (
                <Bookmark className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2.5 hover:bg-slate-800 rounded-xl transition-all duration-200 hover:scale-105"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        <div className="p-8 sm:p-12 max-w-3xl mx-auto">
          <div className="mb-10">
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6 leading-tight">{article.titre}</h2>

            {article.sous_titre && (
              <h3 className="text-xl sm:text-2xl font-medium text-slate-300 mb-6 leading-relaxed italic">
                {article.sous_titre}
              </h3>
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm mb-6">
              {article.auteur && (
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold text-lg">
                    {article.auteur.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Par</p>
                    <p className="text-slate-200 font-medium">{article.auteur}</p>
                  </div>
                </div>
              )}
              {article.categorie && (
                <span className="px-3 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 rounded-full font-medium border border-amber-500/30">
                  {article.categorie}
                </span>
              )}
              <span className="flex items-center gap-2 text-gray-400">
                <Clock className="w-4 h-4" />
                <span className="font-medium">{Math.ceil(article.temps_lecture_estime / 60)} min de lecture</span>
              </span>
            </div>
          </div>

          <div className="prose prose-invert prose-lg max-w-none">
            <div
              className="text-gray-200 leading-relaxed selection:bg-amber-500/30 selection:text-white"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: lineHeight,
                letterSpacing: '0.01em'
              }}
            >
              {article.contenu_texte.split('\n\n').map((paragraph, index) => (
                <p key={index} className="mb-6 first-letter:text-5xl first-letter:font-bold first-letter:text-amber-500 first-letter:mr-2 first-letter:float-left first:first-letter:leading-none">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-800">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                onClick={onPrevious}
                disabled={!hasPrevious}
                className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 font-medium shadow-lg w-full sm:w-auto justify-center"
              >
                <ChevronLeft className="w-5 h-5" />
                Article précédent
              </button>

              <button
                onClick={onNext}
                disabled={!hasNext}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 shadow-lg shadow-amber-500/30 w-full sm:w-auto justify-center"
              >
                Article suivant
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
