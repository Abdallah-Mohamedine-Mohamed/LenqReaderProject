import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getDocument } from "npm:pdfjs-dist@4.10.38";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

    const { editionId, pdfUrl } = await req.json();

    if (!editionId || !pdfUrl) {
      return new Response(
        JSON.stringify({ error: "Missing editionId or pdfUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Starting extraction for edition:", editionId);
    console.log("PDF URL:", pdfUrl);

    await supabaseClient
      .from("editions")
      .update({ statut: "processing", vision_api_processed: false })
      .eq("id", editionId);

    console.log("Downloading PDF from:", pdfUrl);
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
    }
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfSizeMB = (pdfBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log("PDF downloaded successfully. Size:", pdfSizeMB, "MB");
    
    if (pdfBuffer.byteLength > 50 * 1024 * 1024) {
      throw new Error(`PDF too large (${pdfSizeMB}MB). Maximum size is 50MB`);
    }

    console.log("Loading PDF document...");
    const loadingTask = getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
    });
    
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    console.log(`PDF has ${numPages} pages`);

    let totalArticles = 0;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      console.log(`Processing page ${pageNum}/${numPages}`);
      
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const { data: pageData, error: pageError } = await supabaseClient
        .from("pages")
        .insert({
          edition_id: editionId,
          page_number: pageNum,
          vision_api_response: { textItems: textContent.items.length },
        })
        .select()
        .single();

      if (pageError || !pageData) {
        console.error("Error saving page:", pageError);
        continue;
      }

      const articles = extractArticlesFromTextContent(textContent, page);
      console.log(`Page ${pageNum}: ${articles.length} articles extracted`);

      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const wordsCount = article.text.split(/\s+/).filter(w => w.length > 0).length;
        const readingTime = Math.ceil(wordsCount / 200) * 60;

        await supabaseClient.from("articles").insert({
          edition_id: editionId,
          page_id: pageData.id,
          titre: article.title || `Article ${totalArticles + i + 1}`,
          contenu_texte: article.text,
          position_x: article.bounds.x,
          position_y: article.bounds.y,
          width: article.bounds.width,
          height: article.bounds.height,
          ordre_lecture: totalArticles + i + 1,
          mots_count: wordsCount,
          temps_lecture_estime: readingTime,
          confidence_score: 0.95,
          valide: true,
        });
      }

      totalArticles += articles.length;
    }

    console.log(`Extraction complete: ${totalArticles} total articles`);

    await supabaseClient
      .from("editions")
      .update({
        statut: "ready",
        vision_api_processed: true,
        nb_pages: numPages,
        vision_api_error: null,
      })
      .eq("id", editionId);

    return new Response(
      JSON.stringify({
        success: true,
        editionId,
        pagesProcessed: numPages,
        articlesExtracted: totalArticles,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in extract-articles:", error);
    
    try {
      const { editionId } = await req.clone().json();
      if (editionId) {
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        await supabaseClient
          .from("editions")
          .update({ 
            statut: "draft",
            vision_api_error: error instanceof Error ? error.message : "Unknown error"
          })
          .eq("id", editionId);
      }
    } catch (updateError) {
      console.error("Failed to update edition status:", updateError);
    }
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractArticlesFromTextContent(textContent: any, page: any) {
  const viewport = page.getViewport({ scale: 1.0 });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;

  const items = textContent.items;
  if (!items || items.length === 0) {
    return [];
  }

  // Trier les items par position verticale puis horizontale
  const sortedItems = [...items].sort((a, b) => {
    const yA = a.transform[5];
    const yB = b.transform[5];
    if (Math.abs(yA - yB) > 5) {
      return yB - yA; // Top vers bottom
    }
    return a.transform[4] - b.transform[4]; // Left vers right
  });

  // Détecter les colonnes
  const columns = detectColumns(sortedItems, pageWidth);

  // Grouper les items en paragraphes par colonne
  const paragraphsByColumn = columns.map(column => {
    return groupIntoParagraphs(column.items, pageWidth, pageHeight);
  });

  // Fusionner les paragraphes en articles
  const allArticles: any[] = [];

  paragraphsByColumn.forEach((paragraphs, colIndex) => {
    let currentArticle: any = null;

    for (const para of paragraphs) {
      const isTitle = para.fontSize > 12 || para.isBold || para.text.length < 100;
      const isSubtitle = para.fontSize > 10 && para.text.length < 150;

      // Démarrer un nouvel article si:
      // - C'est un titre (grand texte ou court)
      // - Grand espacement vertical depuis le dernier paragraphe
      // - Changement significatif de police
      if (isTitle && (!currentArticle || para.yGap > 25)) {
        if (currentArticle && currentArticle.text.length > 100) {
          allArticles.push(currentArticle);
        }

        currentArticle = {
          title: para.text,
          text: para.text,
          fontSize: para.fontSize,
          minX: para.minX,
          minY: para.minY,
          maxX: para.maxX,
          maxY: para.maxY,
          column: colIndex,
        };
      } else if (currentArticle) {
        // Ajouter au paragraphe existant
        currentArticle.text += "\n\n" + para.text;
        currentArticle.minX = Math.min(currentArticle.minX, para.minX);
        currentArticle.minY = Math.min(currentArticle.minY, para.minY);
        currentArticle.maxX = Math.max(currentArticle.maxX, para.maxX);
        currentArticle.maxY = Math.max(currentArticle.maxY, para.maxY);
      } else if (!isTitle && para.text.length > 50) {
        // Créer un article pour un paragraphe orphelin
        currentArticle = {
          title: para.text.substring(0, 100) + "...",
          text: para.text,
          fontSize: para.fontSize,
          minX: para.minX,
          minY: para.minY,
          maxX: para.maxX,
          maxY: para.maxY,
          column: colIndex,
        };
      }
    }

    if (currentArticle && currentArticle.text.length > 100) {
      allArticles.push(currentArticle);
    }
  });

  // Convertir en format final avec coordonnées normalisées
  return allArticles
    .filter(article => article.text.length > 100)
    .map(article => ({
      title: cleanTitle(article.title),
      text: article.text,
      bounds: {
        x: article.minX / pageWidth,
        y: article.minY / pageHeight,
        width: (article.maxX - article.minX) / pageWidth,
        height: (article.maxY - article.minY) / pageHeight,
      },
    }));
}

function detectColumns(items: any[], pageWidth: number): any[] {
  const xPositions = items.map(item => item.transform[4]).sort((a, b) => a - b);

  if (xPositions.length === 0) return [{ items, minX: 0, maxX: pageWidth }];

  // Détecter les gaps horizontaux significatifs (plus de 40px)
  const gaps: number[] = [];
  for (let i = 1; i < xPositions.length; i++) {
    if (xPositions[i] - xPositions[i - 1] > 40) {
      gaps.push((xPositions[i] + xPositions[i - 1]) / 2);
    }
  }

  // Si pas de gap détecté, tout est dans une colonne
  if (gaps.length === 0) {
    return [{ items, minX: 0, maxX: pageWidth }];
  }

  // Créer les colonnes basées sur les gaps
  const boundaries = [0, ...gaps, pageWidth];
  const columns: any[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const minX = boundaries[i];
    const maxX = boundaries[i + 1];
    const columnItems = items.filter(item => {
      const x = item.transform[4];
      return x >= minX && x < maxX;
    });

    if (columnItems.length > 0) {
      columns.push({ items: columnItems, minX, maxX });
    }
  }

  return columns;
}

function groupIntoParagraphs(items: any[], pageWidth: number, pageHeight: number): any[] {
  const paragraphs: any[] = [];
  let currentPara: any = null;
  let lastY = -1;

  for (const item of items) {
    const text = item.str?.trim();
    if (!text) continue;

    const transform = item.transform;
    const x = transform[4];
    const y = transform[5];
    const fontSize = Math.abs(transform[0]);
    const width = item.width || 0;
    const height = item.height || fontSize;

    const yGap = lastY >= 0 ? Math.abs(lastY - y) : 0;
    const isBold = fontSize > 11 || (item.fontName && item.fontName.includes('Bold'));

    // Nouveau paragraphe si:
    // - Grand gap vertical (> 15px)
    // - Différence de taille de police
    const shouldBreak = yGap > 15 || (currentPara && Math.abs(fontSize - currentPara.fontSize) > 2);

    if (shouldBreak && currentPara) {
      if (currentPara.text.length > 20) {
        paragraphs.push(currentPara);
      }
      currentPara = null;
    }

    if (!currentPara) {
      currentPara = {
        text: text,
        fontSize,
        isBold,
        minX: x,
        minY: y,
        maxX: x + width,
        maxY: y + height,
        yGap,
      };
    } else {
      currentPara.text += " " + text;
      currentPara.minX = Math.min(currentPara.minX, x);
      currentPara.minY = Math.min(currentPara.minY, y);
      currentPara.maxX = Math.max(currentPara.maxX, x + width);
      currentPara.maxY = Math.max(currentPara.maxY, y + height);
    }

    lastY = y;
  }

  if (currentPara && currentPara.text.length > 20) {
    paragraphs.push(currentPara);
  }

  return paragraphs;
}

function cleanTitle(title: string): string {
  // Nettoyer le titre
  let cleaned = title.trim();

  // Limiter à 150 caractères
  if (cleaned.length > 150) {
    cleaned = cleaned.substring(0, 147) + "...";
  }

  // Supprimer les caractères spéciaux en début/fin
  cleaned = cleaned.replace(/^[^\w\s]+|[^\w\s]+$/g, '');

  // Première lettre en majuscule
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned || "Article sans titre";
}
