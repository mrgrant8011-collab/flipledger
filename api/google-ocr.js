import sharp from 'sharp';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GOOGLE_VISION_API_KEY not configured' });
    }

    let base64Data = image;
    
    if (image.startsWith('data:')) {
      const matches = image.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        base64Data = matches[2];
      } else {
        base64Data = image.split(',')[1];
      }
    }

    const imageBuffer = Buffer.from(base64Data, 'base64');
    const metadata = await sharp(imageBuffer).metadata();
    const dimensions = {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format
    };
    
    console.log(`[OCR] Image dimensions: ${dimensions.width}x${dimensions.height}`);
    
    const CHUNK_HEIGHT = 3000;
    const OVERLAP = 300;
    const MAX_HEIGHT_SINGLE = 3000;
    
    let fullText = '';
    
    if (dimensions.height <= MAX_HEIGHT_SINGLE) {
      console.log('[OCR] Processing as single image');
      fullText = await callGoogleVisionOCR(base64Data, apiKey);
    } else {
      console.log(`[OCR] Long image detected (${dimensions.height}px). Slicing into chunks...`);
      fullText = await processImageInChunks(imageBuffer, apiKey, dimensions, CHUNK_HEIGHT, OVERLAP);
    }

    return res.status(200).json({ 
      text: fullText,
      dimensions: dimensions,
      chunked: dimensions.height > MAX_HEIGHT_SINGLE
    });

  } catch (error) {
    console.error('OCR error:', error);
    return res.status(500).json({ 
      error: 'OCR failed', 
      message: error.message || 'Failed to extract text from image.' 
    });
  }
}

async function callGoogleVisionOCR(base64Data, apiKey) {
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Data },
            features: [
              { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 50 }
            ],
            imageContext: {
              languageHints: ['en']
            }
          }
        ]
      })
    }
  );

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || 'Google Vision API error');
  }

  const fullTextAnnotation = data.responses?.[0]?.fullTextAnnotation;
  if (fullTextAnnotation?.text) {
    return fullTextAnnotation.text;
  }
  
  const textAnnotations = data.responses?.[0]?.textAnnotations || [];
  return textAnnotations[0]?.description || '';
}

async function sliceImageIntoChunks(imageBuffer, dimensions, chunkHeight, overlap) {
  const chunks = [];
  const { width, height } = dimensions;
  
  let y = 0;
  let chunkIndex = 0;
  
  while (y < height) {
    const currentChunkHeight = Math.min(chunkHeight, height - y);
    
    const chunkBuffer = await sharp(imageBuffer)
      .extract({
        left: 0,
        top: y,
        width: width,
        height: currentChunkHeight
      })
      .png()
      .toBuffer();
    
    const chunkBase64 = chunkBuffer.toString('base64');
    
    chunks.push({
      index: chunkIndex,
      base64: chunkBase64,
      yOffset: y,
      height: currentChunkHeight
    });
    
    console.log(`[OCR] Created chunk ${chunkIndex + 1}: y=${y}, height=${currentChunkHeight}`);
    
    y += chunkHeight - overlap;
    chunkIndex++;
    
    if (y >= height) break;
  }
  
  return chunks;
}

async function ocrSingleChunk(chunkBase64, apiKey, chunkIndex) {
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: chunkBase64 },
            features: [
              { type: 'DOCUMENT_TEXT_DETECTION' }
            ],
            imageContext: {
              languageHints: ['en']
            }
          }
        ]
      })
    }
  );

  const data = await response.json();
  
  if (data.error) {
    console.error(`[OCR] Chunk ${chunkIndex + 1} API error:`, data.error.message);
    return { text: '', blocks: [] };
  }

  const fullTextAnnotation = data.responses?.[0]?.fullTextAnnotation;
  const textAnnotations = data.responses?.[0]?.textAnnotations || [];
  
  let chunkText = '';
  const blocks = [];
  
  if (fullTextAnnotation?.pages && fullTextAnnotation.pages.length > 0) {
    for (const page of fullTextAnnotation.pages) {
      for (const block of page.blocks || []) {
        const blockVertices = block.boundingBox?.vertices || [];
        const blockMinY = blockVertices.length > 0 ? Math.min(...blockVertices.map(v => v.y || 0)) : 0;
        const blockMaxY = blockVertices.length > 0 ? Math.max(...blockVertices.map(v => v.y || 0)) : 0;
        const blockText = extractBlockText(block);
        
        if (blockText.trim()) {
          blocks.push({
            minY: blockMinY,
            maxY: blockMaxY,
            text: blockText
          });
        }
      }
    }
    
    if (blocks.length > 0) {
      blocks.sort((a, b) => a.minY - b.minY);
      chunkText = blocks.map(b => b.text).join('\n');
    } else if (fullTextAnnotation.text) {
      chunkText = fullTextAnnotation.text;
    }
  } else if (fullTextAnnotation?.text) {
    chunkText = fullTextAnnotation.text;
  } else if (textAnnotations.length > 0 && textAnnotations[0]?.description) {
    chunkText = textAnnotations[0].description;
  }
  
  console.log(`[OCR] Chunk ${chunkIndex + 1} extracted ${chunkText.length} chars, ${blocks.length} blocks`);
  
  return { text: chunkText, blocks };
}

function extractBlockText(block) {
  let text = '';
  for (const para of block.paragraphs || []) {
    for (const word of para.words || []) {
      for (const symbol of word.symbols || []) {
        text += symbol.text || '';
        if (symbol.property?.detectedBreak) {
          const breakType = symbol.property.detectedBreak.type;
          if (breakType === 'SPACE' || breakType === 'SURE_SPACE') {
            text += ' ';
          } else if (breakType === 'EOL_SURE_SPACE' || breakType === 'LINE_BREAK') {
            text += '\n';
          }
        }
      }
      text += ' ';
    }
  }
  return text.trim();
}

async function processImageInChunks(imageBuffer, apiKey, dimensions, chunkHeight, overlap) {
  const chunks = await sliceImageIntoChunks(imageBuffer, dimensions, chunkHeight, overlap);
  
  console.log(`[OCR] Created ${chunks.length} physical chunks`);
  
  const chunkResults = [];
  
  for (const chunk of chunks) {
    console.log(`[OCR] OCR processing chunk ${chunk.index + 1}/${chunks.length}...`);
    
    const ocrResult = await ocrSingleChunk(chunk.base64, apiKey, chunk.index);
    
    chunkResults.push({
      chunkIndex: chunk.index,
      yOffset: chunk.yOffset,
      height: chunk.height,
      text: ocrResult.text,
      blocks: ocrResult.blocks.map(b => ({
        ...b,
        globalMinY: b.minY + chunk.yOffset,
        globalMaxY: b.maxY + chunk.yOffset
      }))
    });
  }
  
  const mergedText = mergeChunkResults(chunkResults, overlap);
  
  console.log(`[OCR] Final merged text length: ${mergedText.length}`);
  
  return mergedText;
}

function mergeChunkResults(chunkResults, overlap) {
  if (chunkResults.length === 0) return '';
  if (chunkResults.length === 1) return chunkResults[0].text;
  
  const finalLines = [];
  
  for (let i = 0; i < chunkResults.length; i++) {
    const chunk = chunkResults[i];
    const nextChunk = chunkResults[i + 1];
    
    const chunkLines = chunk.text.split('\n').filter(line => line.trim());
    
    if (!nextChunk) {
      finalLines.push(...chunkLines);
      continue;
    }
    
    const overlapStartY = nextChunk.yOffset;
    const overlapEndY = nextChunk.yOffset + overlap;
    
    const nextChunkLines = nextChunk.text.split('\n').filter(line => line.trim());
    const nextChunkFirstLines = nextChunkLines.slice(0, 15);
    
    let cutoffIndex = chunkLines.length;
    
    for (let j = chunkLines.length - 1; j >= Math.max(0, chunkLines.length - 20); j--) {
      const line = chunkLines[j].trim();
      if (!line || line.length < 5) continue;
      
      const lineStart = line.substring(0, 60);
      
      for (const nextLine of nextChunkFirstLines) {
        const nextLineStart = nextLine.trim().substring(0, 60);
        
        if (lineStart === nextLineStart && lineStart.length >= 5) {
          cutoffIndex = j;
          console.log(`[OCR] Found overlap at chunk ${i + 1} line ${j}: "${lineStart.substring(0, 40)}..."`);
          break;
        }
      }
      
      if (cutoffIndex < chunkLines.length) break;
    }
    
    const linesToKeep = chunkLines.slice(0, cutoffIndex);
    finalLines.push(...linesToKeep);
  }
  
  return finalLines.join('\n');
}
