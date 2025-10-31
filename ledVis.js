
import { MathUtils, mix, mixColors, mixRgba, fibonacciSpiral, hexToRgba, smoothstep, clamp, sin, cos, fract, noise, fbm, map, remap, hexToRgb, rgbToHex } from './mathUtils.js';
import { gsap } from "gsap";

export class LEDVisualizer {
	constructor(canvasId) {
		this.canvas = document.getElementById(canvasId);
		this.ctx = this.canvas.getContext('2d');
		this.animationId = null;
		this.isRunning = false;

		this.width = 1600;
		this.height = 1600;

		this.time = 0;
		this.animationType = 'idle';
		this.animationParams = {};
		this.speed = -1.4;
		this.offset = 0.015;

		this.color1 = {color: hexToRgba("#353962")};
		this.color2 = {color: hexToRgba("#41527f")};

		this.leds = [];
		this.ledCount = 256;

		this.initializeLEDs();
		this.setupCanvas();
	}

	initializeLEDs() {
		this.leds = [];
		let theta = 0;
		let r = 0;
		for (let i = 0; i < this.ledCount; i++) {
			let iT = i / this.ledCount;

			let fib = fibonacciSpiral(i, 40.0);

			let x = this.width * 0.5 + fib.x;
			let y = this.width * 0.5 + fib.y;

			/*

			r = 20 + (1.0 - Math.pow(iT, 1.3)) * this.width * 0.4;

			let x = Math.cos(theta) * r + this.width * 0.5;
			let y = Math.sin(theta) * r + this.height * 0.5;
			theta += 137.5;
			*/

			this.leds.push({
				x: x,
				y: y,
				col: "#ff0000",
				brightness: 1.0
			})
		}
	}

	setupCanvas() {
		this.canvas.width = this.width;
		this.canvas.height = this.height;

		const dpr = window.devicePixelRatio || 1;
		this.canvas.style.width = Math.floor(this.width * 0.5) + 'px';
		this.canvas.style.height = Math.floor(this.height * 0.5) + 'px';
	}

	start() {
		if (!this.isRunning) {
			this.isRunning = true;
			this.animate();
		}
	}

	stop() {
		if (this.isRunning) {
			this.isRunning = false;
			if (this.animationId) {
				cancelAnimationFrame(this.animationId);
				this.animationId = null;
			}
		}
	}

	animate() {
		if (!this.isRunning) return;

		this.time += 0.016 * this.speed; // ~60fps

		this.update();
		this.render();

		this.animationId = requestAnimationFrame(() => this.animate());
	}

	update() {


		//idle breathing
		let bMin = 0.0;
		let bMax = 1.0;
		//this.ledCount = 1;
		for (let i = 0; i < this.ledCount; i++) {

			let brightness = 0;
			let iT = i / this.ledCount;

			brightness = remap(sin(this.time + i * this.offset), -1.0, 1.0, bMin, bMax);

			this.leds[i].brightness = brightness;
			let color = mixRgba(this.color1.color, mixRgba(this.color2.color), brightness);
			this.leds[i].color = color;
		}
	}

	render() {
		// Clear canvas
		this.ctx.fillStyle = '#0a0a0a';
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

		// Render LEDs
		for (let i = 0; i < this.ledCount; i++) {
			const led = this.leds[i];
			const radius = 8;

			// Create gradient for LED glow effect
			const gradient = this.ctx.createRadialGradient(
				led.x, led.y, 0,
				led.x, led.y, radius * 2
			);

			const color = hexToRgb(led.color);
			const alpha = led.brightness;

			this.ctx.fillStyle = led.color;
			this.ctx.globalAlpha = 0.3;
			this.ctx.beginPath();
			this.ctx.arc(led.x, led.y, radius * mix(0.2, 1.8, led.brightness), 0, Math.PI * 2);
			this.ctx.fill();

			// LED core
			this.ctx.fillStyle = led.color;
			this.ctx.globalAlpha = 1.0;
			this.ctx.beginPath();
			this.ctx.arc(led.x, led.y, radius * mix(0.4, 1, led.brightness), 0, Math.PI * 2);
			this.ctx.fill();
		}
	}

	// Animation control methods
	setAnimation(type, color, speed, smooth) {
		console.log(`[LED] setAnimation called - type: ${type}, color:`, color, `speed:`, speed, `smooth:`, smooth);
		console.log(`[LED] color type:`, typeof color, `color value:`, color);
		this.animationType = type;
		if (type == "idle") {
			gsap.to(this, { duration: 1, speed: -1.4, offset: 0.015, ease: "quad.inOut", overwrite: true});
			gsap.to(this.color1, { duration: 3, color: hexToRgba("#353962"), ease: "quad.inOut", overwrite: true});
			gsap.to(this.color2, { duration: 3, color: hexToRgba("#41527f"), ease: "quad.inOut", overwrite: true});
		} else if (type == "analyzing") {
			gsap.to(this, { duration: 1, speed: -10, offset: 0.012, ease: "quad.inOut", overwrite: true});
			gsap.to(this.color1, { duration: 3, color: hexToRgba("#FF00FF"), ease: "quad.inOut", overwrite: true});
			gsap.to(this.color2, { duration: 3, color: hexToRgba("#00FFFF"), ease: "quad.inOut", overwrite: true});
		} else if (type == "emoting") {
			// Use provided speed and smooth values
			// Speed: -1 to 1, map to animation speed range
			// Smooth: 0 to 1, controls offset smoothness
			const mappedSpeed = speed !== null && speed !== undefined ? mix(-10.0, 10.0, (speed + 1) / 2) : 0;
			const mappedSmooth = smooth !== null && smooth !== undefined ? smooth : 0.5;
			
			console.log(`[LED] Emoting - mappedSpeed: ${mappedSpeed}, mappedSmooth: ${mappedSmooth}`);
			
			gsap.to(this, { 
				duration: 1, 
				speed: mappedSpeed, 
				offset: mix(0, 0.1, 1.0 - mappedSmooth), 
				ease: "quad.inOut", 
				overwrite: true
			});
			
			// Use provided color or default
			console.log(`[LED] Color check - color exists:`, !!color, `color truthy:`, color ? 'yes' : 'no');
			if (color) {
				console.log(`[LED] Processing color:`, color);
				try {
					const baseColor = hexToRgba(color);
					console.log(`[LED] Base color (hexToRgba result):`, baseColor);
					
					// Create a darker variant for color1 and lighter for color2
					// Mix with black/white to create gradient effect
					const color1Dark = mixRgba(baseColor, hexToRgba("#000000"), 0.3);
					const color2Light = mixRgba(baseColor, hexToRgba("#FFFFFF"), 0.2);
					
					console.log(`[LED] Color1 (dark):`, color1Dark);
					console.log(`[LED] Color2 (light):`, color2Light);
					
					gsap.to(this.color1, { duration: 3, color: color1Dark, ease: "quad.inOut", overwrite: true});
					gsap.to(this.color2, { duration: 3, color: color2Light, ease: "quad.inOut", overwrite: true});
					
					console.log(`[LED] GSAP animations started for color1 and color2`);
				} catch (error) {
					console.error(`[LED] Error processing color:`, error, `color value:`, color);
					// Fallback to default colors
					gsap.to(this.color1, { duration: 3, color: hexToRgba("#FF00FF"), ease: "quad.inOut", overwrite: true});
					gsap.to(this.color2, { duration: 3, color: hexToRgba("#00FFFF"), ease: "quad.inOut", overwrite: true});
				}
			} else {
				console.log(`[LED] No color provided, using defaults`);
				// Default colors if no color provided
				gsap.to(this.color1, { duration: 3, color: hexToRgba("#FF00FF"), ease: "quad.inOut", overwrite: true});
				gsap.to(this.color2, { duration: 3, color: hexToRgba("#00FFFF"), ease: "quad.inOut", overwrite: true});
			}
		} else if (type == "listening") {
			gsap.to(this, { duration: 0.8, speed: 0.1, offset: 0.02, ease: "quad.inOut", overwrite: true});
			gsap.to(this.color1, { duration: 3, color: hexToRgba("#21d4f4"), ease: "quad.inOut", overwrite: true});
			gsap.to(this.color2, { duration: 3, color: hexToRgba("#60f0eb"), ease: "quad.inOut", overwrite: true});
		}
	}

	setBrightness(brightness) {
		for (let i = 0; i < this.ledCount; i++) {
			this.leds[i].brightness = clamp(brightness, 0, 1);
		}
	}

	setColor(color) {
		for (let i = 0; i < this.ledCount; i++) {
			this.leds[i].color = color;
		}
	}

	// Convenience methods for common animations
	showIdle() {
		this.setAnimation('idle');
	}

	showListening() {
		this.setAnimation('listening');
	}

	showAnalyzing() {
		this.setAnimation('analyzing');
	}

	showEmoting(color, speed, smooth) {
		this.setAnimation('emoting');
	}

	// Handle window resize
	handleResize() {
		this.setupCanvas();
	}
}
