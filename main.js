console.log("[V0.2]");

// Import modules
import { UIDisplay } from './ui.js';
import { Mic } from './mic.js';

// Initialize modules
const uiDisplay = new UIDisplay();
const geminiAudio = new Mic(uiDisplay);

// Set up event handlers
uiDisplay.onConnectRequested = async (apiKey) => {
	uiDisplay.updateStatus('Connecting to Gemini...');
	await geminiAudio.connect(apiKey);
};

uiDisplay.onDisconnectRequested = () => {
	geminiAudio.disconnect();
};