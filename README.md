# Odyssey - AI-Powered Learning Platform 🚀

A modern web application that helps students learn through AI-generated quizzes and document summaries.

## Features ✨

### 1. MCQ Generator 📝
- Generate multiple-choice questions from PDFs or text
- Customizable number of questions
- Interactive quiz interface with instant feedback
- **Cost:** 1 credit per question

### 2. PDF Summarizer 📄
- Get comprehensive summaries of any document
- Explains complex topics in simple language
- Perfect for quick study reviews
- **Cost:** 5 credits per summary

### 3. Credit System ⚡
- **Free Trial:** 20 credits on first use
- Purchase credit packs:
  - Starter Pack: 50 credits - $4.99
  - Value Pack: 150 credits - $12.99 (Most Popular)
  - Premium Pack: 300 credits - $24.99
- Track usage history
- Session-based user management

## Setup Instructions 🛠️

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd odyssey
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
SESSION_SECRET=your_random_secret_here
```

4. Create the required directories:
```bash
mkdir views
mkdir public
mkdir public/css
mkdir public/images
```

5. Create EJS view files in the `views` directory:
   - `dashboard.ejs`
   - `generator.ejs`
   - `summarizer.ejs`
   - `quiz.ejs`
   - `results.ejs`
   - `credits.ejs`

### Running the Application

```bash
node server.js
```

The application will be available at `http://localhost:3000`

## Project Structure 📁

```
odyssey/
├── server.js              # Main server file with credit system
├── package.json           # Dependencies
├── .env                   # Environment variables
├── views/                 # EJS templates
│   ├── dashboard.ejs      # Home page
│   ├── generator.ejs      # MCQ generator page
│   ├── summarizer.ejs     # PDF summarizer page
│   ├── quiz.ejs           # Quiz interface
│   ├── results.ejs        # Quiz results
│   └── credits.ejs        # Credits management
├── public/                # Static files
│   ├── css/
│   └── images/
└── README.md
```

## Credit System Details 💳

### How It Works
- Each user gets a unique session ID
- 20 free credits on first visit
- Credits are stored in-memory (use database in production)
- Credits are deducted when:
  - Generating MCQs: 1 credit per question
  - Summarizing PDFs: 5 credits per summary

### Usage Tracking
- All transactions are logged in usage history
- View credits and history at `/credits`
- Purchase more credits anytime (demo mode - no real payment)

## API Integration 🔌

This project uses **OpenRouter API** with the `meta-llama/llama-3.2-3b-instruct:free` model.

### Getting an API Key
1. Go to [OpenRouter](https://openrouter.ai/)
2. Sign up for an account
3. Generate an API key
4. Add it to your `.env` file

## Technologies Used 💻

- **Backend:** Node.js, Express.js
- **Frontend:** EJS, HTML5, CSS3, JavaScript
- **AI:** OpenRouter API (LLaMA 3.2)
- **Session Management:** express-session
- **File Processing:** pdf-parse, multer
- **HTTP Client:** axios

## Important Notes ⚠️

### For Production Use:
1. **Replace in-memory storage with a database:**
   - Use MongoDB, PostgreSQL, or MySQL for user data
   - Store credits and usage history persistently

2. **Add user authentication:**
   - Implement login/signup system
   - Use JWT or session-based auth
   - Secure routes with middleware

3. **Implement real payment processing:**
   - Integrate Stripe, PayPal, or Razorpay
   - Add webhook handlers for payment confirmation
   - Implement secure payment flows

4. **Add rate limiting:**
   - Prevent API abuse
   - Use express-rate-limit

5. **Environment security:**
   - Use proper secret management
   - Enable HTTPS in production
   - Set secure cookie options

6. **Error handling:**
   - Add comprehensive error logging
   - Implement user-friendly error pages
   - Monitor API usage and errors

## Features Coming Soon 🔮

- User accounts and authentication
- Save quiz history
- Export summaries as PDF
- Flashcard generator
- Study progress analytics
- Social sharing features

## Contributing 🤝

Contributions are welcome! Please feel free to submit a Pull Request.

## License 📄

This project is licensed under the MIT License.

## Support 💬

For issues or questions, please open an issue on GitHub.

---

Made with ❤️ by Your Team
