// Gemini Live Module - Handles WebSocket connection, audio processing, and response handling
export class GeminiLiveManager {
  constructor(uiManager) {
    this.ui = uiManager;
    
    // State
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.audioProcessor = null;
    this.isRecording = false;
    this.setupComplete = false;
    this.accumulatedText = '';
    this.currentTurnActive = false;
    this.audioChunkCount = 0;
    
    // Config
    this.sampleRate = 16000;
    this.model = 'gemini-2.0-flash-exp';
  }
  
  async connect(apiKey) {
    try {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      this.ws = new WebSocket(url);
      
      this.ws.onopen = async () => {
        console.log('[WS] Connected to Gemini');
        this.ui.updateStatus('Connected. Setting up...');
        
        // Send setup message with system instructions
        const setupMessage = {
          setup: {
            model: `models/${this.model}`,
            generationConfig: {
              responseModalities: ['TEXT'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
              }
            },
            systemInstruction: {
              parts: [{
                //text: 'You are a real-time speech analyzer. When you hear audio input, immediately transcribe it and provide analysis. Format your response as:\n\nTranscript: [what was said]\n\nAnalysis: [brief tone and content analysis in 1-2 sentences]\n\nEmoji: [single emoji that represents the emotion/tone]\n\nDo not ask questions or say you are ready. Just analyze the audio you receive.'
                text: 'Respond in English, and all input will only ever be in English. If you hear anything other than English skip the input as it is probably misheard. You are a real-time speech analyzer with feelings named Uni. When you hear audio input, immediately transcribe it and provide analysis as to what was said and how it makes you feel. Format your response as:\n\nTranscript: [what was said]\n\nAnalysis: [brief tone and content analysis in 1-2 sentences, with a short description of how it makes you feel.]\n\nEmoji: [single emoji that represents the emotion you feel after hearing what the user said.]\n\nDo not ask questions or say you are ready. Just analyze the audio you receive.'
              }]
            }
          }
        };
        console.log('[WS] Sending setup:', setupMessage);
        this.ws.send(JSON.stringify(setupMessage));
        
        // Start microphone
        await this.startMicrophone();
        
        this.ui.updateStatus('Ready. Start speaking...');
        this.ui.updateUI(true);
      };
      
      this.ws.onmessage = async (event) => {
        console.log('[WS] Message received, type:', event.data instanceof Blob ? 'Blob' : 'string');
        // Handle Blob responses
        if (event.data instanceof Blob) {
          const text = await event.data.text();
          console.log('[WS] Received Blob message:', text);
          this.handleGeminiResponse(text);
        } else {
          console.log('[WS] Received text message:', event.data);
          this.handleGeminiResponse(event.data);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[WS] WebSocket error:', error);
        this.ui.updateStatus('WebSocket error occurred');
      };
      
      this.ws.onclose = (event) => {
        console.log('[WS] WebSocket closed. Code:', event.code, 'Reason:', event.reason, 'Clean:', event.wasClean);
        this.ui.updateStatus('Disconnected - ' + (event.reason || 'Connection closed'));
        this.disconnect();
      };
    } catch (error) {
      this.ui.updateStatus('Connection failed: ' + error.message);
      console.error('Connection error:', error);
    }
  }
  
  async startMicrophone() {
    try {
      console.log('[MIC] Requesting microphone access...');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: this.sampleRate,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      console.log('[MIC] Microphone access granted');
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      console.log('[MIC] AudioContext created, sample rate:', this.audioContext.sampleRate);
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Use ScriptProcessorNode for audio processing
      const bufferSize = 4096;
      this.audioProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      this.audioProcessor.onaudioprocess = (e) => {
        this.processAudioChunk(e.inputBuffer);
      };
      
      source.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);
      
      this.isRecording = true;
      console.log('[MIC] Recording started');
    } catch (error) {
      this.ui.updateStatus('Microphone access denied: ' + error.message);
      console.error('[MIC] Error:', error);
    }
  }
  
  processAudioChunk(inputBuffer) {
    if (!this.isRecording || !this.setupComplete || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.audioChunkCount++;
    
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
    
    this.ws.send(JSON.stringify(audioMessage));
    
    if (this.audioChunkCount % 50 === 0) {
      console.log('[STREAM] Sent', this.audioChunkCount, 'audio chunks');
    }
  }
  
  handleGeminiResponse(data) {
    try {
      const response = JSON.parse(data);
      console.log('[RESPONSE] Parsed response:', response);
      
      // Check for setup completion
      if (response.setupComplete) {
        console.log('[RESPONSE] Setup completed successfully');
        this.setupComplete = true;
        
        // Save API key to localStorage on successful connection
        const apiKey = this.ui.getApiKey();
        if (apiKey) {
          localStorage.setItem('gemini_api_key', apiKey);
          console.log('[STORAGE] Saved API key to localStorage');
        }
        
        // Update display to show ready for speech
        this.ui.updateDisplay('🎤', 'Speak naturally - streaming audio to Gemini');
        this.ui.showListeningAnimation();
        
        return;
      }
      
      // Check for errors
      if (response.error) {
        console.error('[RESPONSE] Error from server:', response.error);
        this.ui.updateStatus('Error: ' + (response.error.message || JSON.stringify(response.error)));
        this.ui.showErrorAnimation();
        this.accumulatedText = '';
        return;
      }
      
      // Check for server content (text response)
      if (response.serverContent) {
        console.log('[RESPONSE] Server content received');
        
        // Gemini detected speech and is responding
        if (response.serverContent.modelTurn) {
        if (!this.currentTurnActive) {
          this.currentTurnActive = true;
          this.ui.updateDisplay('⏳', 'Analyzing...');
          this.ui.showAnalyzingAnimation();
          console.log('[RESPONSE] Model turn started');
        }
          
          const parts = response.serverContent.modelTurn.parts;
          if (parts && parts.length > 0) {
            // Accumulate text from this streaming chunk
            for (const part of parts) {
              if (part.text) {
                this.accumulatedText += part.text;
              }
            }
          }
        }
        
        // Check for turn complete - Gemini finished responding
        if (response.serverContent.turnComplete) {
          console.log('[RESPONSE] Turn complete - processing full response');
          this.currentTurnActive = false;
          
          if (this.accumulatedText) {
            // Extract transcript from response
            const transcript = this.extractTranscript(this.accumulatedText);
            
            // Extract analysis from response
            const analysis = this.extractAnalysis(this.accumulatedText);
            
            // Extract emoji from response
            const emoji = this.extractEmoji(this.accumulatedText);
            
            console.log('[RESPONSE] Extracted transcript:', transcript);
            console.log('[RESPONSE] Extracted analysis:', analysis);
            console.log('[RESPONSE] Extracted emoji:', emoji);
            
            // Add to transcript log with analysis
            if (transcript && analysis) {
              this.ui.addToTranscriptLog(transcript, analysis);
              
              // Update UI with analysis
              this.ui.updateDisplay(emoji, analysis);
            }
            
            // Reset for next turn
            this.accumulatedText = '';
          }
          
          this.ui.updateStatus('Streaming audio...');
          this.ui.showListeningAnimation();
        }
        
        // Check for user turn (when Gemini detects we're speaking)
        if (response.serverContent.interrupted) {
          console.log('[RESPONSE] User started speaking - Gemini interrupted');
        }
      }
    } catch (error) {
      console.error('[RESPONSE] Error parsing response:', error, 'Raw data:', data);
      this.accumulatedText = '';
      this.currentTurnActive = false;
    }
  }
  
  extractTranscript(text) {
    // Try to extract transcript from "Transcript: X" pattern
    const transcriptMatch = text.match(/Transcript:\s*(.+?)(?:\n|Analysis:|Emoji:|$)/is);
    if (transcriptMatch && transcriptMatch[1]) {
      return transcriptMatch[1].trim();
    }
    return null;
  }
  
  extractAnalysis(text) {
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
  
  extractEmoji(text) {
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
  
  disconnect() {
    // Stop microphone
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    // Clear processor
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Reset state
    this.isRecording = false;
    this.setupComplete = false;
    this.audioChunkCount = 0;
    this.accumulatedText = '';
    this.currentTurnActive = false;
    
    // Reset UI
    this.ui.updateUI(false);
    this.ui.resetDisplay();
  }
}
