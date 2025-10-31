// Math Utils Library - GLSL-style functions for JavaScript
// Inspired by Inigo Quilez and shader programming

export const MathUtils = {
  // Constants
  PI: Math.PI,
  TAU: Math.PI * 2,
  E: Math.E,
  PHI: (1 + Math.sqrt(5)) / 2, // Golden ratio
  
  // Basic operations
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  clamp: (x, minVal, maxVal) => Math.min(Math.max(x, minVal), maxVal),
  saturate: (x) => Math.min(Math.max(x, 0), 1),
  
  // Interpolation
  mix: (x, y, a) => x + (y - x) * a,
  lerp: (x, y, a) => x + (y - x) * a,
  
  // Smooth interpolation
  smoothstep: (edge0, edge1, x) => {
    const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  },
  
  smootherstep: (edge0, edge1, x) => {
    const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  },
  
  // Trigonometric functions
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  
  // Exponential and logarithmic
  pow: Math.pow,
  exp: Math.exp,
  log: Math.log,
  log2: Math.log2,
  sqrt: Math.sqrt,
  inversesqrt: (x) => 1 / Math.sqrt(x),
  
  // Rounding
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  fract: (x) => x - Math.floor(x),
  
  // Modulo
  mod: (x, y) => x - y * Math.floor(x / y),
  fmod: (x, y) => x - y * Math.floor(x / y),
  
  // Sign and step
  sign: (x) => x > 0 ? 1 : x < 0 ? -1 : 0,
  step: (edge, x) => x < edge ? 0 : 1,
  
  // Distance functions
  length: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
  distance: (p0, p1) => Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  
  // Vector operations
  normalize: (v) => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
  },
  
  // Noise functions
  noise: (x) => {
    const p = Math.floor(x);
    const f = x - p;
    const a = Math.sin(p * 12.9898) * 43758.5453;
    const b = Math.sin((p + 1) * 12.9898) * 43758.5453;
    return MathUtils.mix(a - Math.floor(a), b - Math.floor(b), f);
  },
  
  // Random functions
  random: (x) => {
    const p = Math.floor(x);
    const f = x - p;
    const a = Math.sin(p * 12.9898) * 43758.5453;
    return (a - Math.floor(a)) * f;
  },
  
  // Color space conversions
  rgb2hsv: (r, g, b) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    let h = 0;
    if (diff !== 0) {
      if (max === r) h = ((g - b) / diff) % 6;
      else if (max === g) h = (b - r) / diff + 2;
      else h = (r - g) / diff + 4;
    }
    h = (h * 60 + 360) % 360;
    
    const s = max === 0 ? 0 : diff / max;
    const v = max;
    
    return { h, s, v };
  },
  
  hsv2rgb: (h, s, v) => {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    return {
      r: (r + m) * 255,
      g: (g + m) * 255,
      b: (b + m) * 255
    };
  },
  
  // Easing functions
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  
  easeInSine: (t) => 1 - Math.cos(t * Math.PI / 2),
  easeOutSine: (t) => Math.sin(t * Math.PI / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  
  // Wave functions
  sawtooth: (x) => 2 * (x - Math.floor(x + 0.5)),
  triangle: (x) => 2 * Math.abs(2 * (x - Math.floor(x + 0.5))) - 1,
  square: (x) => Math.sin(x) > 0 ? 1 : -1,
  
  // Fractal functions
  fbm: (x, octaves = 4, lacunarity = 2, gain = 0.5) => {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    
    for (let i = 0; i < octaves; i++) {
      value += amplitude * MathUtils.noise(x * frequency);
      amplitude *= gain;
      frequency *= lacunarity;
    }
    
    return value;
  },
  
  // Domain warping
  domainWarp: (p, strength = 1) => {
    const q = {
      x: MathUtils.fbm({ x: p.x, y: p.y }),
      y: MathUtils.fbm({ x: p.x + 5.2, y: p.y + 1.3 })
    };
    return {
      x: p.x + q.x * strength,
      y: p.y + q.y * strength
    };
  },
  
  // Polar coordinates
  cartesianToPolar: (x, y) => ({
    r: Math.sqrt(x * x + y * y),
    theta: Math.atan2(y, x)
  }),
  
  polarToCartesian: (r, theta) => ({
    x: r * Math.cos(theta),
    y: r * Math.sin(theta)
  }),
  
  // Spiral functions
  fibonacciSpiral: (n, scale = 1) => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const angle = n * 2 * Math.PI / (phi * phi);
    const radius = scale * Math.sqrt(n);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  },
  
  // Golden angle spiral
  goldenSpiral: (n, scale = 1) => {
    const goldenAngle = 2.39996322972865332; // 137.5 degrees in radians
    const angle = n * goldenAngle;
    const radius = scale * Math.sqrt(n);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  },
  
  // Utility functions
  map: (value, inMin, inMax, outMin, outMax) => {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
  },
  
  remap: (value, inMin, inMax, outMin, outMax) => {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
  },
  
  // Color mixing
  mixColors: (color1, color2, t) => {
    return {
      r: MathUtils.mix(color1.r, color2.r, t),
      g: MathUtils.mix(color1.g, color2.g, t),
      b: MathUtils.mix(color1.b, color2.b, t)
    };
  },
  
  // Hex to RGB
  hexToRgb: (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  },
  
  // RGB to Hex
  rgbToHex: (r, g, b) => {
    return "#" + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
  },
  
  // Hex to RGBA CSS string
  hexToRgba: (hex, alpha = 1) => {
    const rgb = MathUtils.hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  },
  
  // Parse RGBA string to RGB values
  parseRgba: (rgbaString) => {
    if (!rgbaString || typeof rgbaString !== 'string') {
      return { r: 0, g: 0, b: 0, a: 1 };
    }
    const match = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return { r: 1, g: 0, b: 1, a: 1 };
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] ? parseFloat(match[4]) : 1
    };
  },
  
  // Mix two RGBA strings
  mixRgba: (color1, color2, t) => {
    if (!color1 || !color2) {
      return color1 || color2 || 'rgba(0, 0, 0, 1)';
    }
    
    const c1 = MathUtils.parseRgba(color1);
    const c2 = MathUtils.parseRgba(color2);
    
    const r = Math.round(MathUtils.mix(c1.r, c2.r, t));
    const g = Math.round(MathUtils.mix(c1.g, c2.g, t));
    const b = Math.round(MathUtils.mix(c1.b, c2.b, t));
    const a = MathUtils.mix(c1.a, c2.a, t);
    
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
};

// Export individual functions for convenience
export const {
  abs, min, max, clamp, saturate,
  mix, lerp, smoothstep, smootherstep,
  sin, cos, tan, asin, acos, atan, atan2,
  pow, exp, log, log2, sqrt, inversesqrt,
  floor, ceil, round, fract,
  mod, fmod, sign, step,
  length, distance, dot, normalize,
  noise, random,
  rgb2hsv, hsv2rgb,
  easeInQuad, easeOutQuad, easeInOutQuad,
  easeInCubic, easeOutCubic, easeInOutCubic,
  easeInSine, easeOutSine, easeInOutSine,
  sawtooth, triangle, square,
  fbm, domainWarp,
  cartesianToPolar, polarToCartesian,
  fibonacciSpiral, goldenSpiral,
  map, remap, mixColors, hexToRgb, rgbToHex, hexToRgba, parseRgba, mixRgba
} = MathUtils;
