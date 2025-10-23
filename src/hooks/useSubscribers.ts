import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Abonnement } from '../lib/supabase';

interface SubscriberWithDetails extends User {
  abonnements?: Abonnement[];
}

export function useSubscribers() {
  const [subscribers, setSubscribers] = useState<SubscriberWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSubscribers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('users')
        .select(`
          *,
          abonnements (
            *,
            formules (*)
          )
        `)
        .eq('role', 'lecteur')
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      setSubscribers(data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du chargement des abonnés';
      setError(message);
      console.error('Error loading subscribers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscribers();
  }, [loadSubscribers]);

  const suspendSubscriber = useCallback(async (userId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ statut_abonnement: 'suspendu' })
        .eq('id', userId);

      if (updateError) throw updateError;
      await loadSubscribers();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suspension';
      console.error('Error suspending subscriber:', err);
      return { success: false, error: message };
    }
  }, [loadSubscribers]);

  const activateSubscriber = useCallback(async (userId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ statut_abonnement: 'actif' })
        .eq('id', userId);

      if (updateError) throw updateError;
      await loadSubscribers();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la réactivation';
      console.error('Error activating subscriber:', err);
      return { success: false, error: message };
    }
  }, [loadSubscribers]);

  const getActiveSubscribers = useCallback(() => {
    return subscribers.filter(user => {
      if (!user.date_fin_abonnement) {
        return user.statut_abonnement === 'actif' || user.statut_abonnement === 'essai';
      }
      return new Date(user.date_fin_abonnement) >= new Date();
    });
  }, [subscribers]);

  return {
    subscribers,
    loading,
    error,
    loadSubscribers,
    suspendSubscriber,
    activateSubscriber,
    getActiveSubscribers,
  };
}
