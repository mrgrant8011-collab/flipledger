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

  return extractTextFromVisionResponse(data);
}

function extractTextFromVisionResponse(data) {
  const visionResponse = data.responses?.[0];
  if (!visionResponse) {
    console.log('[OCR] No response from Vision API');
    return '';
  }

  const fullTextAnnotation = visionResponse.fullTextAnnotation;
  const textAnnotations = visionResponse.textAnnotations;

  if (fullTextAnnotation && fullTextAnnotation.text && fullTextAnnotation.text.trim()) {
    console.log('[OCR] Using fullTextAnnotation.text');
    return fullTextAnnotation.text;
  }

  if (textAnnotations && textAnnotations.length > 0 && textAnnotations[0].description) {
    console.log('[OCR] Using textAnnotations[0].description');
    return textAnnotations[0].description;
  }

  console.log('[OCR] No text found in response');
  return '';
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
    return '';
  }

  const visionResponse = data.responses?.[0];
  if (!visionResponse) {
    console.log(`[OCR] Chunk ${chunkIndex + 1}: No response object`);
    return '';
  }

  const fullTextAnnotation = visionResponse.fullTextAnnotation;
  const textAnnotations = visionResponse.textAnnotations;

  let chunkText = '';

  if (fullTextAnnotation && fullTextAnnotation.text && fullTextAnnotation.text.trim()) {
    chunkText = fullTextAnnotation.text;
    console.log(`[OCR] Chunk ${chunkIndex + 1}: Got ${chunkText.length} chars from fullTextAnnotation.text`);
  } else if (textAnnotations && textAnnotations.length > 0 && textAnnotations[0].description) {
    chunkText = textAnnotations[0].description;
    console.log(`[OCR] Chunk ${chunkIndex + 1}: Got ${chunkText.length} chars from textAnnotations[0].description`);
  } else {
    console.log(`[OCR] Chunk ${chunkIndex + 1}: No text found in response`);
  }

  return chunkText;
}

async function processImageInChunks(imageBuffer, apiKey, dimensions, chunkHeight, overlap) {
  const chunks = await sliceImageIntoChunks(imageBuffer, dimensions, chunkHeight, overlap);
  
  console.log(`[OCR] Created ${chunks.length} physical chunks`);
  
  const chunkTexts = [];
  
  for (const chunk of chunks) {
    console.log(`[OCR] Processing chunk ${chunk.index + 1}/${chunks.length}...`);
    
    const text = await ocrSingleChunk(chunk.base64, apiKey, chunk.index);
    
    chunkTexts.push({
      index: chunk.index,
      yOffset: chunk.yOffset,
      height: chunk.height,
      text: text
    });
  }
  
  const mergedText = mergeChunkTexts(chunkTexts, overlap);
  
  console.log(`[OCR] Final merged text length: ${mergedText.length}`);
  
  return mergedText;
}

function mergeChunkTexts(chunkTexts, overlap) {
  if (chunkTexts.length === 0) return '';
  if (chunkTexts.length === 1) return chunkTexts[0].text;
  
  const allLines = [];
  
  for (let i = 0; i < chunkTexts.length; i++) {
    const chunk = chunkTexts[i];
    const nextChunk = chunkTexts[i + 1];
    
    if (!chunk.text || !chunk.text.trim()) {
      console.log(`[OCR] Chunk ${i + 1} is empty, skipping`);
      continue;
    }
    
    const lines = chunk.text.split('\n');
    
    if (!nextChunk || !nextChunk.text || !nextChunk.text.trim()) {
      allLines.push(...lines);
      continue;
    }
    
    const nextLines = nextChunk.text.split('\n');
    const nextFirstLines = nextLines.slice(0, 20).map(l => l.trim()).filter(l => l.length > 3);
    
    let cutIndex = lines.length;
    
    for (let j = lines.length - 1; j >= Math.max(0, lines.length - 25); j--) {
      const line = lines[j].trim();
      if (line.length <= 3) continue;
      
      const foundInNext = nextFirstLines.some(nextLine => {
        if (line.length >= 10 && nextLine.length >= 10) {
          return line === nextLine;
        }
        if (line.length >= 6 && nextLine.length >= 6) {
          return line.substring(0, Math.min(line.length, 50)) === nextLine.substring(0, Math.min(nextLine.length, 50));
        }
        return false;
      });
      
      if (foundInNext) {
        cutIndex = j;
        console.log(`[OCR] Overlap found at chunk ${i + 1}, line ${j}: "${line.substring(0, 40)}"`);
        break;
      }
    }
    
    allLines.push(...lines.slice(0, cutIndex));
  }
  
  return allLines.join('\n');
}
