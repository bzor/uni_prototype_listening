console.log("[V0.2]");

// State
let ws = null;
let audioContext = null;
let mediaStream = null;
let audioProcessor = null;
let isRecording = false;
let setupComplete = false;
let accumulatedText = '';
let transcriptHistory = [];
let currentTurnActive = false;

// Config
const SAMPLE_RATE = 16000;
const MODEL = 'gemini-2.0-flash-exp';
const MAX_TRANSCRIPT_ENTRIES = 200;

// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusDiv = document.getElementById('status');
const emojiDisplay = document.getElementById('emojiDisplay');
const descriptionDiv = document.getElementById('description');
const transcriptLog = document.getElementById('transcriptLog');

// Event listeners
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);

// Load saved API key on page load
window.addEventListener('DOMContentLoaded', () => {
  const savedApiKey = localStorage.getItem('gemini_api_key');
  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
    console.log('[STORAGE] Loaded saved API key');
  }
});

async function connect() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    updateStatus('Please enter an API key');
    return;
  }
  
  updateStatus('Connecting to Gemini...');
  await connectToGemini(apiKey);
}

async function connectToGemini(apiKey) {
  try {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    ws = new WebSocket(url);
    
    ws.onopen = async () => {
      console.log('[WS] Connected to Gemini');
      updateStatus('Connected. Setting up...');
      
      // Send setup message with system instructions
      const setupMessage = {
        setup: {
          model: `models/${MODEL}`,
          generationConfig: {
            responseModalities: ['TEXT'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
            }
          },
          systemInstruction: {
            parts: [{
              text: 'You are a real-time speech analyzer. When you hear audio input, immediately transcribe it and provide analysis. Format your response as:\n\nTranscript: [what was said]\n\nAnalysis: [brief tone and content analysis in 1-2 sentences]\n\nEmoji: [single emoji that represents the emotion/tone]\n\nDo not ask questions or say you are ready. Just analyze the audio you receive.'
            }]
          }
        }
      };
      console.log('[WS] Sending setup:', setupMessage);
      ws.send(JSON.stringify(setupMessage));
      
      // Start microphone
      await startMicrophone();
      
      updateStatus('Ready. Start speaking...');
      updateUI(true);
    };
    
    ws.onmessage = async (event) => {
      console.log('[WS] Message received, type:', event.data instanceof Blob ? 'Blob' : 'string');
      // Handle Blob responses
      if (event.data instanceof Blob) {
        const text = await event.data.text();
        console.log('[WS] Received Blob message:', text);
        handleGeminiResponse(text);
      } else {
        console.log('[WS] Received text message:', event.data);
        handleGeminiResponse(event.data);
      }
    };
    
    ws.onerror = (error) => {
      console.error('[WS] WebSocket error:', error);
      updateStatus('WebSocket error occurred');
    };
    
    ws.onclose = (event) => {
      console.log('[WS] WebSocket closed. Code:', event.code, 'Reason:', event.reason, 'Clean:', event.wasClean);
      updateStatus('Disconnected - ' + (event.reason || 'Connection closed'));
      disconnect();
    };
  } catch (error) {
    updateStatus('Connection failed: ' + error.message);
    console.error('Connection error:', error);
  }
}

async function startMicrophone() {
  try {
    console.log('[MIC] Requesting microphone access...');
    mediaStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true
      } 
    });
    
    console.log('[MIC] Microphone access granted');
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    console.log('[MIC] AudioContext created, sample rate:', audioContext.sampleRate);
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // Use ScriptProcessorNode for audio processing
    const bufferSize = 4096;
    audioProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    
    audioProcessor.onaudioprocess = (e) => {
      processAudioChunk(e.inputBuffer);
    };
    
    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
    
    isRecording = true;
    console.log('[MIC] Recording started');
  } catch (error) {
    updateStatus('Microphone access denied: ' + error.message);
    console.error('[MIC] Error:', error);
  }
}

let audioChunkCount = 0;

function processAudioChunk(inputBuffer) {
  if (!isRecording || !setupComplete || !ws || ws.readyState !== WebSocket.OPEN) return;
  
  audioChunkCount++;
  
  const inputData = inputBuffer.getChannelData(0);
  
  // Convert Float32 to Int16 PCM
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    const s = Math.max(-1, Math.min(1, inputData[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  // Convert to base64
  const bytes = new Uint8Array(pcm16.buffer);
  let binaryString = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binaryString += String.fromCharCode(...chunk);
  }
  const base64Audio = btoa(binaryString);
  
  // Stream audio chunk immediately to Gemini
  const audioMessage = {
    realtimeInput: {
      mediaChunks: [{
        mimeType: 'audio/pcm',
        data: base64Audio
      }]
    }
  };
  
  ws.send(JSON.stringify(audioMessage));
  
  if (audioChunkCount % 50 === 0) {
    console.log('[STREAM] Sent', audioChunkCount, 'audio chunks');
  }
}

// Audio is now streamed continuously, no separate send function needed

function handleGeminiResponse(data) {
  try {
    const response = JSON.parse(data);
    console.log('[RESPONSE] Parsed response:', response);
    
    // Check for setup completion
    if (response.setupComplete) {
      console.log('[RESPONSE] Setup completed successfully');
      setupComplete = true;
      
      // Save API key to localStorage on successful connection
      const apiKey = apiKeyInput.value.trim();
      if (apiKey) {
        localStorage.setItem('gemini_api_key', apiKey);
        console.log('[STORAGE] Saved API key to localStorage');
      }
      
      // Update display to show ready for speech
      emojiDisplay.textContent = '🎤';
      descriptionDiv.textContent = 'Speak naturally - streaming audio to Gemini';
      
      return;
    }
    
    // Check for errors
    if (response.error) {
      console.error('[RESPONSE] Error from server:', response.error);
      updateStatus('Error: ' + (response.error.message || JSON.stringify(response.error)));
      accumulatedText = '';
      return;
    }
    
    // Check for server content (text response)
    if (response.serverContent) {
      console.log('[RESPONSE] Server content received');
      
      // Gemini detected speech and is responding
      if (response.serverContent.modelTurn) {
        if (!currentTurnActive) {
          currentTurnActive = true;
          emojiDisplay.textContent = '⏳';
          descriptionDiv.textContent = 'Analyzing...';
          console.log('[RESPONSE] Model turn started');
        }
        
        const parts = response.serverContent.modelTurn.parts;
        if (parts && parts.length > 0) {
          // Accumulate text from this streaming chunk
          for (const part of parts) {
            if (part.text) {
              accumulatedText += part.text;
            }
          }
        }
      }
      
      // Check for turn complete - Gemini finished responding
      if (response.serverContent.turnComplete) {
        console.log('[RESPONSE] Turn complete - processing full response');
        currentTurnActive = false;
        
        if (accumulatedText) {
          // Extract transcript from response
          const transcript = extractTranscript(accumulatedText);
          
          // Extract analysis from response
          const analysis = extractAnalysis(accumulatedText);
          
          // Extract emoji from response
          const emoji = extractEmoji(accumulatedText);
          
          console.log('[RESPONSE] Extracted transcript:', transcript);
          console.log('[RESPONSE] Extracted analysis:', analysis);
          console.log('[RESPONSE] Extracted emoji:', emoji);
          
          // Add to transcript log with analysis
          if (transcript && analysis) {
            addToTranscriptLog(transcript, analysis);
            
            // Update UI with analysis
            emojiDisplay.textContent = emoji;
            descriptionDiv.textContent = analysis;
          }
          
          // Reset for next turn
          accumulatedText = '';
        }
        
        updateStatus('Streaming audio...');
      }
      
      // Check for user turn (when Gemini detects we're speaking)
      if (response.serverContent.interrupted) {
        console.log('[RESPONSE] User started speaking - Gemini interrupted');
      }
    }
  } catch (error) {
    console.error('[RESPONSE] Error parsing response:', error, 'Raw data:', data);
    accumulatedText = '';
    currentTurnActive = false;
  }
}

function extractTranscript(text) {
  // Try to extract transcript from "Transcript: X" pattern
  const transcriptMatch = text.match(/Transcript:\s*(.+?)(?:\n|Analysis:|Emoji:|$)/is);
  if (transcriptMatch && transcriptMatch[1]) {
    return transcriptMatch[1].trim();
  }
  return null;
}

function extractAnalysis(text) {
  // Try to extract analysis from "Analysis: X" pattern
  const analysisMatch = text.match(/Analysis:\s*(.+?)(?:\n\s*Emoji:|$)/is);
  if (analysisMatch && analysisMatch[1]) {
    return analysisMatch[1].trim();
  }
  // Fallback: if no Analysis: tag, return everything except Transcript and Emoji
  return text.replace(/Transcript:.*?(?=Analysis:|Emoji:|$)/is, '')
             .replace(/Emoji:\s*.*/i, '')
             .trim();
}

function extractEmoji(text) {
  // Try to extract emoji from "Emoji: X" pattern
  // Look for the pattern and capture multiple characters to handle multi-codepoint emojis
  const emojiMatch = text.match(/Emoji:\s*([^\s\n]+)/i);
  if (emojiMatch && emojiMatch[1]) {
    console.log('[EMOJI] Matched from pattern:', emojiMatch[1]);
    // Take only the first few characters which should be the emoji
    return emojiMatch[1].substring(0, 2);
  }
  
  // Fallback: extract any emoji from the text using comprehensive regex
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/u;
  const match = text.match(emojiRegex);
  if (match) {
    console.log('[EMOJI] Matched from fallback:', match[0]);
    return match[0];
  }
  
  console.log('[EMOJI] No match found, using default');
  // Default fallback
  return '💬';
}

function addToTranscriptLog(transcript, analysis) {
  const timestamp = new Date().toLocaleTimeString();
  
  // Create entry element
  const entryDiv = document.createElement('div');
  entryDiv.className = 'log-entry';
  
  const timestampSpan = document.createElement('div');
  timestampSpan.className = 'log-timestamp';
  timestampSpan.textContent = `[${timestamp}]`;
  
  const transcriptSpan = document.createElement('div');
  transcriptSpan.className = 'log-transcript';
  transcriptSpan.textContent = `> ${transcript}`;
  
  const analysisSpan = document.createElement('div');
  analysisSpan.className = 'log-analysis';
  analysisSpan.textContent = `  ${analysis}`;
  
  entryDiv.appendChild(timestampSpan);
  entryDiv.appendChild(transcriptSpan);
  entryDiv.appendChild(analysisSpan);
  
  // Add to history
  transcriptHistory.push(entryDiv);
  
  // Cap at MAX_TRANSCRIPT_ENTRIES
  if (transcriptHistory.length > MAX_TRANSCRIPT_ENTRIES) {
    const removed = transcriptHistory.shift();
    if (removed && removed.parentNode) {
      removed.parentNode.removeChild(removed);
    }
  }
  
  // Add to display
  transcriptLog.appendChild(entryDiv);
  
  // Auto-scroll to bottom
  transcriptLog.scrollTop = transcriptLog.scrollHeight;
}

function disconnect() {
  // Stop microphone
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  
  // Close audio context
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  // Clear processor
  if (audioProcessor) {
    audioProcessor.disconnect();
    audioProcessor = null;
  }
  
  // Close WebSocket
  if (ws) {
    ws.close();
    ws = null;
  }
  
  // Reset state
  isRecording = false;
  setupComplete = false;
  audioChunkCount = 0;
  accumulatedText = '';
  transcriptHistory = [];
  currentTurnActive = false;
  
  // Reset UI
  updateUI(false);
  emojiDisplay.textContent = '🔌';
  descriptionDiv.textContent = 'Waiting for Connection';
  updateStatus('');
  transcriptLog.innerHTML = '';
}

function updateUI(connected) {
  connectBtn.disabled = connected;
  disconnectBtn.disabled = !connected;
  apiKeyInput.disabled = connected;
}

function updateStatus(message) {
  statusDiv.textContent = message;
}

