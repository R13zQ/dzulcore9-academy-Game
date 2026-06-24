/* ===================================================
   NEOMATH: OVERDRIVE 2035 - GAME ENGINE & SYSTEMS
   =================================================== */

// --- GAME STATE & CONFIGURATION ---
const CONFIG = {
  laneWidth: 2.2,
  laneX: [-2.2, 0, 2.2], // Left, Center, Right lanes
  baseSpeed: 15.0,
  maxSpeed: 45.0,
  jumpDuration: 0.75, // in seconds
  slideDuration: 0.65, // in seconds
  cyberGateInterval: 15000, // Spawn gate every 15s
  overdriveDuration: 5000, // 5 seconds of God Mode
};

let state = {
  isPlaying: false,
  isGameOver: false,
  score: 0,
  distance: 0,
  nodes: 0,
  multiplier: 1,
  speed: CONFIG.baseSpeed,
  targetSpeed: CONFIG.baseSpeed,
  currentLane: 1, // 0 = Left, 1 = Center, 2 = Right
  playerX: 0,
  playerY: 0,
  isJumping: false,
  jumpTime: 0,
  isSliding: false,
  slideTime: 0,
  
  // Powerups
  shieldActive: false,
  magnetActive: false,
  magnetTimer: 0,
  flyActive: false,
  flyTimer: 0,
  
  // Overdrive
  overdriveCharge: 0, // 0 to 100
  overdriveActive: false,
  overdriveTimer: 0,
  correctStreak: 0,
  
  // Math Game
  inGatePhase: false,
  gateTimer: 0,
  gateMaxTime: 6.0, // seconds to solve
  currentEquation: null,
  correctLaneIndex: null,
  perfectDriftCheckTime: 0,
  equationsSolved: 0,
  
  // Customization
  activeSkin: 'cyan',
  unlockedSkins: ['cyan'],
  
  // Audio state
  audioEnabled: true,
  
  // Daily Contracts progress
  contracts: [
    { id: 1, desc: "Kumpulkan 100 Data Nodes", target: 100, current: 0, reward: 50, done: false },
    { id: 2, desc: "Selesaikan 5 Soal Matematika", target: 5, current: 0, reward: 80, done: false },
    { id: 3, desc: "Capai Jarak 1500 Meter", target: 1500, current: 0, reward: 120, done: false }
  ]
};

// Skin Configuration
const SKINS = {
  cyan: { name: "Cyber Cyan (Default)", price: 0, color: 0x00ffff, trail: 0x00ffff },
  magenta: { name: "Neon Overdrive", price: 150, color: 0xff007f, trail: 0xff007f },
  gold: { name: "Solar Flare", price: 300, color: 0xffc700, trail: 0xffc700 },
  matrix: { name: "Matrix Specter", price: 500, color: 0x39ff14, trail: 0x39ff14 }
};

// Global Game Variables
let scene, camera, renderer;
let playerMesh, playerTrail, playerThrusterLight, playerPlaneTexture;
let roadSegments = [];
let environmentObjects = [];
let obstacles = [];
let collectibles = [];
let activeCyberGates = [];
let clock = new THREE.Clock();
let keyboard = {};
let touchStartX = 0;
let touchStartY = 0;

// UI Elements
const ui = {
  loading: document.getElementById('loading-screen'),
  menu: document.getElementById('main-menu'),
  hud: document.getElementById('game-hud'),
  hudNodes: document.getElementById('hud-nodes'),
  hudMultiplier: document.getElementById('hud-multiplier'),
  hudDistance: document.getElementById('hud-distance'),
  hudSpeed: document.getElementById('hud-speed'),
  hudEquation: document.getElementById('hud-equation'),
  gateBanner: document.getElementById('cyber-gate-banner'),
  gateTimerFill: document.getElementById('gate-timer-fill'),
  driftNotif: document.getElementById('perfect-drift-notif'),
  overdriveFill: document.getElementById('overdrive-fill'),
  overdriveStatus: document.getElementById('overdrive-status-text'),
  gameOver: document.getElementById('game-over-screen'),
  goDistance: document.getElementById('go-distance'),
  goNodes: document.getElementById('go-nodes'),
  goEquations: document.getElementById('go-equations'),
  btnReboot: document.getElementById('btn-reboot'),
  btnToggleAudio: document.getElementById('btn-toggle-audio'),
};

// --- PROCEDURAL WEB AUDIO SYNTHESIZER ---
class AudioSynthEngine {
  constructor() {
    this.ctx = null;
    this.musicInterval = null;
    this.step = 0;
    this.isPlayingMusic = false;
    this.noiseBuffer = null;
    this.delayNode = null;
    this.delayGain = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      
      // Pre-generate noise buffer for hi-hats, snares and wind sounds
      const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      // Global delay echo effect for melody lead
      this.delayNode = this.ctx.createDelay();
      this.delayNode.delayTime.value = 0.24; // eighth note delay at 125 bpm
      this.delayGain = this.ctx.createGain();
      this.delayGain.gain.value = 0.25; // echo volume feedback
      
      this.delayNode.connect(this.delayGain);
      this.delayGain.connect(this.delayNode);
      this.delayNode.connect(this.ctx.destination);
    } catch (e) {
      console.warn("Web Audio API is not supported or failed to initialize", e);
    }
  }

  midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  // Node collection chime (Cyberpunk high-pitched digital coin sound)
  playNodeSound() {
    if (!state.audioEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.08); // high sweep
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Jump sound
  playJumpSound() {
    if (!state.audioEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.2);
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Slide swoosh
  playSlideSound() {
    if (!state.audioEnabled || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.25);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.25);
  }

  // Laser Gate Passed successfully sound (major arpeggio C-E-G-C)
  playMathSuccessSound() {
    if (!state.audioEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    
    frequencies.forEach((freq, index) => {
      const time = now + index * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.linearRampToValueAtTime(0.001, time + 0.12);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.12);
    });
  }

  // Crash Explosion Sound
  playCrashSound() {
    if (!state.audioEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    
    // Low frequency rumbler
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.linearRampToValueAtTime(20, now + 0.6);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.6);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
    
    // Noise blast
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, now);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, now);
      noiseGain.gain.linearRampToValueAtTime(0.001, now + 0.7);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.7);
    }
  }

  // Power Up collection sound
  playPowerUpSound() {
    if (!state.audioEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.35); // fast riser
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.35);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  // Drum Synthesizer: Kick (Punchy digital beat)
  playKick(time) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.12); // fast pitch drop
    
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.12);
  }

  // Drum Synthesizer: Snare (Filtered noise blast)
  playSnare(time) {
    if (!this.ctx || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, time);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(time);
    noise.stop(time + 0.15);
  }

  // Drum Synthesizer: Hi-Hat (High-pass crisp noise)
  playHiHat(time) {
    if (!this.ctx || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.015, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(time);
    noise.stop(time + 0.04);
  }

  // Rhythmic Synthwave Loop with Bassline, Drums, and Lead Melody
  startMusic() {
    this.init();
    if (this.isPlayingMusic || !state.audioEnabled || !this.ctx) return;
    
    // Resume context if suspended (browser autoplay restriction safety)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    this.isPlayingMusic = true;
    
    // Upbeat 16-step cyberpunk Phonk bassline
    const bassMIDI = [
      36, 36, 48, 36, 39, 39, 51, 39, // Octave jumps: C2/C3 then Eb2/Eb3
      41, 41, 53, 41, 34, 34, 46, 34  // Octave jumps: F2/F3 then Bb1/Bb2
    ];
    
    // Catchy cyber synthwave lead melody (in C minor)
    const melodyMIDI = [
      60, 0, 63, 65, 0, 67, 67, 0,
      70, 67, 0, 65, 63, 65, 60, 0,
      60, 0, 63, 65, 0, 67, 67, 0,
      72, 70, 67, 65, 67, 70, 72, 79
    ];
    
    const playStep = () => {
      if (!this.isPlayingMusic) return;
      const now = this.ctx.currentTime;
      
      // Dynamic tempo adjustment based on runner speed
      let speedMult = state.speed / CONFIG.baseSpeed;
      if (state.overdriveActive) {
        speedMult *= 1.25; // Music gets faster during overdrive mode!
      }
      const currentBpm = 125 * speedMult;
      const currentStepDuration = 60 / currentBpm / 2; // Eighth note step
      
      // Update delay feedback timing to match current tempo
      if (this.delayNode) {
        this.delayNode.delayTime.setValueAtTime(currentStepDuration, now);
      }
      
      const pitch = bassMIDI[this.step % bassMIDI.length];
      
      // 1. PLAY BASS
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(this.midiToFreq(pitch), now);
      
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + currentStepDuration * 0.95);
      
      // Filter sweep for cyberpunk bass
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + currentStepDuration * 0.95);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + currentStepDuration * 0.95);
      
      // 2. PLAY DRUMS
      // Kick drum on beats (quarter notes: step 0, 4, 8, 12)
      if (this.step % 4 === 0) {
        this.playKick(now);
      }
      // Snare drum on off-beats (step 4, 12 in 16-step cycles)
      if (this.step % 8 === 4) {
        this.playSnare(now);
      }
      // Hi-hat on every off-beat (step 1, 3, 5, 7, etc.)
      if (this.step % 2 === 1) {
        this.playHiHat(now);
      }
      
      // 3. PLAY LEAD MELODY
      const leadNote = melodyMIDI[this.step % melodyMIDI.length];
      if (leadNote > 0) {
        const leadOsc = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        
        // Sharper lead sound and louder during overdrive mode
        leadOsc.type = state.overdriveActive ? 'sawtooth' : 'triangle';
        leadOsc.frequency.setValueAtTime(this.midiToFreq(leadNote + 12), now); // Shift 1 octave up for melody
        
        const volume = state.overdriveActive ? 0.045 : 0.03;
        leadGain.gain.setValueAtTime(volume, now);
        leadGain.gain.exponentialRampToValueAtTime(0.001, now + currentStepDuration * 1.5);
        
        leadOsc.connect(leadGain);
        leadGain.connect(this.ctx.destination);
        
        // Route to the global delay feedback loop
        if (this.delayNode) {
          leadGain.connect(this.delayNode);
        }
        
        leadOsc.start(now);
        leadOsc.stop(now + currentStepDuration * 1.5);
      }
      
      this.step++;
      
      // Schedule next step dynamically based on runner speed
      this.musicInterval = setTimeout(playStep, currentStepDuration * 1000);
    };
    
    playStep();
  }

  stopMusic() {
    this.isPlayingMusic = false;
    if (this.musicInterval) {
      clearTimeout(this.musicInterval);
      this.musicInterval = null;
    }
  }
}

const sfx = new AudioSynthEngine();

// --- THREE.JS INITIALIZATION & SCENE SETUP ---
function initThree() {
  const canvas = document.getElementById('game-canvas');
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(CONFIG.activeSkin === 'magenta' ? 0xff0055 : 0x030f24, 0.015);
  
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  // Camera aligned precisely with the background image vanishing point (aligned lower perspective)
  camera.position.set(0, 1.4, 4.8); 
  camera.rotation.x = -0.10; // Tilted to match the road lines exactly
  
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  
  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0x00f3ff, 0.5);
  directionalLight.position.set(5, 10, 5);
  scene.add(directionalLight);
  
  // Load player jet texture (with cache-busting timestamp to bypass stale browser cache)
  const textureLoader = new THREE.TextureLoader();
  playerPlaneTexture = textureLoader.load('gambar_2_transparent.png?v=' + Date.now());
  
  // Procedural environment building
  buildRoadSystem();
  buildCityscape();
  createPlayer();
  
  // Register events
  window.addEventListener('resize', onWindowResize);
  setupControls();
  
  // Hide loading screen, show main menu
  ui.loading.classList.remove('active');
  ui.menu.classList.add('active');
}

// --- ROAD GENERATION SYSTEM ---
function buildRoadSystem() {
  const segLength = 40;
  const numSegments = 5;
  
  for (let i = 0; i < numSegments; i++) {
    const group = new THREE.Group();
    const zPos = -i * segLength;
    group.position.z = zPos;
    
    // Glass surface geometry (highly transparent to let background show through)
    const roadGeo = new THREE.BoxGeometry(7.0, 0.1, segLength);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x000511,
      roughness: 0.2,
      metalness: 0.9,
      transparent: true,
      opacity: 0.02
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.position.y = -0.05;
    roadMesh.receiveShadow = true;
    group.add(roadMesh);
    
    // Circuit board underlying cyan/blue mesh lines
    const gridGeo = new THREE.PlaneGeometry(6.6, segLength);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x004488,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.y = -0.01;
    group.add(gridMesh);

    // Left & Right neon magenta outer walls
    const wallGeo = new THREE.BoxGeometry(0.15, 0.12, segLength);
    const wallMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
    
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.position.set(-3.2, 0.06, 0);
    group.add(leftWall);
    
    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.position.set(3.2, 0.06, 0);
    group.add(rightWall);
    
    // Dashed Cyan Lane lines (splitting tracks into 3 lanes)
    for (let l = 0; l < 2; l++) {
      const lineX = -1.1 + l * 2.2;
      const lineGeo = new THREE.PlaneGeometry(0.04, segLength);
      const lineMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.7
      });
      const dashLine = new THREE.Mesh(lineGeo, lineMat);
      dashLine.rotation.x = -Math.PI / 2;
      dashLine.position.set(lineX, 0.015, 0);
      group.add(dashLine);
    }
    
    scene.add(group);
    roadSegments.push({ mesh: group, length: segLength });
  }
}

// --- PARALLAX CITYSCAPE & CONSTELLATIONS ---
function buildCityscape() {
  // Clear existing cityscape elements
  environmentObjects.forEach(obj => scene.remove(obj));
  environmentObjects = [];
  
  // High Constellations (Connected network stars matching picture)
  const starGroup = new THREE.Group();
  const sphereGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  const points = [];
  
  // Create 6 floating hubs
  for (let s = 0; s < 6; s++) {
    const hub = new THREE.Mesh(sphereGeo, sphereMat);
    const posX = -15 + s * 6 + (Math.random() * 2 - 1) * 2;
    const posY = 12 + Math.random() * 8;
    const posZ = -60 - Math.random() * 30;
    
    hub.position.set(posX, posY, posZ);
    
    // Outer glow ring
    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    hub.add(ring);
    
    starGroup.add(hub);
    points.push(hub.position.clone());
  }
  
  // Draw random connections
  for (let p = 0; p < points.length; p++) {
    for (let k = p + 1; k < points.length; k++) {
      if (Math.random() > 0.4 && points[p].distanceTo(points[k]) < 25) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([points[p], points[k]]);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x0088cc,
          transparent: true,
          opacity: 0.25
        });
        const line = new THREE.Line(lineGeo, lineMat);
        starGroup.add(line);
      }
    }
  }
  scene.add(starGroup);
  environmentObjects.push(starGroup);

  // Moving highway light trails (ambient traffic)
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-14, 0.1, 0),
    new THREE.Vector3(-14, 0.1, -200)
  ]);
  const leftHighwayLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xff0055, opacity: 0.4 }));
  scene.add(leftHighwayLine);
  environmentObjects.push(leftHighwayLine);

  const rightHighwayLine = new THREE.Line(lineGeo.clone().translate(28, 0, 0), new THREE.LineBasicMaterial({ color: 0x00ffff, opacity: 0.4 }));
  scene.add(rightHighwayLine);
  environmentObjects.push(rightHighwayLine);
}

// --- PLAYER GENERATION & MANAGEMENT ---
function createPlayer() {
  if (playerMesh) scene.remove(playerMesh);
  
  playerMesh = new THREE.Group();
  playerMesh.position.set(0, 0, 0);
  
  // Get active skin colors
  const skin = SKINS[state.activeSkin] || SKINS.cyan;
  
  // Create textured jet plane (matching 612:685 aspect ratio, width=1.25, height=1.4)
  const jetGeo = new THREE.PlaneGeometry(1.25, 1.4);
  const jetMat = new THREE.MeshBasicMaterial({
    map: playerPlaneTexture,
    transparent: true,
    alphaTest: 0.1, // Discard transparent pixels to cast matching shadow shape
    side: THREE.DoubleSide
  });
  
  const jetMesh = new THREE.Mesh(jetGeo, jetMat);
  // Hover position (center at y=0.85, bottom at y=0.15)
  jetMesh.position.set(0, 0.85, 0);
  // Face camera tilt
  jetMesh.rotation.x = -0.10; 
  jetMesh.castShadow = true;
  playerMesh.add(jetMesh);
  
  // Thruster light (casting neon glow on ground from exhaust engine nozzles at y=0.36)
  playerThrusterLight = new THREE.PointLight(skin.trail, 2.5, 6);
  playerThrusterLight.position.set(0, 0.36, 0.1);
  playerMesh.add(playerThrusterLight);
  
  // Particle Trail
  createTrailParticles(skin.trail);
  
  scene.add(playerMesh);
}

function createTrailParticles(color) {
  if (playerTrail) playerMesh.remove(playerTrail);
  
  const pCount = 20;
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(pCount * 3);
  const sizes = new Float32Array(pCount);
  
  for (let i = 0; i < pCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 0.4;
    positions[i * 3 + 1] = 0.36; // Align with jet exhaust nozzles
    positions[i * 3 + 2] = 0.1 + i * 0.15; // Start just behind the plane
    sizes[i] = 1.0 - (i / pCount);
  }
  
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const pMat = new THREE.PointsMaterial({
    color: color,
    size: 0.15,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
  });
  
  playerTrail = new THREE.Points(pGeo, pMat);
  playerMesh.add(playerTrail);
}

function animatePlayerTrail() {
  if (!playerTrail) return;
  const positions = playerTrail.geometry.attributes.position.array;
  const count = positions.length / 3;
  
  for (let i = 0; i < count; i++) {
    // Dynamic trailing sparks logic
    // Move backwards and add vibration
    positions[i * 3] = (Math.random() - 0.5) * 0.3 * (i/count + 0.1);
    positions[i * 3 + 1] = 0.36 + (Math.random() - 0.5) * 0.05; // Align with jet exhaust nozzles
    // Oscillate z position
    positions[i * 3 + 2] = 0.1 + i * 0.15 + Math.sin(clock.getElapsedTime()*10 + i)*0.05; // Start just behind the plane
  }
  playerTrail.geometry.attributes.position.needsUpdate = true;
}

// --- CONTROLS SETUP (KEYBOARD & TOUCH SWIPES) ---
function setupControls() {
  // Desktop keyboard
  window.addEventListener('keydown', e => {
    keyboard[e.key] = true;
    if (!state.isPlaying || state.isGameOver) return;
    
    if (e.key === 'a' || e.key === 'ArrowLeft') {
      moveLane(-1);
    } else if (e.key === 'd' || e.key === 'ArrowRight') {
      moveLane(1);
    } else if (e.key === 'w' || e.key === 'ArrowUp' || e.key === ' ') {
      jump();
    } else if (e.key === 's' || e.key === 'ArrowDown') {
      slide();
    }
  });
  
  window.addEventListener('keyup', e => {
    keyboard[e.key] = false;
  });
  
  // Mobile touch swipe gestures
  const canvas = document.getElementById('game-canvas');
  
  canvas.addEventListener('touchstart', e => {
    if (!state.isPlaying || state.isGameOver) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  
  canvas.addEventListener('touchend', e => {
    if (!state.isPlaying || state.isGameOver) return;
    const diffX = e.changedTouches[0].clientX - touchStartX;
    const diffY = e.changedTouches[0].clientY - touchStartY;
    
    // Check if horizontal or vertical swipe dominates
    if (Math.abs(diffX) > Math.abs(diffY)) {
      // Horizontal
      if (Math.abs(diffX) > 40) {
        if (diffX > 0) moveLane(1); // Swipe Right
        else moveLane(-1); // Swipe Left
      }
    } else {
      // Vertical
      if (Math.abs(diffY) > 40) {
        if (diffY < 0) jump(); // Swipe Up
        else slide(); // Swipe Down
      }
    }
  }, { passive: true });
}

function moveLane(dir) {
  let prevLane = state.currentLane;
  state.currentLane = Math.max(0, Math.min(2, state.currentLane + dir));
  
  if (state.currentLane !== prevLane) {
    // Perfect Drift timing verification
    if (state.inGatePhase && activeCyberGates.length > 0) {
      const gate = activeCyberGates[0];
      const distanceToGate = Math.abs(gate.z);
      
      // If player moves to the correct lane at the very last second before collision
      // Time is approximated: speed = unit/sec. Distance / Speed = remaining seconds
      const secondsLeft = distanceToGate / state.speed;
      
      if (state.currentLane === state.correctLaneIndex && secondsLeft < 0.35 && secondsLeft > 0.05) {
        triggerPerfectDrift();
      }
    }
    sfx.playSlideSound();
  }
}

function jump() {
  if (state.isJumping || state.isSliding) return;
  state.isJumping = true;
  state.jumpTime = 0;
  sfx.playJumpSound();
}

function slide() {
  if (state.isJumping || state.isSliding) return;
  state.isSliding = true;
  state.slideTime = 0;
  sfx.playSlideSound();
}

function triggerPerfectDrift() {
  state.score += 500;
  ui.driftNotif.classList.remove('hidden');
  setTimeout(() => {
    ui.driftNotif.classList.add('hidden');
  }, 1000);
}

// --- ADAPTIVE MATH EQUATION GENERATOR ---
function generateEquation() {
  let level = 1;
  // Increase difficulty level based on equations solved
  if (state.equationsSolved >= 7) level = 3;
  else if (state.equationsSolved >= 3) level = 2;
  
  let equationStr = "";
  let targetVal = 0;
  
  if (level === 1) {
    // Linear equations: x + a = b or a - x = b
    const isAddition = Math.random() > 0.5;
    const valA = Math.floor(Math.random() * 12) + 2;
    const valX = Math.floor(Math.random() * 10) + 1;
    targetVal = valX;
    
    if (isAddition) {
      const sum = valX + valA;
      equationStr = `x + ${valA} = ${sum}`;
    } else {
      const diff = valA - valX;
      // Ensure positive values
      if (diff >= 0) {
        equationStr = `${valA} - x = ${diff}`;
        targetVal = valX;
      } else {
        targetVal = valX;
        equationStr = `x - ${valA} = ${valX - valA}`;
      }
    }
  } else if (level === 2) {
    // Multiplication or simple division: ax = b or x / a = b
    const isMult = Math.random() > 0.5;
    const valA = Math.floor(Math.random() * 6) + 2; // coefficient 2-7
    const valX = Math.floor(Math.random() * 8) + 2; // answer 2-9
    targetVal = valX;
    
    if (isMult) {
      const product = valA * valX;
      equationStr = `${valA}x = ${product}`;
    } else {
      const product = valA * valX;
      equationStr = `x / ${valA} = ${valX}`;
      targetVal = product; // answer is x = product
    }
  } else {
    // Mixed equations: ax - b = c or ax + b = c
    const isAddition = Math.random() > 0.5;
    const valA = Math.floor(Math.random() * 4) + 2; // coefficient 2-5
    const valX = Math.floor(Math.random() * 8) + 2; // answer 2-9
    const valB = Math.floor(Math.random() * 10) + 1; // constant
    
    if (isAddition) {
      const cVal = valA * valX + valB;
      equationStr = `${valA}x + ${valB} = ${cVal}`;
      targetVal = valX;
    } else {
      const cVal = valA * valX - valB;
      equationStr = `${valA}x - ${valB} = ${cVal}`;
      targetVal = valX;
    }
  }
  
  // distractor generator
  const answers = [targetVal];
  while (answers.length < 3) {
    const offset = Math.floor(Math.random() * 6) - 3;
    const distractor = targetVal + offset;
    if (distractor > 0 && !answers.includes(distractor)) {
      answers.push(distractor);
    }
  }
  
  // Shuffle options
  const shuffled = answers.sort(() => Math.random() - 0.5);
  const correctIdx = shuffled.indexOf(targetVal);
  
  state.correctLaneIndex = correctIdx;
  state.currentEquation = {
    str: equationStr,
    options: shuffled,
    answer: targetVal
  };
}

// --- DYNAMIC 3D NEON LASER GATES CREATION ---
function createGateTextTexture(text, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = 'rgba(10, 14, 26, 0.7)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, 236, 236);
  
  ctx.fillStyle = colorHex;
  ctx.font = '900 100px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colorHex;
  ctx.shadowBlur = 12;
  ctx.fillText(text, 128, 128);
  
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function spawnCyberGates() {
  if (state.isGameOver || state.overdriveActive) return;
  
  state.inGatePhase = true;
  state.gateTimer = state.gateMaxTime;
  
  generateEquation();
  
  // Display incoming Cyber Gate HUD
  ui.hudEquation.textContent = state.currentEquation.str;
  ui.gateBanner.classList.remove('hidden');
  ui.gateTimerFill.style.width = '100%';
  
  const gateColors = ['#00ffff', '#ff007f', '#ffcc00'];
  const gateColorHex = [0x00ffff, 0xff007f, 0xffcc00];
  const zPos = -100; // Spawn far ahead
  
  const gateGroup = new THREE.Group();
  gateGroup.position.set(0, 0, zPos);
  
  // Spawn 3 gates corresponding to options
  for (let lane = 0; lane < 3; lane++) {
    const laneX = CONFIG.laneX[lane];
    
    // Gate outer Frame
    const frameGeo = new THREE.BoxGeometry(2.0, 3.2, 0.15);
    const frameWireGeo = new THREE.BoxGeometry(2.05, 3.25, 0.2);
    
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x050c18,
      roughness: 0.5,
      metalness: 0.8
    });
    const frameWireMat = new THREE.MeshBasicMaterial({
      color: gateColorHex[lane],
      wireframe: true
    });
    
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(laneX, 1.6, 0);
    const wireframe = new THREE.Mesh(frameWireGeo, frameWireMat);
    frame.add(wireframe);
    gateGroup.add(frame);
    
    // Laser energy shield inside gate (semi-transparent)
    const shieldGeo = new THREE.BoxGeometry(1.8, 3.0, 0.02);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: gateColorHex[lane],
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.set(laneX, 1.6, 0);
    gateGroup.add(shield);
    
    // Answer text placard
    const textStr = state.currentEquation.options[lane].toString();
    const textTexture = createGateTextTexture(textStr, gateColors[lane]);
    const textGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const textMat = new THREE.MeshBasicMaterial({
      map: textTexture,
      transparent: true,
      side: THREE.DoubleSide
    });
    const textMesh = new THREE.Mesh(textGeo, textMat);
    textMesh.position.set(laneX, 1.6, 0.1);
    gateGroup.add(textMesh);
  }
  
  scene.add(gateGroup);
  activeCyberGates.push({ mesh: gateGroup, z: zPos });
}

// --- OBSTACLE & COLLECTIBLE SPAWN ENGINE ---
function spawnItemWave() {
  if (state.isGameOver || state.inGatePhase) return;
  
  // Decide what to spawn: Pink Nodes (Coins) or Obstacles
  const typeChance = Math.random();
  const zPos = -100;
  
  if (typeChance < 0.6) {
    // Spawn lines of Pink Nodes (Coins replacement)
    const lane = Math.floor(Math.random() * 3);
    const numNodes = 4 + Math.floor(Math.random() * 4);
    
    for (let i = 0; i < numNodes; i++) {
      const sphereGeo = new THREE.SphereGeometry(0.18, 12, 12);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0xff00a0,
        emissive: 0xff00a0,
        emissiveIntensity: 0.5
      });
      const node = new THREE.Mesh(sphereGeo, sphereMat);
      // Floating nodes
      node.position.set(CONFIG.laneX[lane], 0.3, zPos - i * 3.5);
      scene.add(node);
      
      // Point light for node
      if (i === 0 || i === Math.floor(numNodes / 2)) {
        const light = new THREE.PointLight(0xff00a0, 1.0, 3);
        node.add(light);
      }
      
      collectibles.push({ mesh: node, type: 'node', z: node.position.z });
    }
  } else if (typeChance < 0.8) {
    // Spawn a barricade obstacle
    const lane = Math.floor(Math.random() * 3);
    const heightType = Math.random() > 0.5 ? 'low' : 'high';
    
    let blockGeo, blockY;
    if (heightType === 'low') {
      // Low laser bar (Requires jumping)
      blockGeo = new THREE.BoxGeometry(2.0, 0.6, 0.3);
      blockY = 0.3;
    } else {
      // High floating laser bar (Requires sliding)
      blockGeo = new THREE.BoxGeometry(2.0, 0.5, 0.3);
      blockY = 1.4;
    }
    
    // Laser barrier mesh
    const blockMat = new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xff0055,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.7
    });
    
    const block = new THREE.Mesh(blockGeo, blockMat);
    block.position.set(CONFIG.laneX[lane], blockY, zPos);
    scene.add(block);
    
    // Add side nodes representing siber fence posts
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, heightType === 'low' ? 0.6 : 1.8, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x050c18 });
    const postLeft = new THREE.Mesh(postGeo, postMat);
    postLeft.position.set(-1.0, heightType === 'low' ? 0 : -0.5, 0);
    block.add(postLeft);
    const postRight = postLeft.clone();
    postRight.position.x = 1.0;
    block.add(postRight);
    
    obstacles.push({ mesh: block, type: 'laser', heightType: heightType, z: zPos, lane: lane });
  } else {
    // Spawn Powerups
    const lane = Math.floor(Math.random() * 3);
    const pTypes = ['magnet', 'shield', 'jetpack'];
    const pType = pTypes[Math.floor(Math.random() * pTypes.length)];
    
    // Avoid double shield
    if (pType === 'shield' && state.shieldActive) return;
    
    // 3D holographic power-up disc
    const discGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16);
    let discColor = 0x00ffff;
    if (pType === 'shield') discColor = 0xffcc00;
    if (pType === 'jetpack') discColor = 0x39ff14;
    
    const discMat = new THREE.MeshStandardMaterial({
      color: discColor,
      emissive: discColor,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.8
    });
    
    const disc = new THREE.Group();
    disc.position.set(CONFIG.laneX[lane], 0.4, zPos);
    
    const mainDisc = new THREE.Mesh(discGeo, discMat);
    mainDisc.rotation.x = Math.PI / 4;
    disc.add(mainDisc);
    
    // Add inner floating cube
    const cubeGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const cubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.position.y = 0.2;
    disc.add(cube);
    
    scene.add(disc);
    collectibles.push({ mesh: disc, type: pType, z: zPos });
  }
}

// --- COLLISION VERIFICATION & RESOLUTION ---
function checkCollisions() {
  const pX = CONFIG.laneX[state.currentLane];
  const pY = state.playerY;
  const pZ = 0; // Player is locked at Z = 0
  
  const playerBox = new THREE.Box3(
    new THREE.Vector3(pX - 0.35, pY, pZ - 0.8),
    new THREE.Vector3(pX + 0.35, pY + (state.isSliding ? 0.3 : 1.2), pZ + 0.8)
  );
  
  // 1. Verify Nodes & Power-ups
  for (let i = collectibles.length - 1; i >= 0; i--) {
    const col = collectibles[i];
    const cMesh = col.mesh;
    const cZ = cMesh.position.z;
    const cX = cMesh.position.x;
    const cY = cMesh.position.y;
    
    // If Magnet active, nodes fly towards player
    if (state.magnetActive && col.type === 'node' && Math.abs(cZ) < 25.0) {
      // Lerp node towards player position
      cMesh.position.x = THREE.MathUtils.lerp(cMesh.position.x, pX, 0.2);
      cMesh.position.y = THREE.MathUtils.lerp(cMesh.position.y, pY + 0.3, 0.2);
      cMesh.position.z = THREE.MathUtils.lerp(cMesh.position.z, pZ, 0.2);
    }
    
    const itemBox = new THREE.Box3().setFromObject(cMesh);
    
    if (playerBox.intersectsBox(itemBox)) {
      // Collect item
      scene.remove(cMesh);
      collectibles.splice(i, 1);
      
      if (col.type === 'node') {
        state.nodes += 1 * state.multiplier;
        ui.hudNodes.textContent = state.nodes.toString().padStart(3, '0');
        sfx.playNodeSound();
        
        // Add Overdrive Charge
        if (!state.overdriveActive) {
          state.overdriveCharge = Math.min(100, state.overdriveCharge + 1);
          ui.overdriveFill.style.width = `${state.overdriveCharge}%`;
          if (state.overdriveCharge >= 100) {
            triggerOverdrive();
          }
        }
        
        // Daily Contract check
        updateContractProgress(1, 1);
      } else {
        // Collect Power Up
        sfx.playPowerUpSound();
        activatePowerUp(col.type);
      }
    }
  }
  
  // 2. Verify Barricade Obstacles
  if (!state.overdriveActive && !state.flyActive) {
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      const oMesh = obs.mesh;
      
      const obsBox = new THREE.Box3().setFromObject(oMesh);
      
      if (playerBox.intersectsBox(obsBox)) {
        // Collision detected
        scene.remove(oMesh);
        obstacles.splice(i, 1);
        
        if (state.shieldActive) {
          state.shieldActive = false;
          // Deactivate shield
          sfx.playPowerUpSound(); // play reverse shield pop
        } else {
          gameOver();
        }
      }
    }
  }
  
  // 3. Verify Cyber Gates
  if (state.inGatePhase && activeCyberGates.length > 0) {
    const gate = activeCyberGates[0];
    const gateZ = gate.mesh.position.z;
    
    // When player crosses the gate threshold (crosses z = -0.5)
    if (gateZ >= -0.5) {
      state.inGatePhase = false;
      ui.gateBanner.classList.add('hidden');
      
      // Remove this gate immediately from the scene and from the active list
      scene.remove(gate.mesh);
      activeCyberGates.shift();
      
      if (state.overdriveActive || state.currentLane === state.correctLaneIndex) {
        // Solved correctly!
        sfx.playMathSuccessSound();
        state.score += 1000 * state.multiplier;
        state.equationsSolved++;
        state.correctStreak++;
        
        // Speed increases by 5 km/h (+1.25 units/s) for each correct answer
        state.targetSpeed = Math.min(CONFIG.maxSpeed, state.targetSpeed + 1.25);
        
        // Charge overdrive heavily
        if (!state.overdriveActive) {
          state.overdriveCharge = Math.min(100, state.overdriveCharge + 20);
          ui.overdriveFill.style.width = `${state.overdriveCharge}%`;
          if (state.overdriveCharge >= 100) {
            triggerOverdrive();
          }
        }
        
        // Daily Contract check
        updateContractProgress(2, 1);
      } else {
        // Hit wrong gate!
        if (state.shieldActive) {
          state.shieldActive = false;
          sfx.playPowerUpSound();
        } else {
          gameOver();
        }
      }
    }
  }
}

// --- OVERDRIVE MODE (GOD MODE) ---
function triggerOverdrive() {
  state.overdriveActive = true;
  state.overdriveTimer = CONFIG.overdriveDuration;
  state.overdriveCharge = 0;
  state.multiplier = 3; // Triple multiplier
  ui.hudMultiplier.textContent = `x${state.multiplier}`;
  ui.overdriveFill.style.width = '0%';
  ui.overdriveFill.classList.add('overdrive-active-bar');
  ui.overdriveStatus.textContent = "OVERDRIVE ACTIVE - MULTIPLIER TRIPLE!";
  
  // Visual effects
  scene.fog.color.setHex(0xff0055);
  camera.fov = 75; // Zoom out effect for speed impression
  camera.updateProjectionMatrix();
  
  // Powerup sounds
  sfx.playPowerUpSound();
}

function deactivateOverdrive() {
  state.overdriveActive = false;
  state.multiplier = 1;
  ui.hudMultiplier.textContent = `x${state.multiplier}`;
  ui.overdriveFill.classList.remove('overdrive-active-bar');
  ui.overdriveStatus.textContent = "READY FOR OVERCLOCK";
  
  // Reset visual effects
  scene.fog.color.setHex(0x050811);
  camera.fov = 60;
  camera.updateProjectionMatrix();
}

// --- POWER UPS LIFETIME MANAGEMENT ---
function activatePowerUp(type) {
  if (type === 'shield') {
    state.shieldActive = true;
  } else if (type === 'magnet') {
    state.magnetActive = true;
    state.magnetTimer = 8000; // 8s magnet
  } else if (type === 'jetpack') {
    state.flyActive = true;
    state.flyTimer = 5000; // 5s flying
  }
}

// --- GAME LOOP & UPDATES ---
function update(delta) {
  if (!state.isPlaying || state.isGameOver) return;
  
  // 1. Distance & Score
  state.distance += state.speed * delta;
  state.score += Math.floor(state.speed * delta * state.multiplier);
  
  ui.hudDistance.textContent = `${Math.floor(state.distance)}m`;
  ui.hudSpeed.textContent = `${Math.round(state.speed * 4)} km/h`;
  
  // Check Contract progress for distance
  updateContractProgress(3, Math.floor(state.distance));
  
  // Speed interpolation (increased rate to make acceleration feelable)
  state.speed = THREE.MathUtils.lerp(state.speed, state.targetSpeed, 0.08);
  
  // 2. Player horizontal position lerping
  const targetX = CONFIG.laneX[state.currentLane];
  state.playerX = THREE.MathUtils.lerp(state.playerX, targetX, 0.2);
  playerMesh.position.x = state.playerX;
  
  // Add slight hover tilt rotation when shifting lanes
  playerMesh.rotation.z = -(state.playerX - targetX) * 0.4;
  playerMesh.rotation.y = (state.playerX - targetX) * 0.2;
  
  // 3. Jump and Slide physics animations
  if (state.isJumping) {
    state.jumpTime += delta;
    const progress = state.jumpTime / CONFIG.jumpDuration;
    
    if (progress >= 1.0) {
      state.isJumping = false;
      state.playerY = 0;
    } else {
      // Parabolic jump arc: y = 4 * height * p * (1 - p)
      state.playerY = 4 * 1.6 * progress * (1 - progress);
    }
  } else if (state.isSliding) {
    state.slideTime += delta;
    const progress = state.slideTime / CONFIG.slideDuration;
    
    if (progress >= 1.0) {
      state.isSliding = false;
      playerMesh.scale.y = 1.0;
      playerMesh.scale.z = 1.0;
      state.playerY = 0;
    } else {
      // Scale down player bounding box
      playerMesh.scale.y = 0.4;
      playerMesh.scale.z = 1.4;
      state.playerY = 0;
    }
  } else if (state.flyActive) {
    // Jetpack fly height
    state.playerY = THREE.MathUtils.lerp(state.playerY, 3.2, 0.1);
  } else {
    // Normal floating
    state.playerY = THREE.MathUtils.lerp(state.playerY, Math.sin(clock.getElapsedTime() * 5) * 0.08, 0.1);
  }
  
  playerMesh.position.y = state.playerY;
  
  // 4. Overdrive & Powerup timers
  if (state.overdriveActive) {
    state.overdriveTimer -= delta * 1000;
    if (state.overdriveTimer <= 0) deactivateOverdrive();
  }
  
  if (state.magnetActive) {
    state.magnetTimer -= delta * 1000;
    if (state.magnetTimer <= 0) state.magnetActive = false;
  }
  
  if (state.flyActive) {
    state.flyTimer -= delta * 1000;
    if (state.flyTimer <= 0) state.flyActive = false;
  }
  
  // 5. Math Gate countdown timer based on physical distance
  if (state.inGatePhase && activeCyberGates.length > 0) {
    const gate = activeCyberGates[0];
    // Distance goes from -100 to 0. Calculate progress ratio.
    const progress = Math.max(0, Math.min(1, (gate.mesh.position.z + 100) / 100));
    const timerPercent = (1 - progress) * 100;
    ui.gateTimerFill.style.width = `${timerPercent}%`;
  }
  
  // 6. World Movement (moving segments, obstacles, and background)
  const zMovement = state.speed * delta;
  
  // Move road segments
  roadSegments.forEach(seg => {
    seg.mesh.position.z += zMovement;
    // Wrap segment to front if it goes past behind camera
    if (seg.mesh.position.z >= 40) {
      seg.mesh.position.z -= 40 * roadSegments.length;
    }
  });
  
  // Move parallax skyscrapers and stars slower for 3D scale effect
  environmentObjects.forEach(obj => {
    obj.position.z += zMovement * 0.25; // Parallax
    if (obj.position.z >= 80) {
      obj.position.z -= 180;
    }
  });
  
  // Move obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    obs.mesh.position.z += zMovement;
    obs.z = obs.mesh.position.z;
    
    // Clear old obstacles behind player
    if (obs.z >= 10) {
      scene.remove(obs.mesh);
      obstacles.splice(i, 1);
    }
  }
  
  // Move collectibles
  for (let i = collectibles.length - 1; i >= 0; i--) {
    const col = collectibles[i];
    col.mesh.position.z += zMovement;
    col.z = col.mesh.position.z;
    
    // Rotate items
    col.mesh.rotation.y += delta * 2;
    
    if (col.z >= 10) {
      scene.remove(col.mesh);
      collectibles.splice(i, 1);
    }
  }
  
  // Move active Cyber Gates
  for (let i = activeCyberGates.length - 1; i >= 0; i--) {
    const gate = activeCyberGates[i];
    gate.mesh.position.z += zMovement;
    gate.z = gate.mesh.position.z;
    
    if (gate.z >= 10) {
      scene.remove(gate.mesh);
      activeCyberGates.splice(i, 1);
    }
  }
  
  // 7. Check Collisions
  checkCollisions();
  
  // 8. Player trail animations
  animatePlayerTrail();
}

// --- RENDER LOOP ---
function tick() {
  requestAnimationFrame(tick);
  
  const delta = Math.min(0.1, clock.getDelta()); // Cap delta to avoid huge jumps on frame drops
  
  if (state.isPlaying && !state.isGameOver) {
    update(delta);
  }
  
  // Render
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// --- GAME STATE TRANSITIONS (PLAY, STOP, GAME OVER) ---
function startGame() {
  ui.menu.classList.remove('active');
  ui.gameOver.classList.remove('active');
  ui.hud.classList.remove('hidden');
  
  // Reset state variables
  state.isPlaying = true;
  state.isGameOver = false;
  state.distance = 0;
  state.score = 0;
  state.multiplier = 1;
  state.speed = CONFIG.baseSpeed;
  state.targetSpeed = CONFIG.baseSpeed;
  state.currentLane = 1;
  state.playerX = 0;
  state.playerY = 0;
  state.correctStreak = 0;
  state.equationsSolved = 0;
  state.overdriveCharge = 0;
  state.shieldActive = false;
  state.magnetActive = false;
  state.flyActive = false;
  state.inGatePhase = false;
  
  ui.hudNodes.textContent = state.nodes.toString().padStart(3, '0');
  ui.hudMultiplier.textContent = `x${state.multiplier}`;
  ui.overdriveFill.style.width = '0%';
  ui.gateBanner.classList.add('hidden');
  ui.driftNotif.classList.add('hidden');
  
  // Clear any existing entities
  obstacles.forEach(o => scene.remove(o.mesh));
  collectibles.forEach(c => scene.remove(c.mesh));
  activeCyberGates.forEach(g => scene.remove(g.mesh));
  
  obstacles = [];
  collectibles = [];
  activeCyberGates = [];
  
  // Reposition player
  playerMesh.position.set(0, 0, 0);
  
  // Re-build background/road
  buildCityscape();
  createPlayer();
  
  // Audio start
  sfx.startMusic();
  
  // Setup spawning timers
  setupSpawning();
}

let spawnInterval, gateSpawnInterval;
function setupSpawning() {
  if (spawnInterval) clearInterval(spawnInterval);
  if (gateSpawnInterval) clearInterval(gateSpawnInterval);
  
  // Spawn obstacles/collectible waves every 1.8 seconds
  spawnInterval = setInterval(() => {
    if (state.isPlaying && !state.isGameOver && !state.inGatePhase && !state.flyActive) {
      spawnItemWave();
    }
  }, 1800);
  
  // Spawn Math Cyber Gate every 15 seconds
  gateSpawnInterval = setInterval(() => {
    if (state.isPlaying && !state.isGameOver && !state.flyActive) {
      spawnCyberGates();
    }
  }, CONFIG.cyberGateInterval);
}

function gameOver() {
  state.isPlaying = false;
  state.isGameOver = true;
  
  if (spawnInterval) clearInterval(spawnInterval);
  if (gateSpawnInterval) clearInterval(gateSpawnInterval);
  
  sfx.stopMusic();
  sfx.playCrashSound();
  
  // Display GameOver HUD screen
  ui.hud.classList.add('hidden');
  ui.goDistance.textContent = `${Math.floor(state.distance)} m`;
  ui.goNodes.textContent = state.nodes;
  ui.goEquations.textContent = state.equationsSolved;
  
  // Save High Scores
  saveHighScore();
  
  // Reboot cost configuration
  ui.btnReboot.disabled = state.nodes < 100;
  
  ui.gameOver.classList.add('active');
}

function revivePlayer() {
  if (state.nodes < 100) return;
  
  state.nodes -= 100;
  ui.hudNodes.textContent = state.nodes.toString().padStart(3, '0');
  
  state.isPlaying = true;
  state.isGameOver = false;
  state.speed = CONFIG.baseSpeed / 1.5;
  state.targetSpeed = CONFIG.baseSpeed;
  
  // Activate shield temporarily for safety
  state.shieldActive = true;
  
  ui.gameOver.classList.remove('active');
  ui.hud.classList.remove('hidden');
  
  // Start music
  sfx.startMusic();
  
  // Re-setup spawning timers
  setupSpawning();
}

function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  renderer.setSize(width, height);
}

// --- LOCAL STORAGE & LEADERBOARD DATA SYSTEM ---
function saveHighScore() {
  const localScores = JSON.parse(localStorage.getItem('neomath_scores') || '[]');
  
  // Generate random Agent name
  const agentId = 'AGENT_' + Math.floor(1000 + Math.random() * 9000);
  
  localScores.push({
    agent: agentId,
    distance: Math.floor(state.distance),
    nodes: state.nodes,
    date: new Date().toLocaleDateString()
  });
  
  // Sort and limit to top 8 records
  localScores.sort((a, b) => b.distance - a.distance);
  localStorage.setItem('neomath_scores', JSON.stringify(localScores.slice(0, 8)));
}

function loadLeaderboard() {
  const rows = document.getElementById('leaderboard-rows');
  rows.innerHTML = '';
  
  const localScores = JSON.parse(localStorage.getItem('neomath_scores') || '[]');
  
  if (localScores.length === 0) {
    rows.innerHTML = `<tr><td colspan="4" style="text-align:center">TIDAK ADA DATA REKOR SIBER</td></tr>`;
    return;
  }
  
  localScores.forEach((item, index) => {
    const isTop = index < 3;
    const row = document.createElement('tr');
    if (isTop) row.classList.add('top-rank');
    
    row.innerHTML = `
      <td><span class="rank-badge">${index + 1}</span></td>
      <td>${item.agent}</td>
      <td>${item.distance}m</td>
      <td>${item.nodes}</td>
    `;
    rows.appendChild(row);
  });
}

// --- ARSENAL (SKINS STORE) MECHANICS ---
function loadArsenal() {
  const balanceText = document.getElementById('arsenal-balance');
  balanceText.textContent = state.nodes;
  
  const container = document.getElementById('skins-container');
  container.innerHTML = '';
  
  Object.keys(SKINS).forEach(key => {
    const skin = SKINS[key];
    const isUnlocked = state.unlockedSkins.includes(key);
    const isEquipped = state.activeSkin === key;
    
    const card = document.createElement('div');
    card.className = `skin-card ${isEquipped ? 'equipped' : ''}`;
    
    card.innerHTML = `
      <div class="skin-preview-color" style="background: rgba(${skin.color >> 16 & 255}, ${skin.color >> 8 & 255}, ${skin.color & 255}, 0.2); border: 2px solid #${skin.color.toString(16).padStart(6, '0')};">
        <div class="skin-preview-inner" style="background: #${skin.color.toString(16).padStart(6, '0')};"></div>
      </div>
      <div class="skin-name">${skin.name}</div>
      <div class="skin-price">${isUnlocked ? 'TERSEDIA' : `${skin.price} Nodes`}</div>
    `;
    
    card.addEventListener('click', () => {
      if (isUnlocked) {
        state.activeSkin = key;
        createPlayer();
        loadArsenal(); // Refresh UI
        updateMenuPlanePreview();
        localStorage.setItem('neomath_active_skin', key);
      } else {
        if (state.nodes >= skin.price) {
          state.nodes -= skin.price;
          state.unlockedSkins.push(key);
          state.activeSkin = key;
          createPlayer();
          loadArsenal();
          updateMenuPlanePreview();
          // Save skin balance
          localStorage.setItem('neomath_nodes', state.nodes);
          localStorage.setItem('neomath_unlocked_skins', JSON.stringify(state.unlockedSkins));
          localStorage.setItem('neomath_active_skin', key);
          sfx.playPowerUpSound();
        } else {
          // Play fail sweep
          sfx.playSlideSound();
        }
      }
    });
    
    container.appendChild(card);
  });
}

// --- DAILY CONTRACTS MANAGEMENT ---
function loadContracts() {
  const container = document.getElementById('contracts-container');
  container.innerHTML = '';
  
  state.contracts.forEach(contract => {
    const card = document.createElement('div');
    card.className = `contract-card ${contract.done ? 'completed' : ''}`;
    
    card.innerHTML = `
      <div class="contract-info">
        <div class="contract-title">${contract.desc}</div>
        <div class="contract-reward">REWARD: +${contract.reward} Nodes</div>
      </div>
      <div class="contract-status-badge">
        ${contract.done ? 'CLAIMED' : `${contract.current} / ${contract.target}`}
      </div>
    `;
    
    container.appendChild(card);
  });
}

function updateContractProgress(id, count) {
  const contract = state.contracts.find(c => c.id === id);
  if (!contract || contract.done) return;
  
  if (id === 3) {
    // Distance targets set directly
    contract.current = Math.max(contract.current, count);
  } else {
    // Additive
    contract.current += count;
  }
  
  if (contract.current >= contract.target) {
    contract.current = contract.target;
    contract.done = true;
    // Add reward nodes
    state.nodes += contract.reward;
    localStorage.setItem('neomath_nodes', state.nodes);
  }
}

// --- SCREEN NAVIGATION ROUTER ---
function setupNavigation() {
  // Main Menu start run
  document.getElementById('btn-start').addEventListener('click', () => {
    sfx.init(); // Initialize audio context on first human click
    startGame();
  });
  
  // Arsenal open
  document.getElementById('btn-arsenal').addEventListener('click', () => {
    sfx.init();
    loadArsenal();
    document.getElementById('arsenal-menu').classList.add('active');
  });
  document.getElementById('btn-arsenal-back').addEventListener('click', () => {
    document.getElementById('arsenal-menu').classList.remove('active');
  });
  
  // Leaderboards open
  document.getElementById('btn-leaderboard').addEventListener('click', () => {
    sfx.init();
    loadLeaderboard();
    document.getElementById('leaderboard-menu').classList.add('active');
  });
  document.getElementById('btn-leaderboard-back').addEventListener('click', () => {
    document.getElementById('leaderboard-menu').classList.remove('active');
  });
  
  // Daily contracts open
  document.getElementById('btn-contracts').addEventListener('click', () => {
    sfx.init();
    loadContracts();
    document.getElementById('contracts-menu').classList.add('active');
  });
  document.getElementById('btn-contracts-back').addEventListener('click', () => {
    document.getElementById('contracts-menu').classList.remove('active');
  });
  
  // Revive / GameOver
  ui.btnReboot.addEventListener('click', () => {
    revivePlayer();
  });
  document.getElementById('btn-abandon').addEventListener('click', () => {
    ui.gameOver.classList.remove('active');
    ui.menu.classList.add('active');
  });
  
  // Music Audio Toggle
  ui.btnToggleAudio.addEventListener('click', () => {
    state.audioEnabled = !state.audioEnabled;
    if (state.audioEnabled) {
      ui.btnToggleAudio.style.color = '#00f3ff';
      sfx.startMusic();
    } else {
      ui.btnToggleAudio.style.color = '#555555';
      sfx.stopMusic();
    }
  });

  // Local storage cache load
  if (localStorage.getItem('neomath_nodes')) {
    state.nodes = parseInt(localStorage.getItem('neomath_nodes'));
  }
  if (localStorage.getItem('neomath_unlocked_skins')) {
    state.unlockedSkins = JSON.parse(localStorage.getItem('neomath_unlocked_skins'));
  }
  if (localStorage.getItem('neomath_active_skin')) {
    state.activeSkin = localStorage.getItem('neomath_active_skin');
  }
  updateMenuPlanePreview();
}

function updateMenuPlanePreview() {
  const skinNameEl = document.getElementById('plane-skin-name');
  if (skinNameEl) {
    const skin = SKINS[state.activeSkin] || SKINS.cyan;
    skinNameEl.textContent = skin.name.toUpperCase();
    skinNameEl.style.color = `#${skin.color.toString(16).padStart(6, '0')}`;
  }
}

// --- GLOBAL RUN ENTRY POINT ---
window.onload = () => {
  initThree();
  setupNavigation();
  tick(); // Start Three.js frame render loop
};
