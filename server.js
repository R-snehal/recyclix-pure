require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Recyclix AI server running!' });
});

app.post('/api/classify', async (req, res) => {
    const { wasteLabel, category, confidence } = req.body;

    if (!wasteLabel) {
        return res.status(400).json({ error: 'No waste label provided.' });
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{
                    role: "user",
                    content: `You are an eco-friendly waste disposal expert helping citizens of Bhopal, India.
A waste item has been identified as: "${wasteLabel}"
Category detected: "${category || 'Unknown'}"
AI Confidence: ${confidence || 'N/A'}%
Give a response in exactly this format (keep it short and friendly):
1. Which bin it goes in (mention the colour: Blue/Green/Red/Yellow bin)
2. One specific recycling or disposal tip
3. One fun eco fact about this type of waste
Keep the total response under 4 sentences. Be warm and encouraging.`
                }],
                max_tokens: 200,
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('Groq API error:', data.error.message);
            throw new Error(data.error.message);
        }

        const advice = data.choices[0].message.content;
        console.log(`✅ [${new Date().toISOString()}] Classified: ${wasteLabel} → ${category}`);
        res.json({ advice, success: true });

    } catch (error) {
        console.error('Groq API Error:', error.message);
        res.status(500).json({
            advice: `This item appears to be ${wasteLabel} (${category}). Please check your local BMC guidelines for proper disposal.`,
            success: false
        });
    }
});

app.listen(PORT, () => {
    console.log(`\n✅ Recyclix AI server is running!`);
    console.log(`👉 Open your app at: http://localhost:${PORT}`);
    console.log(`🔍 Health check at: http://localhost:${PORT}/health\n`);
});