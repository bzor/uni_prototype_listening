# Gemini Live Audio Analyzer

A real-time microphone analyzer using Google's Gemini Live API to analyze speech tone, content, and sentiment.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to the URL shown (typically `http://localhost:5173`)

## Usage

1. Enter your Gemini API key in the left panel
   - Get an API key from https://aistudio.google.com/app/apikey
   
2. Click "Connect" to establish connection and enable microphone

3. Start speaking - the system will:
   - Listen to your speech
   - Automatically analyze after you stop talking (1.5s of silence)
   - Force analysis after 15 seconds of continuous speech
   - Display an emoji based on sentiment
   - Show a description of the tone and content

4. Click "Disconnect" when finished

## Features

- Real-time audio streaming to Gemini Live API
- Voice activity detection with automatic silence detection
- Sentiment analysis with emoji display
- Clean, minimal two-column interface
- No external libraries (except Vite for bundling)

## Technical Details

- Audio format: 16kHz PCM16 mono
- Model: gemini-2.0-flash-exp
- Voice activity detection with 1.5s silence threshold
- Maximum utterance length: 15 seconds

