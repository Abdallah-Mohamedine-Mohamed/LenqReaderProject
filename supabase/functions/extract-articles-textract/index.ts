import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

    console.log("[TEXTRACT] Starting extraction for edition:", editionId);

    await supabaseClient
      .from("editions")
      .update({ statut: "processing", vision_api_processed: false })
      .eq("id", editionId);

    console.log("[TEXTRACT] Downloading PDF...");
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
    }
    
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfSizeMB = (pdfBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log(`[TEXTRACT] PDF size: ${pdfSizeMB}MB`);
    
    const maxPdfSizeMB = 25;
    if (pdfBuffer.byteLength > maxPdfSizeMB * 1024 * 1024) {
      throw new Error(`PDF trop volumineux (${pdfSizeMB}MB). Maximum ${maxPdfSizeMB}MB.`);
    }

    const region = Deno.env.get("AWS_REGION") ?? "eu-north-1";
    const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
    const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";

    console.log("[TEXTRACT] Calling AWS Textract API via HTTP...");
    
    const pdfBase64 = arrayBufferToBase64(pdfBuffer);
    
    const requestBody = JSON.stringify({
      Document: {
        Bytes: pdfBase64
      },
      FeatureTypes: ["LAYOUT"]
    });

    const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const date = timestamp.substring(0, 8);

    const host = `textract.${region}.amazonaws.com`;
    const service = 'textract';
    const target = 'Textract.AnalyzeDocument';

    const canonicalRequest = [
      'POST',
      '/',
      '',
      `host:${host}`,
      `x-amz-date:${timestamp}`,
      `x-amz-target:${target}`,
      '',
      'host;x-amz-date;x-amz-target',
      await sha256(requestBody)
    ].join('\n');

    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      await sha256(canonicalRequest)
    ].join('\n');

    const signingKey = await getSignatureKey(secretAccessKey, date, region, service);
    const signature = await hmacHex(signingKey, stringToSign);

    const authorization = [
      'AWS4-HMAC-SHA256',
      `Credential=${accessKeyId}/${credentialScope}`,
      'SignedHeaders=host;x-amz-date;x-amz-target',
      `Signature=${signature}`
    ].join(', ');

    const textractResponse = await fetch(`https://${host}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': target,
        'X-Amz-Date': timestamp,
        'Authorization': authorization,
        'Host': host,
      },
      body: requestBody
    });

    if (!textractResponse.ok) {
      const errorText = await textractResponse.text();
      console.error('[TEXTRACT] API Error:', errorText);
      throw new Error(`Textract API error: ${textractResponse.status} - ${errorText}`);
    }

    const textractData = await textractResponse.json();
    const blocks = textractData.Blocks || [];
    console.log(`[TEXTRACT] Received ${blocks.length} blocks`);

    const blockMap = new Map();
    blocks.forEach((block: any) => blockMap.set(block.Id, block));

    const layoutBlocks = blocks.filter((b: any) => 
      b.BlockType === "LAYOUT_TITLE" || 
      b.BlockType === "LAYOUT_TEXT" ||
      b.BlockType === "LAYOUT_SECTION_HEADER" ||
      b.BlockType === "LAYOUT_LIST"
    );

    console.log(`[TEXTRACT] Found ${layoutBlocks.length} layout blocks`);

    const pageNumbers = new Set(blocks.filter((b: any) => b.Page).map((b: any) => b.Page));
    console.log(`[TEXTRACT] Document has ${pageNumbers.size} pages`);

    const pages = new Map<number, any[]>();
    for (const layoutBlock of layoutBlocks) {
      const pageNum = layoutBlock.Page || 1;
      if (!pages.has(pageNum)) pages.set(pageNum, []);
      pages.get(pageNum)!.push(layoutBlock);
    }

    let totalArticles = 0;

    for (const [pageNum, pageLayoutBlocks] of Array.from(pages.entries()).sort((a, b) => a[0] - b[0])) {
      console.log(`[TEXTRACT] Processing page ${pageNum}`);
      
      const { data: pageData, error: pageError } = await supabaseClient
        .from("pages")
        .insert({
          edition_id: editionId,
          page_number: pageNum,
          vision_api_response: { layoutBlocks: pageLayoutBlocks.length },
        })
        .select()
        .single();

      if (pageError || !pageData) {
        console.error("[TEXTRACT] Error saving page:", pageError);
        continue;
      }

      pageLayoutBlocks.sort((a: any, b: any) => {
        const aTop = a.Geometry?.BoundingBox?.Top || 0;
        const bTop = b.Geometry?.BoundingBox?.Top || 0;
        return aTop - bTop;
      });

      let currentArticle: any = null;
      let articleNumber = 0;

      for (const layoutBlock of pageLayoutBlocks) {
        const blockType = layoutBlock.BlockType;
        const text = getTextFromBlock(layoutBlock, blockMap);
        
        if (!text || text.trim().length < 5) continue;

        if (blockType === "LAYOUT_TITLE" || blockType === "LAYOUT_SECTION_HEADER") {
          if (currentArticle && currentArticle.content.length > 100) {
            await saveArticle(supabaseClient, currentArticle, editionId, pageData.id, totalArticles + articleNumber + 1);
            articleNumber++;
          }

          currentArticle = {
            title: text.trim(),
            subtitle: null,
            author: null,
            content: "",
            blocks: [layoutBlock],
            pageNumber: pageNum,
          };
        } 
        else if (blockType === "LAYOUT_TEXT" || blockType === "LAYOUT_LIST") {
          if (!currentArticle) {
            currentArticle = {
              title: text.length > 100 ? text.substring(0, 100) + "..." : text,
              subtitle: null,
              author: null,
              content: text,
              blocks: [layoutBlock],
              pageNumber: pageNum,
            };
          } else {
            if (!currentArticle.subtitle && text.length < 200 && currentArticle.content.length === 0) {
              currentArticle.subtitle = text.trim();
            }
            
            const authorMatch = text.match(/^(?:Par|De)\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)+)/i);
            if (authorMatch && !currentArticle.author) {
              currentArticle.author = authorMatch[1];
            }

            currentArticle.content += (currentArticle.content ? "\n\n" : "") + text;
            currentArticle.blocks.push(layoutBlock);
          }
        }
      }

      if (currentArticle && currentArticle.content.length > 100) {
        await saveArticle(supabaseClient, currentArticle, editionId, pageData.id, totalArticles + articleNumber + 1);
        articleNumber++;
      }

      totalArticles += articleNumber;
    }

    console.log(`[TEXTRACT] Complete: ${totalArticles} articles`);

    await supabaseClient
      .from("editions")
      .update({
        statut: "ready",
        vision_api_processed: true,
        nb_pages: pageNumbers.size,
        vision_api_error: null,
      })
      .eq("id", editionId);

    return new Response(
      JSON.stringify({
        success: true,
        editionId,
        pagesProcessed: pageNumbers.size,
        articlesExtracted: totalArticles,
        method: 'textract_layout',
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[TEXTRACT] ERROR:", error);
    
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
    } catch {}
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getTextFromBlock(layoutBlock: any, blockMap: Map<any, any>): string {
  const texts: string[] = [];
  
  if (layoutBlock.Relationships) {
    for (const relationship of layoutBlock.Relationships) {
      if (relationship.Type === "CHILD") {
        for (const childId of relationship.Ids) {
          const childBlock = blockMap.get(childId);
          if (childBlock?.BlockType === "LINE" && childBlock.Text) {
            texts.push(childBlock.Text);
          }
        }
      }
    }
  }
  
  return texts.join(" ");
}

async function saveArticle(supabaseClient: any, article: any, editionId: string, pageId: string, ordre: number) {
  const wordsCount = article.content.split(/\s+/).filter((w: string) => w.length > 0).length;
  const readingTime = Math.ceil(wordsCount / 200) * 60;
  
  const bounds = calculateBounds(article.blocks);
  const confidence = calculateConfidence(article.blocks);

  await supabaseClient.from("articles").insert({
    edition_id: editionId,
    page_id: pageId,
    titre: article.title,
    sous_titre: article.subtitle,
    auteur: article.author,
    contenu_texte: article.content,
    position_x: bounds.x,
    position_y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    ordre_lecture: ordre,
    mots_count: wordsCount,
    temps_lecture_estime: readingTime,
    confidence_score: confidence,
    textract_confidence: confidence,
    extraction_method: 'textract',
    layout_metadata: {
      blocksCount: article.blocks.length,
      hasSubtitle: !!article.subtitle,
      hasAuthor: !!article.author,
    },
    valide: confidence > 70,
  });
}

function calculateBounds(blocks: any[]): { x: number; y: number; width: number; height: number } {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  
  for (const block of blocks) {
    const bbox = block.Geometry?.BoundingBox;
    if (bbox) {
      minX = Math.min(minX, bbox.Left);
      minY = Math.min(minY, bbox.Top);
      maxX = Math.max(maxX, bbox.Left + bbox.Width);
      maxY = Math.max(maxY, bbox.Top + bbox.Height);
    }
  }
  
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function calculateConfidence(blocks: any[]): number {
  const confidences = blocks.map(b => b.Confidence).filter(c => c);
  if (confidences.length === 0) return 0;
  return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(key: Uint8Array, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<Uint8Array> {
  const kDate = await hmac(new TextEncoder().encode('AWS4' + key), dateStamp);
  const kRegion = await hmac(kDate, regionName);
  const kService = await hmac(kRegion, serviceName);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
