import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getDocument } from "npm:pdfjs-dist@4.10.38";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { token, pageNumber } = await req.json();

    if (!token || !pageNumber) {
      return new Response(
        JSON.stringify({ error: "Missing token or pageNumber" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Valider le token
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from("tokens")
      .select(`
        *,
        pdfs (url_fichier),
        users (nom, numero_abonne)
      `)
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérifier l'expiration
    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Token expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérifier si révoqué
    if (tokenData.revoked) {
      return new Response(
        JSON.stringify({ error: "Token revoked" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Incrémenter le compteur d'accès
    await supabaseClient
      .from("tokens")
      .update({
        access_count: (tokenData.access_count || 0) + 1,
        last_access_at: new Date().toISOString(),
      })
      .eq("id", tokenData.id);

    // Récupérer le PDF
    const { data: pdfData } = supabaseClient.storage
      .from("secure-pdfs")
      .getPublicUrl((tokenData as any).pdfs.url_fichier);

    if (!pdfData) {
      throw new Error("PDF not found");
    }

    // Télécharger le PDF
    const pdfResponse = await fetch(pdfData.publicUrl);
    if (!pdfResponse.ok) {
      throw new Error("Failed to download PDF");
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Charger la page spécifique
    const loadingTask = getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
    });

    const pdfDoc = await loadingTask.promise;

    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
      return new Response(
        JSON.stringify({ error: "Invalid page number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const page = await pdfDoc.getPage(pageNumber);

    // Render en canvas
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Failed to get canvas context");
    }

    await page.render({
      canvasContext: context as any,
      viewport: viewport,
    }).promise;

    // Ajouter watermark côté serveur
    const watermarkText = `${(tokenData as any).users.nom} - ${(tokenData as any).users.numero_abonne}`;
    const timestamp = new Date().toLocaleString("fr-FR");

    // Ajouter plusieurs watermarks semi-transparents
    for (let i = 0; i < 5; i++) {
      context.save();
      context.globalAlpha = 0.1 + Math.random() * 0.05;
      context.font = "bold 24px Arial";
      context.fillStyle = "#FFD700";
      context.textAlign = "center";

      const x = Math.random() * viewport.width;
      const y = Math.random() * viewport.height;
      context.translate(x, y);
      context.rotate((Math.random() - 0.5) * Math.PI / 3);

      context.fillText(watermarkText, 0, 0);
      context.fillText(timestamp, 0, 30);

      context.restore();
    }

    // Convertir en PNG
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const imageData = await blob.arrayBuffer();

    // Logger l'accès
    await supabaseClient.from("logs").insert({
      pdf_id: tokenData.pdf_id,
      user_id: tokenData.user_id,
      ip: req.headers.get("x-forwarded-for") || "unknown",
      user_agent: req.headers.get("user-agent") || "unknown",
      pages_vues: [pageNumber],
    });

    return new Response(imageData, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Expires": "0",
        "Pragma": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error in generate-secure-page:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
