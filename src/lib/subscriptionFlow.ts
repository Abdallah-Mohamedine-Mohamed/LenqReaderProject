import { supabase } from './supabase';
import { normalizePhoneNumber } from './otp';

export interface SubscriptionFormData {
  nom: string;
  numero_whatsapp: string;
  email: string;
  formule_id: string;
}

export interface ExistingUserCheck {
  exists: boolean;
  verified: boolean;
  userId?: string;
  shouldResendOtp?: boolean;
  shouldRecreate?: boolean;
  createdAt?: string;
}

export interface SendOTPResult {
  success: boolean;
  error?: string;
  message: string;
  userId?: string;
}

export interface VerifyOTPResult {
  success: boolean;
  error?: string;
  message: string;
  userId?: string;
  attemptsRemaining?: number;
}

export async function checkExistingUser(phoneNumber: string): Promise<ExistingUserCheck> {
  try {
    const formattedPhone = normalizePhoneNumber(phoneNumber);

    const { data: existingUser, error } = await supabase
      .from('users')
      .select('id, whatsapp_verifie, created_at')
      .eq('numero_whatsapp', formattedPhone)
      .maybeSingle();

    if (error) {
      console.error('Error checking existing user:', error);
      throw error;
    }

    if (!existingUser) {
      return { exists: false, verified: false };
    }

    if (existingUser.whatsapp_verifie) {
      return {
        exists: true,
        verified: true,
        userId: existingUser.id,
      };
    }

    const createdAt = new Date(existingUser.created_at);
    const now = new Date();
    const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);

    if (minutesSinceCreation < 10) {
      return {
        exists: true,
        verified: false,
        userId: existingUser.id,
        shouldResendOtp: true,
        createdAt: existingUser.created_at,
      };
    } else {
      return {
        exists: true,
        verified: false,
        userId: existingUser.id,
        shouldRecreate: true,
        createdAt: existingUser.created_at,
      };
    }
  } catch (error) {
    console.error('Error in checkExistingUser:', error);
    throw error;
  }
}

export async function cleanupUnverifiedUser(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('cleanup_specific_unverified_user', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error cleaning up unverified user:', error);
      return false;
    }

    return data?.success || false;
  } catch (error) {
    console.error('Error in cleanupUnverifiedUser:', error);
    return false;
  }
}

export async function cleanupUnverifiedUserByPhone(phoneNumber: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('cleanup_unverified_user_by_phone', {
      p_phone_number: phoneNumber,
    });

    if (error) {
      console.error('Error cleaning up unverified user by phone:', error);
      return false;
    }

    return data?.success || false;
  } catch (error) {
    console.error('Error in cleanupUnverifiedUserByPhone:', error);
    return false;
  }
}

export async function createUserAccount(formData: SubscriptionFormData): Promise<SendOTPResult> {
  try {
    const formattedPhone = normalizePhoneNumber(formData.numero_whatsapp);

    const tempPassword = `temp-${Date.now()}-${Math.random()}`;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: tempPassword,
    });

    if (authError) {
      console.error('Error creating auth account:', authError);
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Erreur lors de la création du compte temporaire');
    }

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        nom: formData.nom,
        numero_whatsapp: formattedPhone,
        email: formData.email,
        whatsapp_verifie: false,
        role: 'lecteur',
        statut_abonnement: 'inactif',
        score_confiance: 100,
        devices_autorises: 1,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error creating user:', insertError);
      throw insertError;
    }

    return {
      success: true,
      message: 'Compte créé avec succès',
      userId: newUser.id,
    };
  } catch (error: any) {
    console.error('Error in createUserAccount:', error);
    return {
      success: false,
      error: 'database_error',
      message: error?.message || 'Erreur lors de la création du compte',
    };
  }
}

export async function sendOTP(phoneNumber: string): Promise<SendOTPResult> {
  try {
    const formattedPhone = normalizePhoneNumber(phoneNumber);

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          numero_whatsapp: formattedPhone,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'otp_send_failed',
        message: data.message || "Erreur lors de l'envoi du code OTP",
      };
    }

    if (!data.success) {
      return {
        success: false,
        error: data.error || 'otp_send_failed',
        message: data.message || "Erreur lors de l'envoi du code OTP",
      };
    }

    return {
      success: true,
      message: data.message || 'Code OTP envoyé avec succès',
    };
  } catch (error) {
    console.error('Error sending OTP:', error);
    return {
      success: false,
      error: 'network_error',
      message: 'Erreur de connexion',
    };
  }
}

export async function verifyOTP(phoneNumber: string, otpCode: string): Promise<VerifyOTPResult> {
  try {
    const formattedPhone = normalizePhoneNumber(phoneNumber);

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          numero_whatsapp: formattedPhone,
          otp_code: otpCode,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'verification_failed',
        message: data.message || 'Code OTP invalide',
        attemptsRemaining: data.attempts_remaining,
      };
    }

    return {
      success: true,
      message: 'Numéro WhatsApp vérifié avec succès',
      userId: data.user_id,
    };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      error: 'network_error',
      message: 'Erreur de connexion',
    };
  }
}

export async function handleSignupFlow(formData: SubscriptionFormData): Promise<SendOTPResult> {
  try {
    const userCheck = await checkExistingUser(formData.numero_whatsapp);

    if (userCheck.verified) {
      return {
        success: false,
        error: 'already_registered',
        message: 'Ce numéro WhatsApp est déjà enregistré. Veuillez vous connecter.',
      };
    }

    if (userCheck.shouldRecreate && userCheck.userId) {
      await cleanupUnverifiedUser(userCheck.userId);
      const createResult = await createUserAccount(formData);
      if (!createResult.success) {
        return createResult;
      }
    } else if (!userCheck.exists) {
      const createResult = await createUserAccount(formData);
      if (!createResult.success) {
        return createResult;
      }
    }

    const otpResult = await sendOTP(formData.numero_whatsapp);
    return otpResult;
  } catch (error) {
    console.error('Error in handleSignupFlow:', error);
    return {
      success: false,
      error: 'flow_error',
      message: 'Une erreur est survenue lors de la création du compte',
    };
  }
}
