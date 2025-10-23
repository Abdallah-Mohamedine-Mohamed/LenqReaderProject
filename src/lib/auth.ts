import { supabase } from './supabase';
import type { User } from './supabase';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error('Email ou mot de passe incorrect');
  if (!data.user) throw new Error('Email ou mot de passe incorrect');

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (userError || !userData) {
    throw new Error('Utilisateur non trouvé');
  }

  return userData as User;
}

export async function createUser(nom: string, email: string, password: string, role: 'admin' | 'lecteur' = 'lecteur') {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('Erreur lors de la création du compte');

  const { data, error } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      email,
      nom,
      role,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existingUser, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (selectError) throw selectError;
      if (!existingUser) throw new Error('Utilisateur créé mais non trouvé dans la base de données');

      return existingUser as User;
    }
    throw error;
  }

  return data as User;
}
