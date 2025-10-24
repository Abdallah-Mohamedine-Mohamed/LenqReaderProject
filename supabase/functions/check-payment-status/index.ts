import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IPAY_API_URL = "https://i-pay.money/api/v1/payments";
const IPAY_SECRET_KEY = "sk_11a35c3f7ab44dc79e38757fcd28ba82";

interface CheckStatusRequest {
  reference: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { reference }: CheckStatusRequest = await req.json();

    if (!reference) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "missing_reference",
          message: "Référence de paiement requise" 
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const startTime = Date.now();

    const ipayResponse = await fetch(`${IPAY_API_URL}/${reference}`, {
      method: "GET",
      headers: {
        "Ipay-Payment-Type": "mobile",
        "Ipay-Target-Environment": "live",
        "Authorization": `Bearer ${IPAY_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const responseTime = Date.now() - startTime;
    const responseData = await ipayResponse.json();

    const { data: paiement } = await supabase
      .from("paiements")
      .select("*")
      .eq("ipay_reference", reference)
      .maybeSingle();

    if (paiement) {
      await supabase.from("payment_api_logs").insert({
        paiement_id: paiement.id,
        request_type: "check_status",
        request_url: `${IPAY_API_URL}/${reference}`,
        request_headers: {
          "Ipay-Payment-Type": "mobile",
          "Ipay-Target-Environment": "live",
        },
        request_body: { reference },
        response_status: ipayResponse.status,
        response_body: responseData,
        response_time_ms: responseTime,
        error_message: !ipayResponse.ok ? JSON.stringify(responseData) : null,
      });
    }

    if (!ipayResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "status_check_failed",
          message: "Impossible de vérifier le statut du paiement",
          details: responseData,
        }),
        {
          status: ipayResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (paiement && responseData.status) {
      if ((responseData.status === "succeeded" || responseData.status === "paid" || responseData.status === "completed") && paiement.statut !== "confirme") {
        const { data: confirmResult, error: confirmError } = await supabase.rpc(
          'confirm_payment_secure',
          {
            p_payment_id: paiement.id,
            p_ipay_transaction_id: responseData.transaction_id || reference,
            p_ipay_status: responseData.status,
            p_notes: 'Auto-confirmed via check-payment-status',
          }
        );

        if (confirmError) {
          console.error('Failed to confirm payment:', confirmError);
        }
      } else if (responseData.status === "failed" || responseData.status === "cancelled" || responseData.status === "expired") {
        await supabase
          .from("paiements")
          .update({
            ipay_status: responseData.status,
            statut: "echoue",
          })
          .eq("id", paiement.id);
      } else {
        await supabase
          .from("paiements")
          .update({
            ipay_status: responseData.status,
          })
          .eq("id", paiement.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: responseData,
        message: "Statut du paiement récupéré avec succès",
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
    console.error("Error in check-payment-status function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        message: error instanceof Error ? error.message : "Erreur interne du serveur",
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
