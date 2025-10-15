// server.js
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const pdf = require('pdf-parse');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const showdown = require('showdown');
const converter = new showdown.Converter();
require('dotenv').config();

const app = express();
const port = 3000;

// --- Middleware & View Engine Setup ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Session Configuration ---
app.use(session({
    secret: process.env.SESSION_SECRET || uuidv4(),
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false,
        maxAge: 30 * 60 * 1000 // 30 minutes
    }
}));

// --- In-Memory User Storage (Replace with database in production) ---
const users = new Map();

// --- Credit System Configuration ---
const CREDIT_COSTS = {
    MCQ_PER_QUESTION: 1,
    PDF_SUMMARY: 5
};

const FREE_CREDITS = 20; // Free trial credits

// --- Middleware to initialize user session ---
app.use((req, res, next) => {
    if (!req.session.userId) {
        req.session.userId = uuidv4();
        users.set(req.session.userId, {
            credits: FREE_CREDITS,
            createdAt: new Date(),
            usageHistory: []
        });
    }
    
    // Attach user to request
    req.user = users.get(req.session.userId);
    if (!req.user) {
        req.user = {
            credits: FREE_CREDITS,
            createdAt: new Date(),
            usageHistory: []
        };
        users.set(req.session.userId, req.user);
    }
    
    next();
});

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// --- Routes ---

app.get('/', (req, res) => {
    res.render('dashboard', { credits: req.user.credits });
});

app.get("/squiz", (req, res) => {
    res.render("generator", { 
        error: null, 
        credits: req.user.credits 
    });
});

app.get("/summarizer", (req, res) => {
    res.render("summarizer", { 
        error: null, 
        summary: null,
        credits: req.user.credits 
    });
});

app.get("/credits", (req, res) => {
    res.render("credits", { 
        credits: req.user.credits,
        usageHistory: req.user.usageHistory || []
    });
});

// --- Generate Quiz Route ---
app.post('/generate-quiz', upload.single('document'), async (req, res) => {
    const numQuestions = parseInt(req.body.num_questions, 10) || 5;
    const textInput = req.body.text_input;
    const file = req.file;
    let sourceContent = '';

    // Calculate required credits
    const requiredCredits = numQuestions * CREDIT_COSTS.MCQ_PER_QUESTION;

    // Check if user has enough credits
    if (req.user.credits < requiredCredits) {
        return res.render('generator', { 
            error: `Insufficient credits! You need ${requiredCredits} credits but only have ${req.user.credits}. Please purchase more credits.`,
            credits: req.user.credits
        });
    }

    try {
        // Extract content from file or text input
        if (file) {
            if (file.mimetype === 'application/pdf') {
                try {
                    const data = await pdf(file.buffer);
                    sourceContent = data.text;
                } catch (pdfError) {
                    console.error('PDF parsing error:', pdfError);
                    return res.render('generator', { 
                        error: 'Failed to parse PDF. Please ensure it contains readable text.',
                        credits: req.user.credits
                    });
                }
            } else {
                return res.render('generator', { 
                    error: 'Invalid file type. Please upload a PDF.',
                    credits: req.user.credits
                });
            }
        } else if (textInput && textInput.trim() !== '') {
            sourceContent = textInput.trim();
        } else {
            return res.render('generator', { 
                error: 'Please upload a PDF or paste some text to generate a quiz.',
                credits: req.user.credits
            });
        }

        if (sourceContent.trim().length < 50) {
            return res.render('generator', { 
                error: 'The source text is too short. Please provide at least 50 characters of content.',
                credits: req.user.credits
            });
        }

        // Truncate very long content
        if (sourceContent.length > 10000) {
            sourceContent = sourceContent.substring(0, 10000);
        }

        const prompt = `Create exactly ${numQuestions} multiple-choice questions based on the text below.

IMPORTANT FORMAT RULES:
- Number each question as "1.", "2.", etc.
- Provide exactly 4 options labeled "A)", "B)", "C)", "D)"
- After all options, write "Answer: X)" where X is the correct letter
- Keep questions clear and concise

Example format:
1. What is the capital of France?
A) London
B) Berlin
C) Paris
D) Madrid
Answer: C)

Text to create questions from:
---
${sourceContent}
---

Now create ${numQuestions} questions following the exact format shown above.`;

        console.log('Sending request to OpenRouter API...');

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'meta-llama/llama-3.2-3b-instruct:free',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 2000
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000
            }
        );

        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
            console.error("Invalid response structure from AI:", response.data);
            return res.render('generator', { 
                error: 'The AI returned an invalid response. Please try again.',
                credits: req.user.credits
            });
        }

        const quizText = response.data.choices[0].message.content;
        const formattedQuiz = parseMcqText(quizText);

        if (formattedQuiz.length === 0) {
            return res.render('generator', { 
                error: 'Could not generate a valid quiz. Please try again with different content or fewer questions.',
                credits: req.user.credits
            });
        }

        // Deduct credits
        req.user.credits -= requiredCredits;
        req.user.usageHistory.unshift({
            type: 'MCQ Generation',
            credits: requiredCredits,
            timestamp: new Date(),
            details: `Generated ${numQuestions} questions`
        });

        console.log(`Credits deducted: ${requiredCredits}. Remaining: ${req.user.credits}`);

        req.session.quiz = formattedQuiz;
        req.session.quizTimestamp = Date.now();

        res.render('quiz', { 
            quiz: formattedQuiz,
            credits: req.user.credits
        });

    } catch (error) {
        console.error('--- ERROR GENERATING QUIZ ---');
        
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
            
            if (error.response.status === 401) {
                return res.render('generator', { 
                    error: 'API authentication failed. Please check your OPENROUTER_API_KEY.',
                    credits: req.user.credits
                });
            } else if (error.response.status === 429) {
                return res.render('generator', { 
                    error: 'API rate limit reached. Please try again in a few moments.',
                    credits: req.user.credits
                });
            }
        } else if (error.code === 'ECONNABORTED') {
            return res.render('generator', { 
                error: 'Request timed out. Please try again.',
                credits: req.user.credits
            });
        }
        
        res.render('generator', { 
            error: 'An error occurred while generating the quiz. Please try again.',
            credits: req.user.credits
        });
    }
});

// --- PDF Summarizer Route ---
app.post('/summarize-pdf', upload.single('document'), async (req, res) => {
    const file = req.file;
    const textInput = req.body.text_input;
    let sourceContent = '';

    // Check if user has enough credits
    if (req.user.credits < CREDIT_COSTS.PDF_SUMMARY) {
        return res.render('summarizer', { 
            error: `Insufficient credits! You need ${CREDIT_COSTS.PDF_SUMMARY} credits but only have ${req.user.credits}. Please purchase more credits.`,
            summary: null,
            credits: req.user.credits
        });
    }

    try {
        // --- NO CHANGES IN THIS SECTION ---
        // (The existing code for extracting content from PDF or text input is correct)

        if (file) {
            if (file.mimetype === 'application/pdf') {
                try {
                    const data = await pdf(file.buffer);
                    sourceContent = data.text;
                } catch (pdfError) {
                    console.error('PDF parsing error:', pdfError);
                    return res.render('summarizer', { 
                        error: 'Failed to parse PDF. Please ensure it contains readable text.',
                        summary: null,
                        credits: req.user.credits
                    });
                }
            } else {
                return res.render('summarizer', { 
                    error: 'Invalid file type. Please upload a PDF.',
                    summary: null,
                    credits: req.user.credits
                });
            }
        } else if (textInput && textInput.trim() !== '') {
            sourceContent = textInput.trim();
        } else {
            return res.render('summarizer', { 
                error: 'Please upload a PDF or paste some text to summarize.',
                summary: null,
                credits: req.user.credits
            });
        }

        if (sourceContent.trim().length < 100) {
            return res.render('summarizer', { 
                error: 'The content is too short to summarize. Please provide more text.',
                summary: null,
                credits: req.user.credits
            });
        }

        if (sourceContent.length > 15000) {
            sourceContent = sourceContent.substring(0, 15000);
        }

        // --- END OF UNCHANGED SECTION ---
        
        const prompt = `You are an expert at explaining complex topics in simple, easy-to-understand language. 

Please read the following text and provide a comprehensive summary that:
1. Explains all the key concepts in very simple terms (as if explaining to a beginner)
2. Breaks down complex ideas into easy-to-understand points
3. Includes all important information from the text
4. Uses everyday language and avoids jargon
5. Organizes the information logically with clear sections

Format your summary with:
- A brief overview at the start
- Main points organized with headings
- Simple explanations for any technical terms
- Key takeaways at the end

Text to summarize:
---
${sourceContent}
---

Please provide a clear, comprehensive, and beginner-friendly summary:`;

        console.log('Sending summarization request to OpenRouter API...');

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'meta-llama/llama-3.2-3b-instruct:free',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.5,
                max_tokens: 30000
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 45000
            }
        );

        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
            console.error("Invalid response from AI:", response.data);
            return res.render('summarizer', { 
                error: 'The AI returned an invalid response. Please try again.',
                summary: null,
                credits: req.user.credits
            });
        }

        const markdownSummary = response.data.choices[0].message.content;

        // --- ✨ KEY CHANGE IS HERE ---
        // Convert the Markdown text from the AI into clean HTML
        const htmlSummary = converter.makeHtml(markdownSummary);

        // Deduct credits
        req.user.credits -= CREDIT_COSTS.PDF_SUMMARY;
        req.user.usageHistory.unshift({
            type: 'PDF Summary',
            credits: CREDIT_COSTS.PDF_SUMMARY,
            timestamp: new Date(),
            details: `Summarized ${Math.round(sourceContent.length / 1000)}KB of content`
        });

        console.log(`Credits deducted: ${CREDIT_COSTS.PDF_SUMMARY}. Remaining: ${req.user.credits}`);
        
        // Pass the converted HTML to the 'summary' view
        res.render('summary', { 
            error: null,
            summary: htmlSummary, // Use the HTML version
            credits: req.user.credits
        });

    } catch (error) {
        console.error('--- ERROR SUMMARIZING ---');
        
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        }
        
        // Render the summary view with an error
        res.render('summary', { 
            error: 'An error occurred while summarizing. Please try again.',
            summary: null,
            credits: req.user.credits
        });
    }
});

// --- Submit Quiz Route ---
app.post('/submit-quiz', (req, res) => {
    const userAnswers = req.body;
    const quiz = req.session.quiz;

    if (!quiz || !Array.isArray(quiz) || quiz.length === 0) {
        return res.redirect('/squiz');
    }

    let score = 0;
    const totalQuestions = quiz.length;
    const results = [];

    for (let i = 0; i < totalQuestions; i++) {
        const questionData = quiz[i];
        const userAnswerIndex = parseInt(userAnswers[`question-${i}`], 10);
        const correctAnswerIndex = questionData.correctIndex;
        const isCorrect = !isNaN(userAnswerIndex) && userAnswerIndex === correctAnswerIndex;
        
        if (isCorrect) {
            score++;
        }

        results.push({
            question: questionData.question,
            options: questionData.options,
            userAnswerIndex: isNaN(userAnswerIndex) ? -1 : userAnswerIndex,
            correctAnswerIndex: correctAnswerIndex,
            isCorrect: isCorrect
        });
    }

    req.session.destroy();

    res.render('results', { 
        score, 
        total: totalQuestions, 
        results,
        percentage: Math.round((score / totalQuestions) * 100)
    });
});

// --- Purchase Credits (Mock Implementation) ---
app.post('/purchase-credits', (req, res) => {
    const amount = parseInt(req.body.amount, 10) || 0;
    
    if (amount > 0 && amount <= 10000) {
        req.user.credits += amount;
        req.user.usageHistory.unshift({
            type: 'Credit Purchase',
            credits: amount,
            timestamp: new Date(),
            details: `Purchased ${amount} credits`
        });
        
        res.json({ 
            success: true, 
            newBalance: req.user.credits,
            message: `Successfully added ${amount} credits!`
        });
    } else {
        res.json({ 
            success: false, 
            message: 'Invalid amount'
        });
    }
});
// --- Quiz Parser Function ---
function parseMcqText(text) {
    const quiz = [];

    if (!text || typeof text !== 'string') {
        return quiz;
    }

    text = text.replace(/\r/g, '').trim();

    const firstQuestionMatch = text.match(/^\s*\d+[\.\)]/m);
    if (firstQuestionMatch) {
        text = text.substring(firstQuestionMatch.index);
    }

    const questionBlocks = text.split(/\n(?=\d+[\.\)]\s+)/).filter(b => b.trim().length > 10);

    for (const block of questionBlocks) {
        try {
            const questionMatch = block.match(/^\d+[\.\)]\s*(.+?)(?=\n\s*[A-Da-d][\.\)]|\n\s*[-\*\•])/s);
            
            if (!questionMatch) continue;

            let question = questionMatch[1].trim();
            question = question.replace(/\s*Answer\s*:.*/i, '').trim();

            let options = [];
            
            const letterOptions = [...block.matchAll(/^\s*([A-Da-d])[\.\)]\s*(.+?)$/gm)];
            
            if (letterOptions.length >= 2) {
                options = letterOptions.map(m => m[2].trim());
            } else {
                const bulletOptions = [...block.matchAll(/^\s*[-\*\•]\s*(.+?)$/gm)];
                if (bulletOptions.length >= 2) {
                    options = bulletOptions.map(m => m[1].trim());
                }
            }

            options = options.map(opt => 
                opt.replace(/\s*\(correct\)|\s*\[correct\]/i, '').trim()
            );

            let correctIndex = 0;
            
            const answerLetterMatch = block.match(/Answer\s*[:\-]?\s*([A-Da-d])[\.\)]?/i);
            
            if (answerLetterMatch) {
                const letter = answerLetterMatch[1].toUpperCase();
                correctIndex = letter.charCodeAt(0) - 65;
            } else {
                const answerTextMatch = block.match(/Answer\s*[:\-]?\s*(.+?)$/im);
                
                if (answerTextMatch && options.length > 0) {
                    const answerText = answerTextMatch[1].trim().toLowerCase();
                    const foundIndex = options.findIndex(opt => 
                        opt.toLowerCase().includes(answerText) || 
                        answerText.includes(opt.toLowerCase())
                    );
                    
                    if (foundIndex !== -1) {
                        correctIndex = foundIndex;
                    }
                }
                
                if (correctIndex === 0) {
                    const markedIndex = options.findIndex(opt => 
                        /\(correct\)|\[correct\]|✓|✔/i.test(opt)
                    );
                    if (markedIndex !== -1) {
                        correctIndex = markedIndex;
                    }
                }
            }

            if (correctIndex < 0 || correctIndex >= options.length) {
                correctIndex = 0;
            }

            if (question && options.length >= 2) {
                quiz.push({
                    question,
                    options: options.slice(0, 4),
                    correctIndex
                });
            }
        } catch (parseError) {
            console.error('Error parsing question block:', parseError);
            continue;
        }
    }

    return quiz;
}

app.get('/askyourpdf', (req, res) => {
    // Clear any previous PDF context when starting a new session
    if (req.session.pdfContext) {
        req.session.pdfContext = null;
        req.session.chatHistory = null;
    }
    res.render('chat' , { credits: req.user.credits });
});

// Add this new route to your server.js file

app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;

    // 1. Validate the incoming message
    if (!userMessage) {
        return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    try {
        // 2. Initialize or retrieve the conversation history from the session
        if (!req.session.chatHistory) {
            req.session.chatHistory = [];
        }

        // Add the new user message to the history
        req.session.chatHistory.push({ role: 'user', content: userMessage });

        // 3. Construct the prompt for the AI, including history
        const messages = [
            { role: 'system', content: 'You are Odyssey, a helpful and friendly AI assistant. You are used for Studying Purpose. You were Created By Chinmay Chatradamath who is a AIML Enginner.' },
            ...req.session.chatHistory // Include all past messages
        ];

        // 4. Call the OpenRouter API
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'meta-llama/llama-3.2-3b-instruct:free',
                messages: messages // Send the full conversation history
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        const aiAnswer = response.data.choices[0].message.content;

        // 5. Add the AI's response to the history
        req.session.chatHistory.push({ role: 'assistant', content: aiAnswer });
        
        // 6. Send the answer back to the front-end
        res.json({ answer: aiAnswer });

    } catch (error) {
        console.error("AI Chat Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'An error occurred while communicating with the AI.' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send('An unexpected error occurred');
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port} 🚀`);
    console.log(`Free trial credits: ${FREE_CREDITS}`);
    console.log(`Credit costs - MCQ per question: ${CREDIT_COSTS.MCQ_PER_QUESTION}, PDF Summary: ${CREDIT_COSTS.PDF_SUMMARY}`);
});