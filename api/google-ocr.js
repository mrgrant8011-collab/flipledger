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

async function ocrChunkWithBlocks(chunkBase64, apiKey) {
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
    throw new Error(data.error.message || 'Google Vision API error');
  }

  const blocks = [];
  const fullTextAnnotation = data.responses?.[0]?.fullTextAnnotation;
  
  if (fullTextAnnotation?.pages) {
    for (const page of fullTextAnnotation.pages) {
      for (const block of page.blocks || []) {
        const blockVertices = block.boundingBox?.vertices || [];
        if (blockVertices.length === 0) continue;
        
        const blockMinY = Math.min(...blockVertices.map(v => v.y || 0));
        const blockMaxY = Math.max(...blockVertices.map(v => v.y || 0));
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
  }
  
  return blocks;
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
  
  const allBlocks = [];
  
  for (const chunk of chunks) {
    console.log(`[OCR] OCR processing chunk ${chunk.index + 1}/${chunks.length}...`);
    
    const chunkBlocks = await ocrChunkWithBlocks(chunk.base64, apiKey);
    
    for (const block of chunkBlocks) {
      allBlocks.push({
        globalMinY: block.minY + chunk.yOffset,
        globalMaxY: block.maxY + chunk.yOffset,
        text: block.text,
        chunkIndex: chunk.index
      });
    }
    
    console.log(`[OCR] Chunk ${chunk.index + 1} returned ${chunkBlocks.length} blocks`);
  }
  
  const deduplicatedBlocks = deduplicateBlocks(allBlocks, overlap);
  
  deduplicatedBlocks.sort((a, b) => a.globalMinY - b.globalMinY);
  
  const mergedText = deduplicatedBlocks.map(b => b.text).join('\n');
  
  console.log(`[OCR] Final merged text length: ${mergedText.length}`);
  
  return mergedText;
}

function deduplicateBlocks(blocks, overlap) {
  if (blocks.length === 0) return [];
  
  const seen = new Map();
  const result = [];
  
  for (const block of blocks) {
    const textKey = block.text.trim().substring(0, 100);
    const yBucket = Math.floor(block.globalMinY / 50);
    const key = `${textKey}-${yBucket}`;
    
    if (seen.has(key)) {
      const existing = seen.get(key);
      if (block.chunkIndex < existing.chunkIndex) {
        const idx = result.indexOf(existing);
        if (idx !== -1) {
          result[idx] = block;
        }
        seen.set(key, block);
      }
    } else {
      seen.set(key, block);
      result.push(block);
    }
  }
  
  return result;
}
