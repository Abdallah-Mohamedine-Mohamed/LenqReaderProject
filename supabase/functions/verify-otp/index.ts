import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VerifyOTPRequest {
  numero_whatsapp: string;
  otp_code: string;
}

const MAX_ATTEMPTS = 3;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { numero_whatsapp, otp_code }: VerifyOTPRequest = await req.json();

    if (!numero_whatsapp || !otp_code) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "missing_fields",
          message: "Le numéro WhatsApp et le code OTP sont requis",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[verify-otp] Incoming:", numero_whatsapp, otp_code);

    // ✅ Normalisation stricte
    const formatted = numero_whatsapp.trim();
    console.log("[verify-otp] Checking formatted number:", formatted);

    // Recherche de l'OTP correspondant (exact match avec +)
    const { data: otpRecord, error: otpError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("numero_whatsapp", formatted)
      .eq("otp_code", otp_code)
      .maybeSingle();

    if (otpError) {
      console.error("[verify-otp] Database error:", otpError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "database_error",
          message: "Erreur lors de la vérification du code OTP",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!otpRecord) {
      console.warn("[verify-otp] Aucun OTP trouvé pour", formatted);
      return new Response(
        JSON.stringify({
          success: false,
          error: "invalid_code",
          message: "Code OTP invalide ou numéro introuvable",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[verify-otp] Record found:", otpRecord);

    // Vérification de l’expiration
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);
    if (now > expiresAt) {
      await supabase.from("otp_codes").delete().eq("id", otpRecord.id);
      return new Response(
        JSON.stringify({
          success: false,
          error: "expired",
          message: "Ce code a expiré. Veuillez redemander un nouveau code.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérification du nombre de tentatives
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      await supabase.from("otp_codes").delete().eq("id", otpRecord.id);
      return new Response(
        JSON.stringify({
          success: false,
          error: "max_attempts",
          message: "Trop de tentatives. Veuillez recommencer la vérification.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Incrémenter les tentatives
    await supabase
      .from("otp_codes")
      .update({ attempts: otpRecord.attempts + 1 })
      .eq("id", otpRecord.id);

    // Vérifier le code exact
    if (otpRecord.otp_code !== otp_code) {
      const remaining = MAX_ATTEMPTS - (otpRecord.attempts + 1);
      return new Response(
        JSON.stringify({
          success: false,
          error: "invalid_code",
          message: `Code incorrect. ${remaining} tentative${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}.`,
          attempts_remaining: remaining,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ Mettre à jour l'utilisateur (format strict avec +)
    const { data: userData, error: updateError } = await supabase
      .from("users")
      .update({ whatsapp_verifie: true })
      .eq("numero_whatsapp", formatted)
      .select("id")
      .maybeSingle();

    if (updateError || !userData) {
      console.error("[verify-otp] Erreur de mise à jour:", updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "update_error",
          message: "Erreur lors de la mise à jour du compte utilisateur",
          details: updateError?.message || "Aucun utilisateur trouvé pour ce numéro",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Supprimer le code OTP utilisé
    await supabase.from("otp_codes").delete().eq("id", otpRecord.id);

    console.log("[verify-otp] ✅ Vérification réussie pour", formatted);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Numéro WhatsApp vérifié avec succès",
        user_id: userData.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[verify-otp] Erreur interne:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        message: "Erreur interne du serveur",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
