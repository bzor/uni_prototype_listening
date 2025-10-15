// State
let ws = null;
let audioContext = null;
let mediaStream = null;
let audioProcessor = null;
let isRecording = false;
let audioBuffer = [];
let silenceTimer = null;
let maxDurationTimer = null;
let lastSoundTime = 0;
let isProcessing = false;
let setupComplete = false;
let hasSpeech = false;
let accumulatedText = '';
let transcriptHistory = [];
let speechStartTime = 0;
let consecutiveSpeechFrames = 0;
let consecutiveSilenceFrames = 0;

// Config
const SAMPLE_RATE = 16000;
const SPEECH_THRESHOLD = 0.015; // Balanced threshold for detecting speech
const SILENCE_THRESHOLD = 0.008; // Balanced threshold for confirming silence
const SILENCE_DURATION = 1700;   // Balanced silence before triggering analysis
const MIN_SPEECH_DURATION = 300; // Minimum speech duration to start recording
const MAX_UTTERANCE_DURATION = 15000;
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
      
      // Send setup message
      const setupMessage = {
        setup: {
          model: `models/${MODEL}`,
          generationConfig: {
            responseModalities: ['TEXT']
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
  if (!isRecording || isProcessing) return;
  
  audioChunkCount++;
  if (audioChunkCount % 100 === 0) {
    console.log('[AUDIO] Processed', audioChunkCount, 'chunks, buffer size:', audioBuffer.length);
  }
  
  const inputData = inputBuffer.getChannelData(0);
  
  // Voice activity detection with hysteresis
  const rms = calculateRMS(inputData);
  const isSpeaking = rms > SPEECH_THRESHOLD;
  const isSilent = rms < SILENCE_THRESHOLD;
  
  if (audioChunkCount % 100 === 0) {
    console.log('[VAD] RMS:', rms.toFixed(4), 'Speech threshold:', SPEECH_THRESHOLD, 'Speaking:', isSpeaking);
  }
  
  // Track consecutive frames for debouncing
  if (isSpeaking) {
    consecutiveSpeechFrames++;
    consecutiveSilenceFrames = 0;
  } else if (isSilent) {
    consecutiveSilenceFrames++;
    consecutiveSpeechFrames = 0;
  } else {
    // In between thresholds - maintain current state
    consecutiveSpeechFrames = 0;
    consecutiveSilenceFrames = 0;
  }
  
  // Require sustained speech before we start recording (reduces false triggers)
  const FRAMES_FOR_SPEECH_START = 2; // ~200ms of sustained speech
  const FRAMES_FOR_SILENCE = 3;      // ~300ms of sustained silence
  
  if (consecutiveSpeechFrames >= FRAMES_FOR_SPEECH_START && !hasSpeech) {
    // Start of speech detected
    speechStartTime = Date.now();
    hasSpeech = true;
    console.log('[VAD] Sustained speech detected - starting to record');
    
    // Update display to show recording
    emojiDisplay.textContent = '🔴';
    descriptionDiv.textContent = 'Recording';
  }
  
  if (hasSpeech) {
    lastSoundTime = Date.now();
    
    // Convert Float32 to Int16 PCM and add to buffer
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    audioBuffer.push(pcm16);
    
    // If we're speaking, clear silence timer
    if (isSpeaking) {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    }
    
    // Check if we have enough speech duration
    const speechDuration = Date.now() - speechStartTime;
    
    // Start max duration timer if not started and we have minimum speech
    if (!maxDurationTimer && speechDuration > MIN_SPEECH_DURATION) {
      console.log('[VAD] Starting max duration timer');
      maxDurationTimer = setTimeout(() => {
        console.log('[VAD] Max duration reached, triggering analysis');
        if (!isProcessing && hasSpeech) {
          sendAudioForAnalysis();
        }
      }, MAX_UTTERANCE_DURATION);
    }
    
    // Start silence timer if we have sustained silence
    if (consecutiveSilenceFrames >= FRAMES_FOR_SILENCE && !silenceTimer && !isProcessing && speechDuration > MIN_SPEECH_DURATION) {
      console.log('[VAD] Sustained silence detected, starting silence timer');
      silenceTimer = setTimeout(() => {
        console.log('[VAD] Silence duration reached, triggering analysis');
        if (!isProcessing && hasSpeech) {
          sendAudioForAnalysis();
        }
      }, SILENCE_DURATION);
    }
  }
}

function calculateRMS(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

function sendAudioForAnalysis() {
  if (isProcessing || audioBuffer.length === 0 || !ws || ws.readyState !== WebSocket.OPEN) {
    console.log('[SEND] Cannot send - isProcessing:', isProcessing, 'bufferLength:', audioBuffer.length, 'wsReady:', ws && ws.readyState === WebSocket.OPEN);
    return;
  }
  
  if (!setupComplete) {
    console.warn('[SEND] Setup not complete yet, waiting...');
    return;
  }
  
  if (!hasSpeech) {
    console.log('[SEND] No speech detected in buffer, skipping analysis');
    audioBuffer = [];
    return;
  }
  
  console.log('[SEND] Starting analysis - buffer chunks:', audioBuffer.length);
  isProcessing = true;
  updateStatus('Analyzing...');
  
  // Clear timers
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  if (maxDurationTimer) {
    clearTimeout(maxDurationTimer);
    maxDurationTimer = null;
  }
  
  // Concatenate audio buffer
  const totalLength = audioBuffer.reduce((acc, chunk) => acc + chunk.length, 0);
  console.log('[SEND] Total audio samples:', totalLength, 'Duration:', (totalLength / SAMPLE_RATE).toFixed(2), 'seconds');
  const fullAudio = new Int16Array(totalLength);
  let offset = 0;
  for (const chunk of audioBuffer) {
    fullAudio.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Clear buffer and reset speech flag
  audioBuffer = [];
  hasSpeech = false;
  speechStartTime = 0;
  consecutiveSpeechFrames = 0;
  consecutiveSilenceFrames = 0;
  
  // Convert to base64 properly
  const bytes = new Uint8Array(fullAudio.buffer);
  
  // Use a more reliable base64 encoding method
  let binaryString = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binaryString += String.fromCharCode(...chunk);
  }
  const base64Audio = btoa(binaryString);
  
  console.log('[SEND] Base64 audio length:', base64Audio.length, 'Bytes:', bytes.length);
  
  // Send audio using realtimeInput
  const audioMessage = {
    realtimeInput: {
      mediaChunks: [{
        mimeType: 'audio/pcm',
        data: base64Audio
      }]
    }
  };
  console.log('[SEND] Sending audio via realtimeInput...');
  ws.send(JSON.stringify(audioMessage));
  
  // Show processing state
  emojiDisplay.textContent = '⏳';
  descriptionDiv.textContent = 'Analyzing your speech...';
  
  // Wait a moment for audio to be processed, then send the prompt
  setTimeout(() => {
    const promptMessage = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{
            text: 'IMPORTANT: Respond ONLY with the analysis, do not ask questions or say you are ready.\n\nTranscribe what was said in the audio I just sent. Then analyze the tone and content in 1-2 concise sentences. Format your response EXACTLY as:\n\nTranscript: [what you heard]\n\nAnalysis: [tone and content description]\n\nEmoji: [single emoji that best represents the emotion/tone/sentiment]'
          }]
        }],
        turnComplete: true
      }
    };
    console.log('[SEND] Sending prompt...');
    ws.send(JSON.stringify(promptMessage));
  }, 100);
  
  // Set timeout in case we don't get a response
  setTimeout(() => {
    if (isProcessing) {
      console.warn('[SEND] No response received after 30 seconds, resetting...');
      isProcessing = false;
      updateStatus('No response received. Try speaking again...');
    }
  }, 30000);
}

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
      descriptionDiv.textContent = 'Waiting for Speech';
      
      return;
    }
    
    // Also check for toolConfig which might be sent as setup confirmation
    if (response.toolConfig || response.config) {
      console.log('[RESPONSE] Config received (setup likely complete)');
      setupComplete = true;
      return;
    }
    
    // Check for errors
    if (response.error) {
      console.error('[RESPONSE] Error from server:', response.error);
      updateStatus('Error: ' + (response.error.message || JSON.stringify(response.error)));
      isProcessing = false;
      accumulatedText = '';
      return;
    }
    
    // Check for server content (text response)
    if (response.serverContent) {
      console.log('[RESPONSE] Server content received:', response.serverContent);
      
      if (response.serverContent.modelTurn) {
        console.log('[RESPONSE] Model turn received');
        const parts = response.serverContent.modelTurn.parts;
        if (parts && parts.length > 0) {
          // Accumulate text from this chunk
          for (const part of parts) {
            if (part.text) {
              accumulatedText += part.text;
            }
          }
          console.log('[RESPONSE] Accumulated text so far:', accumulatedText);
        }
      }
      
      // Check for turn complete - this signals end of streaming
      if (response.serverContent.turnComplete) {
        console.log('[RESPONSE] Turn complete - processing full response');
        
        if (accumulatedText) {
          // Filter out non-analysis responses (like "I'm ready" messages)
          const lowerText = accumulatedText.toLowerCase();
          const isActualAnalysis = 
            accumulatedText.length > 20 && 
            !lowerText.includes("i'm ready") && 
            !lowerText.includes("please provide") &&
            !lowerText.includes("waiting for") &&
            !lowerText.includes("ready when you are") &&
            !lowerText.includes("send the audio");
          
          if (isActualAnalysis) {
            // Extract transcript from response
            const transcript = extractTranscript(accumulatedText);
            
            // Extract analysis from response
            const analysis = extractAnalysis(accumulatedText);
            
            // Extract emoji from response
            const emoji = extractEmoji(accumulatedText);
            
            console.log('[RESPONSE] Extracted transcript:', transcript);
            console.log('[RESPONSE] Extracted analysis:', analysis);
            console.log('[RESPONSE] Extracted emoji:', emoji);
            console.log('[RESPONSE] Full response text:', accumulatedText);
            
            // Add to transcript log with analysis
            if (transcript) {
              addToTranscriptLog(transcript, analysis);
            }
            
            // Update UI with analysis only (not transcript)
            emojiDisplay.textContent = emoji;
            descriptionDiv.textContent = analysis || 'Analysis not available';
            
            // Reset for next turn
            accumulatedText = '';
            isProcessing = false;
            updateStatus('Ready. Start speaking...');
          } else {
            console.log('[RESPONSE] Skipping non-analysis response:', accumulatedText);
            // Reset processing state immediately so we can continue
            accumulatedText = '';
            isProcessing = false;
            // Reset display to recording state if we still have speech
            if (hasSpeech) {
              emojiDisplay.textContent = '🔴';
              descriptionDiv.textContent = 'Recording';
              updateStatus('Recording...');
            } else {
              emojiDisplay.textContent = '🎤';
              descriptionDiv.textContent = 'Waiting for Speech';
              updateStatus('Ready. Start speaking...');
            }
          }
        } else {
          // No text received, reset processing state
          isProcessing = false;
          updateStatus('Ready. Start speaking...');
        }
      }
    }
  } catch (error) {
    console.error('[RESPONSE] Error parsing response:', error, 'Raw data:', data);
    accumulatedText = '';
    isProcessing = false;
    updateStatus('Ready. Start speaking...');
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
  
  // Clear timers
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  if (maxDurationTimer) {
    clearTimeout(maxDurationTimer);
    maxDurationTimer = null;
  }
  
  // Reset state
  isRecording = false;
  isProcessing = false;
  audioBuffer = [];
  setupComplete = false;
  hasSpeech = false;
  audioChunkCount = 0;
  accumulatedText = '';
  transcriptHistory = [];
  speechStartTime = 0;
  consecutiveSpeechFrames = 0;
  consecutiveSilenceFrames = 0;
  
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

