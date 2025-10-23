import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { PDF } from '../lib/supabase';

export function usePdfs() {
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPdfs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('pdfs')
        .select('*')
        .order('date_upload', { ascending: false });

      if (queryError) throw queryError;
      setPdfs(data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du chargement des PDFs';
      setError(message);
      console.error('Error loading PDFs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPdfs();
  }, [loadPdfs]);

  const uploadPdf = useCallback(async (file: File, titre: string, userId: string, metadata?: {
    numeroEdition?: number;
    dateEdition?: string;
  }) => {
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `pdfs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('secure-pdfs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: insertData, error: insertError } = await supabase
        .from('pdfs')
        .insert({
          titre,
          url_fichier: filePath,
          uploaded_by: userId,
          numero_edition: metadata?.numeroEdition || null,
          date_edition: metadata?.dateEdition || null,
          statut_publication: 'brouillon',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await loadPdfs();
      return { success: true, data: insertData };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'upload';
      console.error('Error uploading PDF:', err);
      return { success: false, error: message };
    }
  }, [loadPdfs]);

  const deletePdf = useCallback(async (pdfId: string, filePath: string) => {
    try {
      const { error: storageError } = await supabase.storage
        .from('secure-pdfs')
        .remove([filePath]);

      if (storageError) console.warn('Storage deletion failed:', storageError);

      const { error: dbError } = await supabase
        .from('pdfs')
        .delete()
        .eq('id', pdfId);

      if (dbError) throw dbError;

      await loadPdfs();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression';
      console.error('Error deleting PDF:', err);
      return { success: false, error: message };
    }
  }, [loadPdfs]);

  return {
    pdfs,
    loading,
    error,
    loadPdfs,
    uploadPdf,
    deletePdf,
  };
}
