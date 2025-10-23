import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Type, List } from 'lucide-react';

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

  const currentArticle = articles[currentArticleIndex];

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !currentArticle) return null;

  const hasPrevious = currentArticleIndex > 0;
  const hasNext = currentArticleIndex < articles.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        style={{ backdropFilter: 'blur(12px)' }}
      />

      <div
        className="relative w-full md:w-[70%] lg:w-[60%] h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-900/95 to-transparent pointer-events-none z-10" />

        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 relative z-20">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowArticleList(!showArticleList)}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Liste des articles"
              >
                <List className="w-5 h-5 text-slate-300" />
              </button>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <button
                  onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                  disabled={fontSize <= 14}
                  className="text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Réduire la taille"
                >
                  <Type className="w-4 h-4" />
                </button>
                <span className="text-slate-400 text-sm font-medium px-2">{fontSize}px</span>
                <button
                  onClick={() => setFontSize(prev => Math.min(28, prev + 2))}
                  disabled={fontSize >= 28}
                  className="text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Augmenter la taille"
                >
                  <Type className="w-5 h-5" />
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors group"
              title="Fermer"
            >
              <X className="w-6 h-6 text-slate-300 group-hover:text-white transition-colors" />
            </button>
          </div>

          {showArticleList && (
            <div className="absolute top-16 left-4 w-64 max-h-96 bg-slate-800/95 backdrop-blur-md rounded-lg shadow-2xl border border-slate-700/50 overflow-y-auto z-30 animate-in slide-in-from-left duration-200">
              <div className="p-2">
                <h3 className="text-slate-300 font-semibold text-sm px-3 py-2">Articles de cette page</h3>
                {articles.map((article, index) => (
                  <button
                    key={article.id}
                    onClick={() => {
                      onNavigate(index);
                      setShowArticleList(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all mb-1 ${
                      index === currentArticleIndex
                        ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-white'
                        : 'hover:bg-slate-700/50 text-slate-300'
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{article.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Page {article.pageNumber}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 md:px-12 lg:px-16 py-8 scroll-smooth">
            <article className="max-w-3xl mx-auto animate-in fade-in duration-500">
              <div className="mb-10">
                <div className="inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full mb-4">
                  <span className="text-amber-400 text-sm font-medium">Page {currentArticle.pageNumber}</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight tracking-tight">
                  {currentArticle.title}
                </h1>

                {currentArticle.subtitle && (
                  <h2 className="text-xl md:text-2xl font-medium text-slate-300 mb-6 leading-relaxed">
                    {currentArticle.subtitle}
                  </h2>
                )}

                {currentArticle.author && (
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold text-lg">
                      {currentArticle.author.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Par</p>
                      <p className="text-slate-200 font-medium">{currentArticle.author}</p>
                    </div>
                  </div>
                )}
              </div>

              <div
                className="prose prose-invert prose-lg max-w-none leading-relaxed text-slate-200"
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: '1.8'
                }}
              >
                {currentArticle.content.split('\n\n').map((paragraph, index) => (
                  <p key={index} className="mb-6 text-slate-300 first-letter:text-5xl first-letter:font-bold first-letter:text-amber-500 first-letter:mr-2 first-letter:float-left first:first-letter:leading-none">
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
            <button
              onClick={() => onNavigate(currentArticleIndex - 1)}
              disabled={!hasPrevious}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Article précédent</span>
            </button>

            <div className="text-slate-400 text-sm font-medium">
              {currentArticleIndex + 1} / {articles.length}
            </div>

            <button
              onClick={() => onNavigate(currentArticleIndex + 1)}
              disabled={!hasNext}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              <span className="hidden sm:inline">Article suivant</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
