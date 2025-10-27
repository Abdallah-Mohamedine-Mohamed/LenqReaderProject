import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Clock,
  FileText,
  ArrowLeft,
  Type,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Article {
  id: string;
  titre: string;
  sous_titre: string | null;
  auteur: string | null;
  contenu_texte: string;
  temps_lecture_estime: number;
  ordre_lecture: number;
  extraction_method: string;
  textract_confidence?: number;
  mots_count?: number;
}

interface ArticleReaderProps {
  editionId: string;
  userId: string;
  userName: string;
  userNumber: string;
  sessionId: string;
  onBackToPDF: () => void;
  initialArticleId?: string | null;
  onArticleChange?: (articleId: string) => void;
  editionLabel?: string;
}

export function ArticleReader({
  editionId,
  userId,
  userName,
  userNumber,
  sessionId,
  onBackToPDF,
  initialArticleId,
  onArticleChange,
  editionLabel,
}: ArticleReaderProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readArticles, setReadArticles] = useState<Set<string>>(new Set());
  const [articleProgress, setArticleProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const articleStartTimeRef = useRef(Date.now());
  const syncingFromPropRef = useRef(false);
  const previousArticleIdRef = useRef<string | null>(null);
  const articleContentRef = useRef<HTMLDivElement | null>(null);
  const articleProgressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const hideControlsTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    loadArticles();
  }, [editionId]);

  useEffect(() => {
    if (!articles.length || !initialArticleId) {
      return;
    }

    const index = articles.findIndex(article => article.id === initialArticleId);
    if (index < 0) {
      return;
    }

    if (
      previousArticleIdRef.current &&
      initialArticleId === previousArticleIdRef.current &&
      index !== currentIndex
    ) {
      return;
    }

    if (index !== currentIndex) {
      syncingFromPropRef.current = true;
      setCurrentIndex(index);
    }
  }, [articles, initialArticleId, currentIndex]);

  useEffect(() => {
    if (isMobile) {
      setShowControls(true);
      startHideControlsTimer();
    }
  }, [isMobile]);

  const startHideControlsTimer = () => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    hideControlsTimeout.current = setTimeout(() => {
      if (isMobile) {
        setShowControls(false);
      }
    }, 3000);
  };

  const handleUserInteraction = () => {
    if (isMobile) {
      setShowControls(true);
      startHideControlsTimer();
    }
  };

  const currentArticle = articles[currentIndex];
  const currentArticleId = currentArticle?.id;

  const updateArticleProgress = useCallback(() => {
    if (typeof window === 'undefined') return;

    const element = articleContentRef.current;
    if (!element) {
      if (articleProgressRef.current !== 0) {
        articleProgressRef.current = 0;
        setArticleProgress(0);
      }
      return;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 1;
    const articleHeight = element.offsetHeight || 1;

    let nextProgress = 0;

    if (rect.top >= 0) {
      nextProgress = 0;
    } else if (rect.bottom <= viewportHeight) {
      nextProgress = 100;
    } else {
      const maxScrollable = Math.max(articleHeight - viewportHeight, 1);
      nextProgress = Math.min(Math.max(-rect.top / maxScrollable, 0), 1) * 100;
    }

    const clamped = Math.max(0, Math.min(100, Number(nextProgress.toFixed(2))));
    if (Math.abs(clamped - articleProgressRef.current) > 0.5) {
      articleProgressRef.current = clamped;
      setArticleProgress(clamped);
    }
  }, []);

  const scheduleProgressUpdate = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = window.requestAnimationFrame(updateArticleProgress);
  }, [updateArticleProgress]);

  useEffect(() => {
    if (!currentArticleId) return;

    const article = articles.find(item => item.id === currentArticleId);
    if (!article) return;

    const isSameArticle =
      previousArticleIdRef.current === currentArticleId && !syncingFromPropRef.current;

    const isSyncingToTarget =
      syncingFromPropRef.current &&
      initialArticleId &&
      currentArticleId !== initialArticleId;

    if (isSyncingToTarget) {
      return;
    }

    if (isSameArticle) {
      return;
    }

    trackArticleView(article);

    if (syncingFromPropRef.current) {
      syncingFromPropRef.current = false;
    } else {
      onArticleChange?.(currentArticleId);
    }

    previousArticleIdRef.current = currentArticleId;
    articleStartTimeRef.current = Date.now();

    if (articleContentRef.current) {
      articleContentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return () => {
      logReadingTime(article);
    };
  }, [currentArticleId, articles, initialArticleId, onArticleChange]);

  useEffect(() => {
    scheduleProgressUpdate();
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', scheduleProgressUpdate, { passive: true });
      window.addEventListener('resize', scheduleProgressUpdate);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', scheduleProgressUpdate);
        window.removeEventListener('resize', scheduleProgressUpdate);
        if (rafRef.current !== null) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      }
    };
  }, [scheduleProgressUpdate]);

  useEffect(() => {
    articleProgressRef.current = 0;
    setArticleProgress(0);
    scheduleProgressUpdate();
  }, [currentArticleId, scheduleProgressUpdate]);

  useEffect(() => {
    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, []);

  const loadArticles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('edition_id', editionId)
        .order('ordre_lecture', { ascending: true });

      if (error) throw error;
      setArticles(data || []);

      const { data: lecturesData } = await supabase
        .from('lectures_articles')
        .select('article_id')
        .eq('user_id', userId);

      if (lecturesData) {
        setReadArticles(new Set(lecturesData.map(l => l.article_id)));
      }
    } catch (error) {
      console.error('Error loading articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const trackArticleView = async (article: Article) => {
    try {
      await supabase.from('lectures_articles').upsert(
        {
          user_id: userId,
          article_id: article.id,
          complete: false,
        },
        { onConflict: 'user_id,article_id' }
      );

      setReadArticles(prev => new Set(prev).add(article.id));
    } catch (error) {
      console.error('Error tracking article view:', error);
    }
  };

  const logReadingTime = async (article: Article) => {
    const timeSpent = Math.floor((Date.now() - articleStartTimeRef.current) / 1000);
    if (timeSpent < 5) return;

    try {
      await supabase.from('lectures_articles').upsert(
        {
          user_id: userId,
          article_id: article.id,
          temps_lecture_secondes: timeSpent,
          complete: timeSpent > 30,
          pourcentage_lu: 100,
        },
        { onConflict: 'user_id,article_id' }
      );
    } catch (error) {
      console.error('Error logging reading time:', error);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const progress =
    articles.length > 0
      ? ((currentIndex + articleProgress / 100) / articles.length) * 100
      : 0;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < articles.length - 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-full border-4 border-gray-200 border-t-blue-600 animate-spin" />
          <p className="text-gray-700 text-sm sm:text-base font-medium">Chargement des articles...</p>
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 shadow-xl rounded-3xl px-8 py-10 text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Aucun article disponible</h2>
          <p className="text-sm text-gray-600 mb-6">
            Cette edition n'a pas encore ete traitee pour l'extraction d'articles.
          </p>
          <button
            onClick={onBackToPDF}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-gray-200 bg-white text-gray-700 font-medium shadow-sm hover:shadow transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au PDF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen bg-white text-gray-900"
      onClick={isMobile ? handleUserInteraction : undefined}
    >
      {/* Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 transition-all duration-300 ${
          isMobile && !showControls ? '-translate-y-full' : 'translate-y-0'
        }`}
      >
        <div className="max-w-5xl mx-auto h-14 md:h-16 px-4 lg:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
            <button
              onClick={onBackToPDF}
              className="h-10 w-10 rounded-full border border-gray-200 bg-white text-gray-700 flex items-center justify-center shadow-sm hover:shadow-md transition hover:-translate-x-0.5"
              title="Retour au PDF"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              {!isMobile && (
                <span className="inline-flex px-3 py-1 rounded-full border border-gray-200 bg-white text-gray-700 font-semibold text-xs sm:text-sm uppercase tracking-[0.18em]">
                  L ENQUETEUR
                </span>
              )}
              {editionLabel && (
                <span className="text-xs sm:text-sm md:text-base font-medium text-gray-900 truncate">
                  {editionLabel}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 text-xs sm:text-sm font-medium">
            {!isMobile && (
              <div className="hidden sm:flex items-center gap-2 text-gray-700">
                <BookOpen className="w-4 h-4" />
                <span>
                  Article {currentIndex + 1} / {articles.length}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                disabled={fontSize <= 14}
                className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Réduire la taille"
              >
                <Type className="w-3 h-3 md:w-4 md:h-4 text-gray-700" />
              </button>
              <span className="text-xs md:text-sm text-gray-600 font-medium px-1 min-w-[2rem] text-center">
                {fontSize}
              </span>
              <button
                onClick={() => setFontSize(prev => Math.min(28, prev + 2))}
                disabled={fontSize >= 28}
                className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Augmenter la taille"
              >
                <Type className="w-4 h-4 md:w-5 md:h-5 text-gray-700" />
              </button>
            </div>

            {!isMobile && (
              <button
                onClick={toggleFullscreen}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-5 h-5 text-gray-700" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-gray-700" />
                )}
              </button>
            )}
          </div>
        </div>
        <div className="h-1 bg-gray-200">
          <div
            className="h-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Navigation Buttons Desktop */}
      {!isMobile && hasPrevious && (
        <button
          type="button"
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          className="fixed left-6 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 px-3 py-4 rounded-full bg-white border border-gray-200 text-gray-700 shadow-lg hover:-translate-x-1 hover:shadow-xl transition"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Art. {currentIndex}
          </span>
        </button>
      )}

      {!isMobile && hasNext && (
        <button
          type="button"
          onClick={() => setCurrentIndex(i => Math.min(articles.length - 1, i + 1))}
          className="fixed right-6 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 px-3 py-4 rounded-full bg-white border border-gray-200 text-gray-700 shadow-lg hover:translate-x-1 hover:shadow-xl transition"
        >
          <ChevronRight className="w-5 h-5" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Art. {currentIndex + 2}
          </span>
        </button>
      )}

      {/* Main Content */}
      <main className={`${isMobile ? 'pt-16 pb-20' : 'pt-24 pb-24'} px-4`}>
        <div className="max-w-4xl mx-auto space-y-10">
          <article
            ref={articleContentRef}
            className="bg-white"
          >
            <div className="flex flex-col gap-4 md:gap-6 border-b border-gray-200 pb-6">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
                    {currentArticle.titre}
                  </h1>
                  {currentArticle.sous_titre && (
                    <h2 className="text-base md:text-xl lg:text-2xl text-gray-600 mt-3 md:mt-4 leading-relaxed font-medium">
                      {currentArticle.sous_titre}
                    </h2>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs sm:text-sm text-gray-600">
                {currentArticle.auteur && (
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                      {currentArticle.auteur.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Par</p>
                      <p className="font-medium text-gray-900">{currentArticle.auteur}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-700" />
                  <span className="font-medium text-gray-700">
                    {Math.ceil(currentArticle.temps_lecture_estime / 60)} min de lecture
                  </span>
                </div>

                {currentArticle.extraction_method === 'textract' && (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 font-semibold text-xs uppercase tracking-wide">
                    Extraction IA
                  </span>
                )}
              </div>
            </div>

            <div
              className="mt-6 md:mt-8 text-gray-800 leading-relaxed space-y-6"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: 1.75,
                letterSpacing: '0.01em',
              }}
            >
              {currentArticle.contenu_texte.split('\n\n').map((paragraph, index) => (
                <p
                  key={index}
                  className={`mb-6 ${
                    index === 0
                      ? 'first-letter:text-6xl first-letter:font-bold first-letter:text-blue-600 first-letter:mr-2 first-letter:float-left first-letter:leading-[0.9]'
                      : ''
                  }`}
                  style={{
                    textAlign: 'justify',
                    hyphens: 'auto'
                  }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        </div>
      </main>

      {/* Footer Navigation Mobile */}
      {isMobile && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 transition-all duration-300 ${
            !showControls ? 'translate-y-full' : 'translate-y-0'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={!hasPrevious}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium text-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Précédent</span>
            </button>

            <div className="text-center">
              <div className="text-gray-700 text-xs font-medium">
                Article {currentIndex + 1} / {articles.length}
              </div>
            </div>

            <button
              onClick={() => setCurrentIndex(i => Math.min(articles.length - 1, i + 1))}
              disabled={!hasNext}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md font-medium text-sm"
            >
              <span>Suivant</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          * { display: none !important; }
        }

        * {
          user-select: none !important;
          -webkit-user-select: none !important;
        }
      `}</style>
    </div>
  );
}
