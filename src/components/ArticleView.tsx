import { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Type, List, Volume2, VolumeX, Maximize2, Minimize2 } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  content: string;
  pageNumber: number;
}

interface ArticleViewProps {
  articles: Article[];
  currentArticleIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function ArticleView({
  articles,
  currentArticleIndex,
  isOpen,
  onClose,
  onNavigate
}: ArticleViewProps) {
  const [fontSize, setFontSize] = useState(18);
  const [showArticleList, setShowArticleList] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideControlsTimeout = useRef<NodeJS.Timeout>();
  const articleRef = useRef<HTMLDivElement>(null);

  const currentArticle = articles[currentArticleIndex];

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (isMobile) {
        setShowControls(true);
        startHideControlsTimer();
      }
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [isOpen, isMobile]);

  useEffect(() => {
    if (articleRef.current) {
      articleRef.current.scrollTop = 0;
    }
  }, [currentArticleIndex]);

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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && currentArticleIndex > 0) {
      onNavigate(currentArticleIndex - 1);
    } else if (e.key === 'ArrowRight' && currentArticleIndex < articles.length - 1) {
      onNavigate(currentArticleIndex + 1);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, currentArticleIndex, articles.length]);

  if (!isOpen || !currentArticle) return null;

  const hasPrevious = currentArticleIndex > 0;
  const hasNext = currentArticleIndex < articles.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-white"
      onClick={isMobile ? handleUserInteraction : undefined}
    >
      {/* Header */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 transition-all duration-300 ${
          isMobile && !showControls ? '-translate-y-full' : 'translate-y-0'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          {/* Left side */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Fermer"
            >
              <X className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
            </button>

            {!isMobile && (
              <>
                <div className="w-px h-6 bg-gray-300 mx-1"></div>
                <button
                  onClick={() => setShowArticleList(!showArticleList)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Liste des articles"
                >
                  <List className="w-5 h-5 text-gray-700" />
                </button>
              </>
            )}
          </div>

          {/* Center - Title (desktop only) */}
          {!isMobile && (
            <div className="flex-1 text-center px-4">
              <h2 className="font-bold text-sm text-gray-800 truncate">
                {currentArticle.title}
              </h2>
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2">
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
      </div>

      {/* Article List Sidebar (desktop only) */}
      {showArticleList && !isMobile && (
        <div
          className="fixed top-16 left-4 w-80 max-h-[calc(100vh-5rem)] bg-white rounded-lg shadow-2xl border border-gray-200 overflow-y-auto z-40 animate-in slide-in-from-left duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4">
            <h3 className="text-gray-800 font-bold text-sm mb-3">Articles de cette page</h3>
            <div className="space-y-2">
              {articles.map((article, index) => (
                <button
                  key={article.id}
                  onClick={() => {
                    onNavigate(index);
                    setShowArticleList(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                    index === currentArticleIndex
                      ? 'bg-blue-50 border border-blue-200 text-blue-900'
                      : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                  }`}
                >
                  <div className="text-sm font-medium line-clamp-2">{article.title}</div>
                  <div className="text-xs text-gray-500 mt-1">Page {article.pageNumber}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div
        ref={articleRef}
        className={`h-full overflow-y-auto scroll-smooth ${
          isMobile ? 'pt-16 pb-20' : 'pt-20 pb-24'
        }`}
        style={{
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <article className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-12">
          {/* Article Header */}
          <div className="mb-8 md:mb-12">
            {/* Category/Section */}
            <div className="inline-block px-3 py-1 bg-blue-50 border border-blue-100 rounded-full mb-4">
              <span className="text-blue-700 text-xs md:text-sm font-semibold uppercase tracking-wide">
                Page {currentArticle.pageNumber}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 md:mb-6 leading-tight">
              {currentArticle.title}
            </h1>

            {/* Subtitle */}
            {currentArticle.subtitle && (
              <h2 className="text-lg md:text-xl lg:text-2xl font-medium text-gray-600 mb-4 md:mb-6 leading-relaxed">
                {currentArticle.subtitle}
              </h2>
            )}

            {/* Author */}
            {currentArticle.author && (
              <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-base md:text-lg">
                  {currentArticle.author.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Par</p>
                  <p className="text-gray-900 font-semibold text-sm md:text-base">{currentArticle.author}</p>
                </div>
              </div>
            )}
          </div>

          {/* Article Content */}
          <div
            className="prose prose-lg max-w-none"
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: '1.75',
              color: '#1f2937'
            }}
          >
            {currentArticle.content.split('\n\n').map((paragraph, index) => (
              <p
                key={index}
                className={`mb-6 text-gray-800 ${
                  index === 0 ? 'first-letter:text-6xl first-letter:font-bold first-letter:text-blue-600 first-letter:mr-2 first-letter:float-left first-letter:leading-[0.9]' : ''
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

      {/* Footer Navigation */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 transition-all duration-300 ${
          isMobile && !showControls ? 'translate-y-full' : 'translate-y-0'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
          <button
            onClick={() => onNavigate(currentArticleIndex - 1)}
            disabled={!hasPrevious}
            className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium text-sm"
          >
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline">Précédent</span>
          </button>

          <div className="text-center">
            <div className="text-gray-600 text-xs md:text-sm font-medium">
              Article {currentArticleIndex + 1} sur {articles.length}
            </div>
          </div>

          <button
            onClick={() => onNavigate(currentArticleIndex + 1)}
            disabled={!hasNext}
            className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md font-medium text-sm"
          >
            <span className="hidden sm:inline">Suivant</span>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
