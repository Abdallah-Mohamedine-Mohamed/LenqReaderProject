import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const WASENDER_API_URL = "https://wasenderapi.com/api/send-message";
const WASENDER_API_KEY = "9017ef11b7228c6d68ac651a7878e1ec05ab47247c7e32e007b802118cc5416b";

interface SendOTPRequest {
  numero_whatsapp: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { numero_whatsapp }: SendOTPRequest = await req.json();

    if (!numero_whatsapp) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "missing_phone",
          message: "Le numéro WhatsApp est requis",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ✅ Correction : forcer le format international avec "+"
    const formattedPhone = numero_whatsapp.startsWith("+")
      ? numero_whatsapp.trim()
      : `+${numero_whatsapp.trim()}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[send-otp] Request received for:", formattedPhone);

    const userAgent = req.headers.get("user-agent") || "";
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";

    // ✅ Enregistrement de l'OTP dans la base (format uniforme "+")
    const { data: otpResult, error: otpError } = await supabase.rpc("request_otp", {
      p_numero_whatsapp: formattedPhone,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });

    if (otpError) {
      console.error("Error requesting OTP:", otpError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "database_error",
          message: "Erreur lors de la génération du code OTP",
          details: otpError.message,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!otpResult || otpResult.error) {
      console.error("OTP generation failed:", otpResult);
      return new Response(
        JSON.stringify({
          success: false,
          error: otpResult?.error || "otp_generation_failed",
          message: otpResult?.message || "Impossible de générer le code OTP",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const otpCode = otpResult.otp_code;
    const message = `Votre code de vérification L’Enquêteur est : *${otpCode}*\n\nCe code expire dans 10 minutes.\n⚠️ Ne partagez ce code avec personne.`;

    // Log OTP sent event
    await supabase.rpc("log_otp_event", {
      p_numero_whatsapp: formattedPhone,
      p_event_type: "sent",
      p_metadata: { method: "whatsapp" },
    });

    // WaSender API exige le numéro sans "+"
    const phoneNumberForWhatsApp = formattedPhone.startsWith("+")
      ? formattedPhone.substring(1)
      : formattedPhone;

    console.log("Sending WhatsApp message to:", phoneNumberForWhatsApp);

    const whatsappResponse = await fetch(WASENDER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WASENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: phoneNumberForWhatsApp,
        text: message,
      }),
    });

    const whatsappData = await whatsappResponse.json();

    console.log("WhatsApp API response:", whatsappData);

    // ✅ Vérifie si le message WhatsApp a été bien envoyé
    if (!whatsappResponse.ok || whatsappData.error || whatsappData.status === "error") {
      let userMessage = "Erreur lors de l'envoi du message WhatsApp";

      if (whatsappData.message?.includes("Invalid phone")) {
        userMessage = "Numéro de téléphone invalide ou paramètres incorrects";
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: "whatsapp_error",
          message: userMessage,
          details: whatsappData,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("[send-otp] ✅ OTP envoyé avec succès à", formattedPhone);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Code OTP envoyé avec succès sur WhatsApp",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in send-otp function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        message: "Erreur interne du serveur",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
