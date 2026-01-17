// Google Cloud Vision OCR API
export default async function handler(req, res) {
  // CORS headers
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

    // Extract base64 data (remove data:image/...;base64, prefix)
    let base64Data = image;
    if (image.startsWith('data:')) {
      base64Data = image.split(',')[1];
    }

    // Call Google Vision API
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Data },
              features: [{ type: 'TEXT_DETECTION', maxResults: 50 }]
            }
          ]
        })
      }
    );

    const data = await response.json();
    
    if (data.error) {
      console.error('Google Vision error:', data.error);
      return res.status(500).json({ error: data.error.message || 'Google Vision API error' });
    }

    // Extract the full text from the response
    const textAnnotations = data.responses?.[0]?.textAnnotations || [];
    const fullText = textAnnotations[0]?.description || '';

    return res.status(200).json({ text: fullText });

  } catch (error) {
    console.error('OCR error:', error);
    return res.status(500).json({ 
      error: 'OCR failed', 
      message: error.message || 'Failed to extract text from image.' 
    });
  }
}
