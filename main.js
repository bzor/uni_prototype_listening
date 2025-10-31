console.log("[V0.2]");

// Import modules
import { UIManager } from './ui.js';
import { GeminiLiveManager } from './gemini-live.js';

// Initialize modules
const uiManager = new UIManager();
const geminiManager = new GeminiLiveManager(uiManager);

// Set up event handlers
uiManager.onConnectRequested = async (apiKey) => {
	uiManager.updateStatus('Connecting to Gemini...');
	await geminiManager.connect(apiKey);
};

uiManager.onDisconnectRequested = () => {
	geminiManager.disconnect();
};