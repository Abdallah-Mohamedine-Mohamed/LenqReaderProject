import { supabase } from './supabase';

export interface OTPRequestResult {
  success: boolean;
  error?: string;
  message: string;
  otp_code?: string;
  expires_in_seconds?: number;
  retry_after?: number;
}

export interface OTPVerifyResult {
  success: boolean;
  error?: string;
  message: string;
  user_id?: string;
  attempts_remaining?: number;
}

// --- Envoi d’un OTP ---
export async function requestOTP(numeroWhatsapp: string): Promise<OTPRequestResult> {
  try {
    const { data, error } = await supabase.rpc('request_otp', {
      p_numero_whatsapp: numeroWhatsapp,
      p_ip_address: null,
      p_user_agent: navigator.userAgent,
    });

    if (error) throw error;

    return data as OTPRequestResult;
  } catch (error) {
    console.error('Error requesting OTP:', error);
    return {
      success: false,
      error: 'network_error',
      message: 'Erreur de connexion. Veuillez réessayer.',
    };
  }
}

// --- Vérification d’un OTP ---
export async function verifyOTP(
  numeroWhatsapp: string,
  otpCode: string
): Promise<OTPVerifyResult> {
  try {
    const { data, error } = await supabase.rpc('verify_otp', {
      p_numero_whatsapp: numeroWhatsapp,
      p_otp_code: otpCode,
      p_ip_address: null,
      p_user_agent: navigator.userAgent,
    });

    if (error) throw error;

    return data as OTPVerifyResult;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      error: 'network_error',
      message: 'Erreur de connexion. Veuillez réessayer.',
    };
  }
}

// --- Normalisation du numéro ---
export function normalizePhoneNumber(phone: string): string {
  // Supprime les espaces et caractères indésirables, garde uniquement chiffres et "+"
  let cleaned = phone.trim().replace(/\s+/g, '').replace(/[^\d+]/g, '');
  // Empêche les doubles "+"
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}

// --- Formatage (alias de normalisation) ---
export function formatPhoneNumber(phone: string): string {
  return normalizePhoneNumber(phone);
}

// --- Validation du numéro ---
export function validatePhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  const validPrefixes = ['229', '227', '225', '221', '228', '226', '223', '233', '234'];
  const hasValidPrefix = validPrefixes.some(prefix => cleaned.startsWith(prefix));
  return hasValidPrefix && cleaned.length >= 10 && cleaned.length <= 15;
}

// --- Détection du pays ---
export function detectCountryCode(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('229')) return 'BJ';
  if (cleaned.startsWith('227')) return 'NE';
  if (cleaned.startsWith('225')) return 'CI';
  if (cleaned.startsWith('221')) return 'SN';
  if (cleaned.startsWith('228')) return 'TG';
  if (cleaned.startsWith('226')) return 'BF';
  if (cleaned.startsWith('223')) return 'ML';
  if (cleaned.startsWith('233')) return 'GH';
  if (cleaned.startsWith('234')) return 'NG';
  return 'BJ';
}

// --- Liste des pays supportés ---
export const COUNTRY_OPTIONS = [
  { code: 'BJ', name: 'Bénin', prefix: '+229' },
  { code: 'NE', name: 'Niger', prefix: '+227' },
  { code: 'CI', name: "Côte d'Ivoire", prefix: '+225' },
  { code: 'SN', name: 'Sénégal', prefix: '+221' },
  { code: 'TG', name: 'Togo', prefix: '+228' },
  { code: 'BF', name: 'Burkina Faso', prefix: '+226' },
  { code: 'ML', name: 'Mali', prefix: '+223' },
  { code: 'GH', name: 'Ghana', prefix: '+233' },
  { code: 'NG', name: 'Nigeria', prefix: '+234' },
];
