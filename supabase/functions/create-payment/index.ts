import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreatePaymentRequest {
  user_id: string;
  abonnement_id: string;
  formule_id: string;
  amount: number;
  transaction_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { user_id, abonnement_id, formule_id, amount, transaction_id }: CreatePaymentRequest = await req.json();

    if (!user_id || !abonnement_id || !formule_id || !amount || !transaction_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'missing_fields',
          message: 'Tous les champs sont requis',
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    const { data: payment, error: paymentError } = await supabase
      .from('paiements')
      .insert({
        user_id,
        abonnement_id,
        formule_id,
        montant_fcfa: amount,
        methode_paiement: 'iPayMoney-SDK',
        reference_transaction: transaction_id,
        ipay_transaction_id: transaction_id,
        statut: 'en_attente',
        currency: 'XOF',
        country_code: 'BJ',
        expires_at: expiresAt.toISOString(),
        notes: 'Payment via iPay SDK',
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Payment creation error:', paymentError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'payment_creation_failed',
          message: paymentError.message,
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

    await supabase.from('payment_events').insert({
      payment_id: payment.id,
      user_id,
      event_type: 'created',
      old_status: null,
      new_status: 'en_attente',
      metadata: {
        transaction_id,
        method: 'iPay SDK',
      },
      notes: 'Payment created via iPay SDK',
    });

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: payment.id,
        transaction_id,
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
    console.error('Error in create-payment:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Erreur interne',
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
