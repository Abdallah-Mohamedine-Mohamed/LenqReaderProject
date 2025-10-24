import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IPAY_API_URL = "https://i-pay.money/api/v1";
const IPAY_SECRET_KEY = Deno.env.get("IPAY_SECRET_KEY") || "sk_11a35c3f7ab44dc79e38757fcd28ba82";

interface IPayStatusResponse {
  status: string;
  transaction_id?: string;
  amount?: number;
  currency?: string;
  message?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Expire old pending payments (30+ minutes)
    const { data: expireResult } = await supabase.rpc('expire_pending_payments');
    console.log('Expired payments:', expireResult);

    // 2. Find pending payments with iPay transaction IDs
    const { data: pendingPayments, error: fetchError } = await supabase
      .from('paiements')
      .select('id, user_id, ipay_transaction_id, reference_transaction, montant_fcfa, created_at, abonnement_id, formule_id')
      .eq('statut', 'en_attente')
      .not('ipay_transaction_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch pending payments: ${fetchError.message}`);
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending payments to reconcile',
          expired: expireResult,
          reconciled: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let reconciledCount = 0;
    let failedCount = 0;
    const results = [];

    // 3. Check each payment with iPay API
    for (const payment of pendingPayments) {
      try {
        const checkUrl = `${IPAY_API_URL}/payments/${payment.ipay_transaction_id}`;

        const ipayResponse = await fetch(checkUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${IPAY_SECRET_KEY}`,
            "Content-Type": "application/json",
            "Ipay-Payment-Type": "mobile",
            "Ipay-Target-Environment": "live",
          },
        });

        const ipayData: IPayStatusResponse = await ipayResponse.json();

        // Log the check
        await supabase.from('payment_events').insert({
          payment_id: payment.id,
          user_id: payment.user_id,
          event_type: 'pending',
          old_status: 'en_attente',
          new_status: 'en_attente',
          ipay_transaction_id: payment.ipay_transaction_id,
          ipay_status: ipayData.status,
          metadata: {
            check_type: 'auto_reconciliation',
            ipay_response: ipayData,
          },
          notes: `Auto check: ${ipayData.status}`,
        });

        // 4. If payment succeeded, confirm it
        if (ipayData.status === 'succeeded' || ipayData.status === 'paid' || ipayData.status === 'completed') {
          const { data: confirmResult, error: confirmError } = await supabase.rpc(
            'confirm_payment_secure',
            {
              p_payment_id: payment.id,
              p_ipay_transaction_id: payment.ipay_transaction_id,
              p_ipay_status: ipayData.status,
              p_notes: 'Auto-confirmed via reconciliation job',
            }
          );

          if (confirmError) {
            console.error(`Failed to confirm payment ${payment.id}:`, confirmError);
            failedCount++;
            results.push({
              payment_id: payment.id,
              status: 'error',
              error: confirmError.message,
            });
          } else {
            reconciledCount++;
            results.push({
              payment_id: payment.id,
              status: 'confirmed',
              result: confirmResult,
            });
          }
        } else if (ipayData.status === 'failed' || ipayData.status === 'cancelled' || ipayData.status === 'expired') {
          // Mark as failed
          await supabase
            .from('paiements')
            .update({
              statut: 'echoue',
              ipay_status: ipayData.status,
              notes: `Auto-failed: ${ipayData.message || ipayData.status}`,
            })
            .eq('id', payment.id);

          failedCount++;
          results.push({
            payment_id: payment.id,
            status: 'marked_failed',
            ipay_status: ipayData.status,
          });
        }
      } catch (error) {
        console.error(`Error checking payment ${payment.id}:`, error);
        results.push({
          payment_id: payment.id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Reconciliation completed',
        expired: expireResult,
        checked: pendingPayments.length,
        reconciled: reconciledCount,
        failed: failedCount,
        results,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in reconcile-ipay-payments:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "reconciliation_failed",
        message: error instanceof Error ? error.message : "Failed to reconcile payments",
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
