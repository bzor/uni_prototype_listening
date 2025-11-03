// UI Module - Handles DOM elements, event listeners, and UI updates
import { LEDVisualizer } from './ledVis.js';
import { gsap } from "gsap";

export class UIDisplay {
	constructor() {
		// DOM elements
		this.apiKeyInput = document.getElementById('apiKey');
		this.connectBtn = document.getElementById('connectBtn');
		this.disconnectBtn = document.getElementById('disconnectBtn');
		this.statusDiv = document.getElementById('status');
		this.emojiDisplay = document.getElementById('emoji-response');
		this.descriptionDiv = document.getElementById('description');
		this.transcriptLog = document.getElementById('transcriptLog');

		// State
		this.transcriptHistory = [];
		this.maxTranscriptEntries = 200;

		// Initialize LED visualizer
		this.ledVis = new LEDVisualizer('ledCanvas');
		this.ledVis.start();

		this.initializeEventListeners();
		this.loadSavedApiKey();
	}

	initializeEventListeners() {
		this.connectBtn.addEventListener('click', () => {
			const apiKey = this.apiKeyInput.value.trim();
			if (!apiKey) {
				this.updateStatus('Please enter an API key');
				return;
			}
			this.onConnectRequested(apiKey);
		});

		this.disconnectBtn.addEventListener('click', () => {
			this.onDisconnectRequested();
		});
	}

	loadSavedApiKey() {
		window.addEventListener('DOMContentLoaded', () => {
			const savedApiKey = localStorage.getItem('gemini_api_key');
			if (savedApiKey) {
				this.apiKeyInput.value = savedApiKey;
				console.log('[STORAGE] Loaded saved API key');
			}
		});
	}

	// Callbacks for external events
	onConnectRequested(apiKey) {
		// Override this in main.js
	}

	onDisconnectRequested() {
		// Override this in main.js
	}

	updateStatus(message) {
		this.statusDiv.textContent = message;
	}

	updateUI(connected) {
		this.connectBtn.disabled = connected;
		this.disconnectBtn.disabled = !connected;
		this.apiKeyInput.disabled = connected;
	}

	updateDisplay(responseData) {
		this.emojiDisplay.textContent = responseData.emoji;
		gsap.fromTo(this.emojiDisplay, {scale: 0}, {duration: 0.5, scale: 1, ease: "back.out"});
		//this.descriptionDiv.textContent = description;
		const color = responseData.color;
		const speed = responseData.speed;
		const smooth = responseData.smooth;
		
		console.log(`[UI] updateDisplay called - color:`, color, `speed:`, speed, `smooth:`, smooth);
		console.log(`[UI] Full responseData:`, responseData);
		
		this.ledVis.setAnimation("emoting", color, speed, smooth);
	}

	addToTranscriptLog(transcript, analysis) {
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
		this.transcriptHistory.push(entryDiv);

		// Cap at max entries
		if (this.transcriptHistory.length > this.maxTranscriptEntries) {
			const removed = this.transcriptHistory.shift();
			if (removed && removed.parentNode) {
				removed.parentNode.removeChild(removed);
			}
		}

		// Add to display
		this.transcriptLog.appendChild(entryDiv);

		// Auto-scroll to bottom
		this.transcriptLog.scrollTop = this.transcriptLog.scrollHeight;
	}

	clearTranscriptLog() {
		this.transcriptLog.innerHTML = '';
		this.transcriptHistory = [];
	}

	resetDisplay() {
		this.emojiDisplay.textContent = '🔌';
		this.descriptionDiv.textContent = 'Waiting for Connection';
		this.updateStatus('');
		this.clearTranscriptLog();
		this.ledVis.showIdle();
	}

	getApiKey() {
		return this.apiKeyInput.value.trim();
	}

	// LED Animation Control Methods
	showListeningAnimation() {
		//this.ledVis.showListening();
	}

	showAnalyzingAnimation() {
		//this.ledVis.showAnalyzing();
	}

	showSuccessAnimation() {
		//this.ledVis.showSuccess();
	}

	showErrorAnimation() {
		//this.ledVis.showError();
	}

	showIdleAnimation() {
		//this.ledVis.showIdle();
	}

	// Advanced LED control
	setLEDAnimation(type, params = {}) {
		this.ledVis.setAnimation(type, params);
	}

	setLEDCount(count) {
		this.ledVis.setLEDCount(count);
	}

	setLEDBrightness(brightness) {
		this.ledVis.setBrightness(brightness);
	}

	setLEDColor(color) {
		this.ledVis.setColor(color);
	}
}
