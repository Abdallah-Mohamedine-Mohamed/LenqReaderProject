import { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PDFUploadProps {
  onUploadComplete: () => void;
}

export function PDFUpload({ onUploadComplete }: PDFUploadProps) {
  const { user } = useAuth();
  const [titre, setTitre] = useState('');
  const [dateEdition, setDateEdition] = useState(new Date().toISOString().split('T')[0]);
  const [numeroEdition, setNumeroEdition] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Veuillez sélectionner un fichier PDF');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError('');
      if (!titre) {
        setTitre(selectedFile.name.replace('.pdf', ''));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !titre) return;

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `pdfs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('secure-pdfs')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('pdfs')
        .insert({
          titre,
          url_fichier: filePath,
          uploaded_by: user?.id,
          date_edition: dateEdition,
          numero_edition: numeroEdition ? parseInt(numeroEdition) : null,
          statut_publication: 'brouillon'
        });

      if (dbError) throw dbError;

      setSuccess(true);
      setTitre('');
      setFile(null);
      setNumeroEdition('');
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      onUploadComplete();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'upload');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-6">
        Téléverser un journal PDF
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Titre du journal
          </label>
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            placeholder="Ex: L'Enquêteur - Édition du 15 Octobre 2025"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Date d'édition
            </label>
            <input
              type="date"
              value={dateEdition}
              onChange={(e) => setDateEdition(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Numéro d'édition (optionnel)
            </label>
            <input
              type="number"
              value={numeroEdition}
              onChange={(e) => setNumeroEdition(e.target.value)}
              placeholder="Ex: 245"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Fichier PDF
          </label>
          <div className="relative">
            <input
              id="file-input"
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
              required
            />
            <label
              htmlFor="file-input"
              className="flex items-center justify-center w-full px-4 py-8 bg-gray-700 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-650 hover:border-amber-500 transition-all"
            >
              <div className="text-center">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-300 font-medium">
                  {file ? file.name : 'Cliquez pour sélectionner un PDF'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Taille max: 50 MB
                </p>
              </div>
            </label>
          </div>
          {file && (
            <div className="mt-3 flex items-center text-green-400 text-sm">
              <FileText className="w-4 h-4 mr-2" />
              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center space-x-2 bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center space-x-2 bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded-lg">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span>Journal téléversé avec succès !</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !file || !titre}
          className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-semibold py-3 rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          <Upload className="w-5 h-5" />
          <span>{loading ? 'Téléversement...' : 'Téléverser le journal'}</span>
        </button>
      </form>
    </div>
  );
}
