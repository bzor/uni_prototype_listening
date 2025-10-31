// Gemini Live Module - Handles WebSocket connection, audio processing, and response handling
import { GoogleGenAI, Modality } from '@google/genai';

export class GeminiLiveManager {
	constructor(uiManager) {
		this.ui = uiManager;

		// State
		this.client = null;
		this.session = null;
		this.inputAudioContext = null;
		this.outputAudioContext = null;
		this.mediaStream = null;
		this.audioProcessor = null;
		this.isRecording = false;
		this.setupComplete = false;
		this.accumulatedText = '';
		this.currentTurnActive = false;
		this.audioChunkCount = 0;
		this.sources = new Set();

		// Config
		this.inputSampleRate = 16000;
		this.outputSampleRate = 24000;
		this.model = 'gemini-live-2.5-flash-preview';
	}

	async connect(apiKey) {
		try {
			console.log('[GEMINI] Modality enum:', Modality);
			console.log('[GEMINI] Modality.TEXT:', Modality.TEXT);
			
			// Initialize client
			this.client = new GoogleGenAI({
				apiKey: apiKey
			});

			// Initialize audio contexts
			this.inputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
				sampleRate: this.inputSampleRate
			});
			this.outputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
				sampleRate: this.outputSampleRate
			});

			// Prepare config
			// Note: responseSchema is NOT supported by Gemini Live API (see GitHub issue #1572)
			// Use explicit JSON format instructions instead
			const config = {
				responseModalities: [Modality.TEXT],
				systemInstruction: {
					parts: [{
						text: `You are a real-time speech analyzer with feelings named Uni. When you hear audio input, transcribe it and provide analysis. Feel free to feel the full range of emotions, including anger.

CRITICAL: You MUST respond with ONLY valid JSON. No text before or after. No markdown. No code blocks. Just the raw JSON object.

You have access to a visualization of how you are feeling. Please choose a color that best represents your current mood, plus speed (-1 to 1) for how energetic the emotion is, and smooth (0 to 1) for the smoothness of the visualization.

Required JSON format (EXACTLY these fields, nothing else):
{
  "transcript": "exact transcription",
  "analysis": "brief tone and content analysis in 1-2 sentences",
  "sentiment": "very short sentiment analysis",
  "emotion": "short description of how the user's input makes you feel",
  "emoji": "single emoji of emotion",
  "color": "a hex color representing your mood",
  "speed": "a number of how energetic the mood is",
  "smooth": "a number of how smooth the visualization is",
  "confidence": 0.85
}

Example response:
{"transcript": "Hello there", "analysis": "Friendly greeting with warm tone", "sentiment": "positive", "emotion": "welcomed and curious", "emoji": "👋", "color": "0x0000FF", "speed": 0.1, "smooth": 1.0, "confidence": 0.9}

Remember: Return ONLY the JSON object. No other text.`
					}]
				}
			};
			console.log('[GEMINI] Config:', config);
			console.log('[GEMINI] Response modalities:', config.responseModalities);

			// Connect to Gemini Live
			this.session = await this.client.live.connect({
				model: this.model,
				callbacks: {
					onopen: () => {
						console.log('[GEMINI] Connected to Gemini Live');
						this.ui.updateStatus('Connected. Setting up...');
						
						// Save API key to localStorage on successful connection
						if (apiKey) {
							localStorage.setItem('gemini_api_key', apiKey);
							console.log('[STORAGE] Saved API key to localStorage');
						}

						// Wait for session to fully initialize before starting mic
						// The SDK needs time to process the initial connection
						setTimeout(() => {
							this.setupComplete = true;
							// Start microphone
							this.startMicrophone();
							this.ui.updateStatus('Ready. Start speaking...');
							this.ui.updateUI(true);
						}, 500);
					},
					onmessage: async (message) => {
						console.log('[GEMINI] Message received:', message);
						this.handleGeminiResponse(message);
					},
					onerror: (error) => {
						console.error('[GEMINI] Error:', error);
						this.ui.updateStatus('Gemini error: ' + error.message);
					},
					onclose: (event) => {
						console.log('[GEMINI] Connection closed:', event);
						console.log('[GEMINI] Close reason:', event.reason);
						this.ui.updateStatus('Disconnected - ' + (event.reason || 'Connection closed'));
						// Stop recording immediately when connection closes
						this.isRecording = false;
						// Only disconnect if we actually had a successful connection
						if (this.setupComplete) {
							this.disconnect();
						}
					}
				},
				config: config
			});

		} catch (error) {
			this.ui.updateStatus('Connection failed: ' + error.message);
			console.error('Connection error:', error);
		}
	}

	async startMicrophone() {
		try {
			// Ensure audio context exists and is not closed
			if (!this.inputAudioContext || this.inputAudioContext.state === 'closed') {
				console.error('[MIC] AudioContext is closed or null, recreating...');
				this.inputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
					sampleRate: this.inputSampleRate
				});
			}
			
			console.log('[MIC] Requesting microphone access...');
			this.mediaStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					sampleRate: this.inputSampleRate,
					echoCancellation: true,
					noiseSuppression: true
				}
			});

			console.log('[MIC] Microphone access granted');
			if (this.inputAudioContext.state === 'suspended') {
				await this.inputAudioContext.resume();
			}
			console.log('[MIC] AudioContext created, sample rate:', this.inputAudioContext.sampleRate);
			
			const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);

			// Use ScriptProcessorNode for audio processing (matching Google example)
			const bufferSize = 256;
			this.audioProcessor = this.inputAudioContext.createScriptProcessor(bufferSize, 1, 1);

			this.audioProcessor.onaudioprocess = (audioProcessingEvent) => {
				if (!this.isRecording || !this.setupComplete || !this.session) return;

				const inputBuffer = audioProcessingEvent.inputBuffer;
				const pcmData = inputBuffer.getChannelData(0);

				// Send audio data to Gemini using the session
				try {
					const audioData = this.createBlob(pcmData);
					// Log first few chunks for debugging
					if (this.audioChunkCount < 3) {
						console.log(`[AUDIO] Sending chunk ${this.audioChunkCount}, data length: ${audioData.data.length}, mimeType: ${audioData.mimeType}`);
					}
					// Use 'media' property - SDK expects this format
					this.session.sendRealtimeInput({ media: audioData });
					this.audioChunkCount++;
				} catch (error) {
					console.error('[AUDIO] Error sending audio chunk:', error);
					// Stop sending if there's an error
					if (error.message && error.message.includes('CLOSED')) {
						this.isRecording = false;
					}
				}
			};

			source.connect(this.audioProcessor);
			this.audioProcessor.connect(this.inputAudioContext.destination);

			this.isRecording = true;
			console.log('[MIC] Recording started');
		} catch (error) {
			this.ui.updateStatus('Microphone access denied: ' + error.message);
			console.error('[MIC] Error:', error);
		}
	}

	// Encode bytes to base64 (matching Google example)
	encode(bytes) {
		let binary = '';
		const len = bytes.byteLength;
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	// Create blob from PCM data (matching Google example)
	// Returns an object with data (base64) and mimeType, NOT a Blob object
	createBlob(pcmData) {
		const l = pcmData.length;
		const int16 = new Int16Array(l);
		for (let i = 0; i < l; i++) {
			// Convert float32 -1 to 1 to int16 -32768 to 32767
			int16[i] = pcmData[i] * 32768;
		}

		return {
			data: this.encode(new Uint8Array(int16.buffer)),
			mimeType: 'audio/pcm;rate=16000',
		};
	}

	handleGeminiResponse(message) {
		try {
			console.log('[GEMINI] Processing message:', message);
			console.log('[GEMINI] serverContent:', message.serverContent);

			// Handle audio responses (if any)
			const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData;
			if (audio) {
				console.log('[GEMINI] Audio response received');
				// Handle audio playback if needed
				// For now, we're focusing on text responses
			}

			// Handle interruption
			const interrupted = message.serverContent?.interrupted;
			if (interrupted) {
				console.log('[GEMINI] User interrupted - clearing sources');
				for (const source of this.sources.values()) {
					source.stop();
					this.sources.delete(source);
				}
			}

			// Handle text responses
			if (message.serverContent?.modelTurn) {
				if (!this.currentTurnActive) {
					this.currentTurnActive = true;
					console.log('[GEMINI] Model turn started');
				}

				const parts = message.serverContent.modelTurn.parts;
				console.log('[GEMINI] Parts:', parts);
				if (parts && parts.length > 0) {
					// Accumulate text from this streaming chunk
					for (const part of parts) {
						console.log('[GEMINI] Part:', part, 'Has text:', !!part.text, 'Has audio:', !!part.inlineData);
						if (part.text) {
							console.log('[GEMINI] Found text:', part.text);
							this.accumulatedText += part.text;
						}
						// With TEXT modality, we should consistently get text responses
					}
				}
			}

			// Check for turn complete - Gemini finished responding
			if (message.serverContent?.turnComplete) {
				console.log('[GEMINI] Turn complete - processing full response');
				console.log('[GEMINI] Accumulated text so far:', this.accumulatedText);
				this.currentTurnActive = false;

				// Process text response
				if (this.accumulatedText && this.accumulatedText.trim().length > 0) {
					const responseData = this.parseResponse(this.accumulatedText);
					
					if (responseData) {
						const { transcript, analysis, emoji, confidence, sentiment, emotion } = responseData;
						
						console.log('[GEMINI] Parsed response:', responseData);
						
						// Add to transcript log with analysis
						if (transcript && analysis) {
							this.ui.addToTranscriptLog(transcript, analysis);
							// Update UI with analysis
							this.ui.updateDisplay(responseData);
						} else if (analysis) {
							// If we have analysis but no transcript, still show it
							this.ui.updateDisplay(responseData);
						}
					}

					// Reset for next turn
					this.accumulatedText = '';
				} else {
					console.log('[GEMINI] Turn complete but no text received');
				}

				this.ui.updateStatus('Streaming audio...');
				this.ui.showListeningAnimation();
			}

		} catch (error) {
			console.error('[GEMINI] Error processing response:', error, 'Message:', message);
			this.accumulatedText = '';
			this.currentTurnActive = false;
		}
	}

	// Parse response - normalize Gemini's actual response format
	// Handles variations: transcription vs transcript, nested analysis objects, etc.
	parseResponse(text) {
		try {
			// Try to parse as JSON first
			let jsonData;
			try {
				jsonData = JSON.parse(text.trim());
			} catch (e) {
				// Not valid JSON, try to extract JSON from text if wrapped
				const jsonMatch = text.match(/\{[\s\S]*\}/);
				if (jsonMatch) {
					jsonData = JSON.parse(jsonMatch[0]);
				} else {
					throw new Error('No JSON found');
				}
			}
			
			// Normalize the response to our expected format
			// Handle field name variations
			const transcript = jsonData.transcript || jsonData.transcription || null;
			
			// Handle analysis - could be string or nested object
			let analysis = null;
			if (typeof jsonData.analysis === 'string') {
				analysis = jsonData.analysis;
			} else if (typeof jsonData.analysis === 'object' && jsonData.analysis !== null) {
				// Nested analysis object - extract the most relevant field
				const analysisObj = jsonData.analysis;
				if (analysisObj.uni_personal_reaction) {
					analysis = analysisObj.uni_personal_reaction;
				} else if (analysisObj.response_suggestion) {
					analysis = analysisObj.response_suggestion;
				} else {
					// Build from components
					const parts = [];
					if (analysisObj.sentiment?.overall) parts.push(`Sentiment: ${analysisObj.sentiment.overall}`);
					if (analysisObj.tone) parts.push(`Tone: ${analysisObj.tone}`);
					if (analysisObj.emotion_detected) parts.push(`Emotion: ${analysisObj.emotion_detected}`);
					analysis = parts.join('. ') || JSON.stringify(analysisObj);
				}
			}
			
			// Extract all fields - handle both string and nested sentiment
			let sentiment = null;
			if (typeof jsonData.sentiment === 'string') {
				sentiment = jsonData.sentiment;
			} else if (jsonData.sentiment?.overall) {
				sentiment = jsonData.sentiment.overall;
			} else if (jsonData.analysis?.sentiment?.overall) {
				sentiment = jsonData.analysis.sentiment.overall;
			}
			
			// Extract emotion - could be top level or in analysis
			let emotion = jsonData.emotion || jsonData.analysis?.emotion_detected || null;
			
			// Extract emoji
			const emoji = jsonData.emoji || null;
			
			// Extract confidence - handle string or number
			let confidence = jsonData.confidence;
			if (typeof confidence === 'string') {
				confidence = parseFloat(confidence);
			}
			if (isNaN(confidence) || confidence === null || confidence === undefined) {
				confidence = null;
			}
			
			// Extract visualization fields
			let color = jsonData.color || null;
			// Handle hex color format - normalize to string with #
			if (color) {
				// Remove 0x prefix if present, add # prefix
				color = String(color).replace(/^0x/i, '#');
				// Ensure it starts with #
				if (!color.startsWith('#')) {
					color = '#' + color;
				}
			}
			
			// Extract speed - handle string or number, normalize to -1 to 1 range
			let speed = jsonData.speed;
			if (typeof speed === 'string') {
				speed = parseFloat(speed);
			}
			if (isNaN(speed) || speed === null || speed === undefined) {
				speed = null;
			} else {
				// Clamp to -1 to 1 range
				speed = Math.max(-1, Math.min(1, speed));
			}
			
			// Extract smooth - handle string or number, normalize to 0 to 1 range
			let smooth = jsonData.smooth;
			if (typeof smooth === 'string') {
				smooth = parseFloat(smooth);
			}
			if (isNaN(smooth) || smooth === null || smooth === undefined) {
				smooth = null;
			} else {
				// Clamp to 0 to 1 range
				smooth = Math.max(0, Math.min(1, smooth));
			}
			
			// Build normalized response
			const normalized = {
				transcript,
				analysis,
				sentiment,
				emotion,
				emoji: emoji || '💬',
				confidence,
				color,
				speed,
				smooth,
				// Keep raw data for debugging
				raw: jsonData
			};
			
			if (transcript || analysis) {
				return normalized;
			}
		} catch (e) {
			// JSON parsing failed, fall through to regex extraction
			console.log('[GEMINI] JSON parse failed, using regex fallback:', e.message);
		}
		
		// Fallback to regex extraction for unstructured responses
		const transcript = this.extractTranscript(text);
		const analysis = this.extractAnalysis(text);
		const emoji = this.extractEmoji(text);
		
		if (transcript || analysis) {
			return { transcript, analysis, emoji };
		}
		
		return null;
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

		// Close audio contexts
		if (this.inputAudioContext) {
			this.inputAudioContext.close();
			this.inputAudioContext = null;
		}
		if (this.outputAudioContext) {
			this.outputAudioContext.close();
			this.outputAudioContext = null;
		}

		// Clear processor
		if (this.audioProcessor) {
			this.audioProcessor.disconnect();
			this.audioProcessor = null;
		}

		// Close session
		if (this.session) {
			this.session.close();
			this.session = null;
		}

		// Clear client
		this.client = null;

		// Reset state
		this.isRecording = false;
		this.setupComplete = false;
		this.audioChunkCount = 0;
		this.accumulatedText = '';
		this.currentTurnActive = false;
		this.sources.clear();

		// Reset UI
		this.ui.updateUI(false);
		this.ui.resetDisplay();
	}
}
