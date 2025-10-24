import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface IPayWebhookPayload {
  external_reference?: string;
  reference: string;
  status: "succeeded" | "failed" | "pending";
  amount?: string;
  currency?: string;
  msisdn?: string;
  customer_name?: string;
  transaction_id?: string;
  user_id?: string;
  abonnement_id?: string;
  paiement_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const payload: IPayWebhookPayload = await req.json();
    console.log("📥 Webhook iPay reçu:", payload);

    const { reference, status, external_reference, transaction_id, user_id, abonnement_id, paiement_id } = payload;

    if (!reference && !transaction_id) {
      console.error("❌ Référence ou transaction_id manquant");
      return new Response(
        JSON.stringify({
          success: false,
          error: "missing_reference",
          message: "Référence ou transaction_id requis",
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

    let paiement = null;

    if (paiement_id) {
      const { data } = await supabase
        .from("paiements")
        .select("*")
        .eq("id", paiement_id)
        .maybeSingle();
      paiement = data;
      console.log(`🔍 Found payment via paiement_id: ${paiement_id}`);
    }

    if (!paiement && reference) {
      const { data } = await supabase
        .from("paiements")
        .select("*")
        .eq("ipay_reference", reference)
        .maybeSingle();
      paiement = data;
    }

    if (!paiement && transaction_id) {
      const { data } = await supabase
        .from("paiements")
        .select("*")
        .eq("ipay_transaction_id", transaction_id)
        .maybeSingle();
      paiement = data;
    }

    if (!paiement && abonnement_id) {
      const { data } = await supabase
        .from("paiements")
        .select("*")
        .eq("abonnement_id", abonnement_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      paiement = data;
      console.log(`🔍 Found payment via abonnement_id: ${abonnement_id}`);

      if (!paiement && user_id) {
        console.log(`🆕 Creating payment record for external payment`);
        const { data: abonnement } = await supabase
          .from("abonnements")
          .select("user_id, formule_id, formules(prix_fcfa)")
          .eq("id", abonnement_id)
          .single();

        if (abonnement) {
          const { data: newPaiement, error: insertError } = await supabase
            .from("paiements")
            .insert({
              user_id: user_id,
              abonnement_id: abonnement_id,
              montant_fcfa: (abonnement.formules as any)?.prix_fcfa || parseFloat(payload.amount || "0"),
              methode_paiement: "iPayMoney-external",
              ipay_reference: reference,
              ipay_transaction_id: transaction_id,
              statut: "en_attente",
              notes: `External payment webhook - ${new Date().toISOString()}`,
              currency: payload.currency,
              msisdn: payload.msisdn,
            })
            .select()
            .single();

          if (!insertError && newPaiement) {
            paiement = newPaiement;
            console.log(`✅ Payment record created: ${paiement.id}`);
          } else {
            console.error("❌ Error creating payment:", insertError);
          }
        }
      }
    }

    if (!paiement && external_reference) {
      if (external_reference.startsWith("ABN-")) {
        const abonnementIdFromRef = external_reference.replace("ABN-", "");
        const { data } = await supabase
          .from("paiements")
          .select("*")
          .eq("abonnement_id", abonnementIdFromRef)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        paiement = data;
        console.log(`🔍 Found payment via external_reference: ${external_reference}`);
      }
    }

    if (!paiement) {
      console.error("❌ Paiement introuvable pour référence:", reference || transaction_id || external_reference);
      return new Response(
        JSON.stringify({
          success: false,
          error: "payment_not_found",
          message: "Paiement introuvable et impossible de créer un enregistrement",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (status === "succeeded" || status === "paid" || status === "completed") {
      console.log(`✅ Payment succeeded, calling confirm_payment_secure`);

      const { data: confirmResult, error: confirmError } = await supabase.rpc(
        'confirm_payment_secure',
        {
          p_payment_id: paiement.id,
          p_ipay_transaction_id: transaction_id || reference,
          p_ipay_status: status,
          p_notes: `Webhook confirmation - ${status} at ${new Date().toISOString()}`,
        }
      );

      if (confirmError) {
        console.error('❌ Error confirming payment:', confirmError);
        throw confirmError;
      }

      console.log(`✅ Payment confirmed via RPC:`, confirmResult);

      if (confirmResult && confirmResult.success) {
        const { data: abonnement } = await supabase
          .from("abonnements")
          .select("user_id, date_fin, formules(nom)")
          .eq("id", paiement.abonnement_id)
          .maybeSingle();

        if (abonnement) {
          const { data: user } = await supabase
            .from("users")
            .select("telephone, prenom, nom, numero_whatsapp")
            .eq("id", abonnement.user_id)
            .maybeSingle();

          await supabase.from("notifications").insert({
            user_id: abonnement.user_id,
            type: "paiement_confirme",
            titre: "Paiement confirmé",
            message: `Votre paiement de ${paiement.montant_fcfa} FCFA a été confirmé avec succès.`,
            lu: false,
          });

          console.log(`✅ Notification envoyée à user ${abonnement.user_id}`);

          const phoneNumber = user?.numero_whatsapp || user?.telephone;
          if (phoneNumber) {
            const formuleNom = (abonnement.formules as any)?.nom || "Abonnement";
            const dateFin = new Date(confirmResult.new_end_date).toLocaleDateString("fr-FR");
            const whatsappMessage = `Bonjour ${user.prenom || ""} ${user.nom || ""},\n\n✅ Votre paiement de ${paiement.montant_fcfa} FCFA a été confirmé avec succès !\n\n📰 Abonnement: ${formuleNom}\n📅 Valable jusqu'au: ${dateFin}\n\nMerci pour votre confiance ! Vous pouvez maintenant accéder à toutes vos éditions.\n\nÉquipe L'Enquêteur`;

            try {
              const whatsappResponse = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  to: phoneNumber,
                  text: whatsappMessage,
                }),
              });

              const whatsappResult = await whatsappResponse.json();
              if (whatsappResult.success) {
                console.log(`✅ WhatsApp confirmation sent to ${phoneNumber}`);
              } else {
                console.error(`❌ Failed to send WhatsApp: ${whatsappResult.error}`);
              }
            } catch (whatsappError) {
              console.error("❌ Error sending WhatsApp:", whatsappError);
            }
          }
        }
      }
    } else if (status === "failed" || status === "cancelled" || status === "expired") {
      console.log(`❌ Payment failed: ${status}`);

      await supabase
        .from("paiements")
        .update({
          statut: "echoue",
          ipay_status: status,
          ipay_reference: reference || paiement.ipay_reference,
        })
        .eq("id", paiement.id);

      await supabase.from('payment_events').insert({
        payment_id: paiement.id,
        user_id: paiement.user_id,
        event_type: 'failed',
        old_status: paiement.statut,
        new_status: 'echoue',
        ipay_transaction_id: transaction_id || reference,
        ipay_status: status,
        notes: `Webhook - Payment ${status}`,
      });
    } else {
      console.log(`ℹ️ Payment status: ${status}`);

      await supabase
        .from("paiements")
        .update({
          ipay_status: status,
          ipay_reference: reference || paiement.ipay_reference,
        })
        .eq("id", paiement.id);
    }

    await supabase.from("webhook_logs").insert({
      source: "ipay",
      event_type: "payment_status_update",
      payload: payload,
      status: "processed",
      processed_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Webhook traité avec succès",
        payment_id: paiement.id,
        status: status,
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
    console.error("❌ Erreur webhook:", error);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from("webhook_logs").insert({
        source: "ipay",
        event_type: "payment_status_update",
        payload: await req.clone().json().catch(() => ({})),
        status: "error",
        error_message: error instanceof Error ? error.message : String(error),
        processed_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        message: error instanceof Error ? error.message : "Erreur interne",
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
