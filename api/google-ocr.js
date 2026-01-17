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

    const salePriceCount = (fullText.match(/Sale Price/gi) || []).length;
    console.log(`[OCR] Final "Sale Price" occurrences: ${salePriceCount}`);

    return res.status(200).json({ 
      text: fullText,
      dimensions: dimensions,
      chunked: dimensions.height > MAX_HEIGHT_SINGLE,
      salePriceCount: salePriceCount
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

  const visionResponse = data.responses?.[0];
  if (!visionResponse) {
    return '';
  }

  const fullTextAnnotation = visionResponse.fullTextAnnotation;
  const textAnnotations = visionResponse.textAnnotations;

  if (fullTextAnnotation && fullTextAnnotation.text && fullTextAnnotation.text.trim()) {
    return fullTextAnnotation.text;
  }

  if (textAnnotations && textAnnotations.length > 0 && textAnnotations[0].description) {
    return textAnnotations[0].description;
  }

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
  } else if (textAnnotations && textAnnotations.length > 0 && textAnnotations[0].description) {
    chunkText = textAnnotations[0].description;
  }

  console.log(`[OCR] Chunk ${chunkIndex + 1}: Got ${chunkText.length} chars`);

  return chunkText;
}

async function processImageInChunks(imageBuffer, apiKey, dimensions, chunkHeight, overlap) {
  const chunks = await sliceImageIntoChunks(imageBuffer, dimensions, chunkHeight, overlap);
  
  console.log(`[OCR] Created ${chunks.length} physical chunks`);
  
  const chunkTexts = [];
  
  for (const chunk of chunks) {
    console.log(`[OCR] Processing chunk ${chunk.index + 1}/${chunks.length}...`);
    
    const text = await ocrSingleChunk(chunk.base64, apiKey, chunk.index);
    
    const lines = text.split('\n');
    console.log(`[OCR] Chunk ${chunk.index + 1} DEBUG:`);
    console.log(`  - Total lines: ${lines.length}`);
    console.log(`  - Text length: ${text.length}`);
    console.log(`  - First 5 lines: ${JSON.stringify(lines.slice(0, 5))}`);
    console.log(`  - Last 5 lines: ${JSON.stringify(lines.slice(-5))}`);
    
    chunkTexts.push({
      index: chunk.index,
      text: text
    });
  }
  
  const mergedText = mergeChunkTexts(chunkTexts);
  
  const finalLines = mergedText.split('\n');
  console.log(`[OCR] Final merged total lines: ${finalLines.length}`);
  
  return mergedText;
}

function normalizeLine(line) {
  return line.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findStrictSuffixPrefixOverlap(linesA, linesB, minK) {
  const maxK = Math.min(50, linesA.length, linesB.length);
  
  const normalizedSuffixA = linesA.slice(-maxK).map(normalizeLine);
  const normalizedPrefixB = linesB.slice(0, maxK).map(normalizeLine);
  
  let bestK = 0;
  
  for (let k = minK; k <= maxK; k++) {
    const suffixStart = normalizedSuffixA.length - k;
    let match = true;
    
    for (let i = 0; i < k; i++) {
      const lineFromA = normalizedSuffixA[suffixStart + i];
      const lineFromB = normalizedPrefixB[i];
      
      if (lineFromA.length < 2 && lineFromB.length < 2) {
        continue;
      }
      
      if (lineFromA !== lineFromB) {
        match = false;
        break;
      }
    }
    
    if (match) {
      bestK = k;
    }
  }
  
  return bestK;
}

function mergeChunkTexts(chunkTexts) {
  if (chunkTexts.length === 0) return '';
  if (chunkTexts.length === 1) return chunkTexts[0].text;
  
  const MIN_K = 3;
  
  let mergedLines = chunkTexts[0].text.split('\n');
  
  for (let i = 1; i < chunkTexts.length; i++) {
    const chunkB = chunkTexts[i].text;
    
    if (!chunkB || !chunkB.trim()) {
      console.log(`[OCR] Merge: Chunk ${i + 1} is empty, skipping`);
      continue;
    }
    
    const linesB = chunkB.split('\n');
    
    const k = findStrictSuffixPrefixOverlap(mergedLines, linesB, MIN_K);
    
    console.log(`[OCR] Merge chunk ${i} -> ${i + 1}:`);
    console.log(`  - Lines in A (merged so far): ${mergedLines.length}`);
    console.log(`  - Lines in B: ${linesB.length}`);
    console.log(`  - Strict suffix/prefix overlap k: ${k}`);
    
    if (k >= MIN_K) {
      console.log(`  - Removing first ${k} lines from chunk B (overlap)`);
      const newLines = linesB.slice(k);
      mergedLines = mergedLines.concat(newLines);
      console.log(`  - After merge: ${mergedLines.length} lines`);
    } else {
      console.log(`  - No sufficient overlap (k < ${MIN_K}), appending all of chunk B`);
      mergedLines = mergedLines.concat(linesB);
      console.log(`  - After merge: ${mergedLines.length} lines`);
    }
  }
  
  return mergedLines.join('\n');
}
