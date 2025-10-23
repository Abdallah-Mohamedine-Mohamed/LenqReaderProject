import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { OTPInput } from './OTPInput';
import { supabase } from '../lib/supabase';
import { validatePhoneNumber, formatPhoneNumber } from '../lib/otp';

export function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [numeroWhatsapp, setNumeroWhatsapp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn: setUser } = useAuth();

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!validatePhoneNumber(numeroWhatsapp)) {
        setError('Numéro WhatsApp invalide. Utilisez le format international (ex: +22997123456)');
        return;
      }

      const formattedPhone = formatPhoneNumber(numeroWhatsapp);

      const { data: existingUser } = await supabase
        .from('users')
        .select('id, whatsapp_verifie')
        .eq('numero_whatsapp', formattedPhone)
        .maybeSingle();

      if (!existingUser) {
        setError('Numéro WhatsApp non trouvé. Veuillez vous inscrire d\'abord.');
        return;
      }

      if (!existingUser.whatsapp_verifie) {
        setError('Ce compte n\'est pas encore vérifié. Veuillez compléter votre inscription.');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-otp`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          numero_whatsapp: formattedPhone,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || 'Erreur lors de l\'envoi du code OTP. Vérifiez votre numéro WhatsApp.');
        return;
      }

      setStep('otp');
    } catch (err) {
      console.error('Error sending OTP:', err);
      setError('Erreur lors de l\'envoi du code. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otpCode: string) => {
    setError('');
    setLoading(true);

    try {
      const formattedPhone = formatPhoneNumber(numeroWhatsapp);

      const { data: verifyResult, error: verifyError } = await supabase.rpc('verify_otp', {
        p_numero_whatsapp: formattedPhone,
        p_otp_code: otpCode,
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      if (verifyError) throw verifyError;

      if (!verifyResult.success) {
        setError(verifyResult.message || 'Code OTP incorrect');
        setLoading(false);
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('numero_whatsapp', formattedPhone)
        .maybeSingle();

      if (userError || !userData) {
        throw new Error('Utilisateur non trouvé');
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: userData.email || `${userData.numero_whatsapp}@temp.com`,
        password: 'temp-password-for-whatsapp-auth',
      });

      if (authError) {
        const tempEmail = userData.email || `${userData.id}@whatsapp.temp`;
        const tempPassword = `temp-${userData.id}-${Date.now()}`;

        const { error: signUpError } = await supabase.auth.signUp({
          email: tempEmail,
          password: tempPassword,
        });

        if (!signUpError) {
          await supabase.auth.signInWithPassword({
            email: tempEmail,
            password: tempPassword,
          });
        }
      }

      setUser(userData);

      if (userData.role === 'admin') {
        navigate('/admin');
      } else if (userData.role === 'lecteur') {
        navigate('/my-account');
      } else {
        setError('Type de compte non reconnu');
      }
    } catch (err) {
      console.error('Error verifying OTP:', err);
      setError(err instanceof Error ? err.message : 'Erreur de vérification');
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    setLoading(true);

    try {
      const formattedPhone = formatPhoneNumber(numeroWhatsapp);
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-otp`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          numero_whatsapp: formattedPhone,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || 'Erreur lors de l\'envoi du code OTP. Vérifiez votre numéro WhatsApp.');
        return;
      }

      setError('');
    } catch (err) {
      console.error('Error resending OTP:', err);
      setError('Erreur lors du renvoi du code');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeNumber = () => {
    setStep('phone');
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">L'Enquêteur</h1>
          <p className="text-gray-400">Liseuse Sécurisée</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gradient-to-r from-amber-500 to-yellow-600 p-3 rounded-full">
              <LogIn className="w-6 h-6 text-black" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white text-center mb-6">
            Connexion
          </h2>

          {step === 'phone' ? (
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <Phone className="w-4 h-4 inline mr-2" />
                  Numéro WhatsApp
                </label>
                <input
                  type="tel"
                  value={numeroWhatsapp}
                  onChange={(e) => setNumeroWhatsapp(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="+22997123456"
                  required
                />
                <p className="text-gray-500 text-xs mt-1">
                  Format international avec l'indicatif du pays
                </p>
              </div>

              {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-semibold py-3 rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Envoi du code...' : 'Recevoir le code OTP'}
              </button>

              <p className="text-center text-gray-400 text-sm mt-4">
                Pas encore de compte ?{' '}
                <Link to="/subscribe" className="text-amber-500 hover:text-amber-400">
                  S'abonner
                </Link>
              </p>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-gray-300 mb-2">
                  Code envoyé au numéro
                </p>
                <p className="text-white font-semibold">{numeroWhatsapp}</p>
                <button
                  onClick={handleChangeNumber}
                  className="text-amber-500 hover:text-amber-400 text-sm mt-2"
                  disabled={loading}
                >
                  Modifier le numéro
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3 text-center">
                  Entrez le code de vérification
                </label>
                <OTPInput
                  length={6}
                  onComplete={handleOTPComplete}
                  loading={loading}
                  error={error}
                  expiryMinutes={10}
                  onExpiry={() => {
                    setStep('phone');
                    setError('Code OTP expiré (10 minutes). Veuillez vous reconnecter.');
                  }}
                />
              </div>

              <div className="text-center">
                <button
                  onClick={handleResendOTP}
                  disabled={loading}
                  className="text-amber-500 hover:text-amber-400 text-sm disabled:opacity-50"
                >
                  Renvoyer le code
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <Link
            to="/"
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
