import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// Utility function for generating unique IDs
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// LEDScreen Class - Manages the LED screen with its textures and properties
class LEDScreen {
  constructor(mesh, materialName = "M_WhiteScreen", app = null) {
    this.mesh = mesh;
    this.materialName = materialName;
    this.material = null;
    this.originalBaseColorTexture = null;
    this.originalEmissiveTexture = null;
    this.originalEmissiveIntensity = 1;
    this.currentTexture = null;
    this.brightness = 1.0;
    this.aspectRatio = 10 / 3;
    this.app = app; // Reference to main app for global state
    
    this.findTargetMaterial();
    this.applyGlobalState();
  }
  
  findTargetMaterial() {
    if (!this.mesh) return;
    
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((mat) => {
          if (mat.name === this.materialName) {
            this.material = mat;
            this.originalBaseColorTexture = mat.map;
            this.originalEmissiveTexture = mat.emissiveMap;
            this.originalEmissiveIntensity = mat.emissiveIntensity || 1;
            this.brightness = this.originalEmissiveIntensity;
            
            console.log('Found LED screen material:', this.materialName, 'on mesh:', child.name || 'unnamed');
            console.log('Original texture:', this.originalBaseColorTexture);
            console.log('Original emissive texture:', this.originalEmissiveTexture);
          }
        });
      }
    });
    
    if (!this.material) {
      console.warn('LED screen material not found:', this.materialName);
      this.logAvailableMaterials();
    }
  }
  
  logAvailableMaterials() {
    console.log('Available materials:');
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat, index) => {
          console.log(`- ${mat.name || 'Unnamed'} (${child.name || 'Unnamed mesh'}_${index})`);
        });
      }
    });
  }
  
  applyGlobalState() {
    if (!this.material || !this.app) return;
    
    // Apply global brightness (always apply brightness)
    if (this.app.globalBrightness !== null && this.app.globalBrightness !== undefined) {
      this.material.emissiveIntensity = this.app.globalBrightness;
      this.brightness = this.app.globalBrightness;
    }
    
    // Apply global custom texture if it exists
    if (this.app.globalCustomTexture) {
      this.material.map = this.app.globalCustomTexture;
      this.material.emissiveMap = this.app.globalCustomEmissiveTexture;
      this.currentTexture = this.app.globalCustomTexture;
      console.log('Applied global custom texture to new studio');
    }
    
    this.material.needsUpdate = true;
  }

  setCustomTexture(file, callback) {
    if (!this.material) {
      console.warn('No material found to apply texture');
      return;
    }
    
    this.cropImageTo10x3(file, (croppedDataUrl) => {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(croppedDataUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.flipY = false;
        
        // Mark as custom texture for persistence across studio changes
        texture.userData = texture.userData || {};
        texture.userData.isCustomTexture = true;
        
        this.material.map = texture;
        this.material.emissiveMap = texture;
        this.material.needsUpdate = true;
        this.currentTexture = texture;
        
        // Store in global state for persistence across studio changes
        if (this.app) {
          this.app.globalCustomTexture = texture;
          this.app.globalCustomEmissiveTexture = texture;
        }
        
        console.log('Custom texture applied to LED screen and stored globally');
        if (callback) callback();
      });
    });
  }
  
  setBrightness(intensity) {
    if (!this.material) return;
    
    this.brightness = intensity;
    this.material.emissiveIntensity = intensity;
    this.material.needsUpdate = true;
    
    // Update global brightness
    if (this.app) {
      this.app.globalBrightness = intensity;
    }
  }
  
  resetToOriginal() {
    if (!this.material) return;
    
    this.material.map = this.originalBaseColorTexture;
    this.material.emissiveMap = this.originalEmissiveTexture;
    this.material.emissiveIntensity = this.originalEmissiveIntensity;
    this.material.needsUpdate = true;
    
    this.brightness = this.originalEmissiveIntensity;
    this.currentTexture = null;
    
    // Clear global custom texture state
    if (this.app) {
      this.app.globalCustomTexture = null;
      this.app.globalCustomEmissiveTexture = null;
      this.app.globalBrightness = this.originalEmissiveIntensity;
    }
    
    console.log('LED screen reset to original');
  }
  
  cropImageTo10x3(file, callback) {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      const targetAspectRatio = this.aspectRatio;
      const sourceAspectRatio = img.width / img.height;
      
      let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height;
      
      if (sourceAspectRatio > targetAspectRatio) {
        sourceWidth = img.height * targetAspectRatio;
        sourceX = (img.width - sourceWidth) / 2;
      } else {
        sourceHeight = img.width / targetAspectRatio;
        sourceY = (img.height - sourceHeight) / 2;
      }
      
      const outputWidth = Math.min(3600, sourceWidth);
      const outputHeight = outputWidth / targetAspectRatio;
      
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      
      ctx.drawImage(
        img,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, outputWidth, outputHeight
      );
      
      callback(canvas.toDataURL('image/png'));
    };
    
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

// SceneObject Class - Manages placed 3D models in the scene
class SceneObject {
  constructor(mesh, name = 'Object') {
    this.mesh = mesh;
    this.name = name;
    this.id = generateUniqueId();
    this.isSelected = false;
    this.originalMaterials = new Map();
    
    this.transform = {
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      scale: mesh.scale.clone()
    };
    
    this.storeOriginalMaterials();
  }
  
  storeOriginalMaterials() {
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!child.userData.originalEmissive) {
          child.userData.originalEmissive = child.material.emissive ? 
            child.material.emissive.clone() : new THREE.Color(0x000000);
          child.userData.originalEmissiveIntensity = child.material.emissiveIntensity || 0;
        }
      }
    });
  }
  
  select() {
    if (this.isSelected) return;
    
    this.isSelected = true;
    
    // Add visual highlight
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        if (child.material.emissive) {
          child.material.emissive.setHex(0x333333);
          child.material.emissiveIntensity = 0.3;
        }
        child.material.needsUpdate = true;
      }
    });
    
    console.log('SceneObject selected:', this.name);
  }
  
  deselect() {
    if (!this.isSelected) return;
    
    this.isSelected = false;
    
    // Remove visual highlight
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material && child.userData.originalEmissive) {
        child.material.emissive.copy(child.userData.originalEmissive);
        child.material.emissiveIntensity = child.userData.originalEmissiveIntensity;
        child.material.needsUpdate = true;
      }
    });
    
    console.log('SceneObject deselected:', this.name);
  }
  
  updateTransform() {
    this.transform.position.copy(this.mesh.position);
    this.transform.rotation.copy(this.mesh.rotation);
    this.transform.scale.copy(this.mesh.scale);
  }
  
  delete() {
    // Dispose of geometry and materials
    this.mesh.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => {
              this.disposeMaterial(material);
            });
          } else {
            this.disposeMaterial(child.material);
          }
        }
      }
    });
    
    console.log('SceneObject deleted and memory freed:', this.name);
  }
  
  disposeMaterial(material) {
    if (material.map) material.map.dispose();
    if (material.normalMap) material.normalMap.dispose();
    if (material.emissiveMap) material.emissiveMap.dispose();
    material.dispose();
  }
}

// CinemaCamera Class - Manages cinema cameras with preview functionality
class CinemaCamera {
  constructor(name, scene) {
    this.name = name;
    this.id = generateUniqueId();
    this.scene = scene;
    this.isSelected = false;
    
    // Create camera
    this.camera = new THREE.PerspectiveCamera(75, 16/9, 0.1, 1000);
    
    // Camera settings
    this.focalLength = 50;
    this.sensorSize = 24;
    
    // Create visual representation
    this.createVisualRepresentation();
    this.createHelper();
    this.updateCameraSettings();
    
    // Initial positioning
    this.group.position.set(0, 1.7, -5);
    this.group.lookAt(0, 0, 0);
  }
  
  createVisualRepresentation() {
    // Create camera group
    this.group = new THREE.Group();
    
    // Create camera mesh
    const cameraGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.4);
    const cameraMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff8800,
      emissive: 0x442200,
      emissiveIntensity: 0.3
    });
    this.mesh = new THREE.Mesh(cameraGeometry, cameraMaterial);
    
    // Position camera object
    this.camera.position.set(0, 0, 0.2);
    this.camera.rotation.y = Math.PI;
    
    // Add to group
    this.group.add(this.camera);
    this.group.add(this.mesh);
  }
  
  createHelper() {
    this.helper = new THREE.CameraHelper(this.camera);
    this.helper.visible = false;
  }
  
  addToScene() {
    this.scene.add(this.group);
    this.scene.add(this.helper);
  }
  
  removeFromScene() {
    this.scene.remove(this.group);
    this.scene.remove(this.helper);
  }
  
  select() {
    if (this.isSelected) return;
    
    this.isSelected = true;
    this.helper.visible = true;
    
    // Highlight mesh
    this.mesh.material.emissive.setHex(0x884400);
    this.mesh.material.emissiveIntensity = 0.6;
    
    console.log('CinemaCamera selected:', this.name);
  }
  
  deselect() {
    if (!this.isSelected) return;
    
    this.isSelected = false;
    this.helper.visible = false;
    
    // Remove highlight
    this.mesh.material.emissive.setHex(0x442200);
    this.mesh.material.emissiveIntensity = 0.3;
    
    console.log('CinemaCamera deselected:', this.name);
  }
  
  setFocalLength(length) {
    this.focalLength = length;
    this.updateCameraSettings();
  }
  
  setSensorSize(size) {
    this.sensorSize = size;
    this.updateCameraSettings();
  }
  
  updateCameraSettings() {
    const fov = 2 * Math.atan(this.sensorSize / (2 * this.focalLength)) * 180 / Math.PI;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    
    if (this.helper) {
      this.helper.update();
      this.helper.updateMatrixWorld(true);
    }
  }
  
  capture(app) {
    // Create temporary high-resolution renderer
    const captureRenderer = new THREE.WebGLRenderer({ 
      antialias: true,
      preserveDrawingBuffer: true 
    });
    captureRenderer.setSize(1920, 1080);
    captureRenderer.setClearColor(0x000000);
    captureRenderer.shadowMap.enabled = true;
    captureRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Store and hide camera visuals
    const originalVisibilities = app.hideCameraVisualsForCapture();
    
    // Render and download
    captureRenderer.render(this.scene, this.camera);
    
    const canvas = captureRenderer.domElement;
    const link = document.createElement('a');
    link.download = `${this.name}_capture.png`;
    link.href = canvas.toDataURL();
    link.click();
    
    // Restore visibilities and cleanup
    app.restoreCameraVisualsAfterCapture(originalVisibilities);
    captureRenderer.dispose();
    
    console.log('Camera view captured:', this.name);
  }
  
  delete() {
    this.removeFromScene();
    
    // Dispose of resources
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.helper.dispose();
    
    console.log('CinemaCamera deleted:', this.name);
  }
}

// LEDStudioManager Class - Manages different LED studio environments
class LEDStudioManager {
  constructor(scene) {
    this.scene = scene;
    this.studioPath = 'public/LED_Studio/';
    this.availableStudios = [];
    this.currentStudio = null;
    this.currentStudioMesh = null;
    this.isLoaded = false;
  }
  
  async loadAvailableStudios() {
    try {
      // Define known studios based on folder structure
      const knownStudios = [
        { name: 'MADRID_15X5', displayName: 'Madrid 15x5', gltfFile: 'LED_Studio_Madrid.gltf' },
        { name: 'BARCELONA', displayName: 'Barcelona', gltfFile: 'LED_Studio_Barcelona.gltf' }
      ];
      
      this.availableStudios = [];
      
      for (const studio of knownStudios) {
        const studioData = await this.loadStudioData(studio);
        if (studioData) {
          this.availableStudios.push(studioData);
        }
      }
      
      this.isLoaded = true;
      console.log('LED Studios loaded:', this.availableStudios);
      return this.availableStudios;
      
    } catch (error) {
      console.error('Error loading LED studios:', error);
      return [];
    }
  }
  
  async loadStudioData(studioInfo) {
    try {
      const studioPath = `${this.studioPath}${studioInfo.name}/${studioInfo.gltfFile}`;
      
      // Check if studio file exists
      const exists = await this.checkFileExists(studioPath);
      
      if (exists) {
        return {
          name: studioInfo.name,
          displayName: studioInfo.displayName,
          gltfPath: studioPath,
          folderPath: `${this.studioPath}${studioInfo.name}/`
        };
      }
      
      return null;
      
    } catch (error) {
      console.warn(`Could not load studio data for ${studioInfo.name}:`, error);
      return null;
    }
  }
  
  async checkFileExists(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  
  getStudios() {
    return this.availableStudios;
  }
  
  getStudioByName(name) {
    return this.availableStudios.find(studio => studio.name === name);
  }
  
  getCurrentStudio() {
    return this.currentStudio;
  }
  
  async switchStudio(studioName, preserveScreenState = true) {
    const studio = this.getStudioByName(studioName);
    if (!studio) {
      console.error('Studio not found:', studioName);
      return false;
    }
    
    console.log('Switching to studio:', studio.displayName);
    
    try {
      // Store current screen state if preserving
      let screenState = null;
      if (preserveScreenState && this.currentStudioMesh) {
        screenState = this.extractScreenState(this.currentStudioMesh);
      }
      
      // Remove current studio mesh if exists
      if (this.currentStudioMesh) {
        this.scene.remove(this.currentStudioMesh);
        this.disposeStudioMesh(this.currentStudioMesh);
      }
      
      // Load new studio
      const newStudioMesh = await this.loadStudioMesh(studio);
      if (!newStudioMesh) {
        throw new Error(`Failed to load studio: ${studio.displayName}`);
      }
      
      // Add to scene
      this.scene.add(newStudioMesh);
      this.currentStudioMesh = newStudioMesh;
      this.currentStudio = studio;
      
      // Restore screen state if preserved
      if (preserveScreenState && screenState) {
        await this.applyScreenState(newStudioMesh, screenState);
      }
      
      console.log('Successfully switched to studio:', studio.displayName);
      return { success: true, mesh: newStudioMesh, screenState };
      
    } catch (error) {
      console.error('Error switching studio:', error);
      return false;
    }
  }
  
  loadStudioMesh(studio) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(studio.gltfPath, (gltf) => {
        const mesh = gltf.scene;
        
        // Configure mesh
        mesh.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
          }
        });
        
        mesh.position.set(0, 0, 0);
        resolve(mesh);
        
      }, (xhr) => {
        if (xhr.lengthComputable) {
          const percentComplete = xhr.loaded / xhr.total * 100;
          console.log(`Loading studio: ${percentComplete.toFixed(1)}%`);
        }
      }, (error) => {
        reject(error);
      });
    });
  }
  
  extractScreenState(studioMesh) {
    const screenState = {
      currentTexture: null,
      emissiveTexture: null,
      emissiveIntensity: null,
      baseColorTexture: null,
      hasCustomTexture: false
    };
    
    // Find the screen material (assuming same material name pattern)
    studioMesh.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((material) => {
          if (material.name === "M_WhiteScreen") {
            screenState.currentTexture = material.map;
            screenState.emissiveTexture = material.emissiveMap;
            screenState.emissiveIntensity = material.emissiveIntensity;
            screenState.baseColorTexture = material.map;
            
            // Check if this is a custom texture (not the original studio texture)
            // We'll identify custom textures by checking if they have a data URL or custom properties
            if (material.map && (material.map.userData?.isCustomTexture || 
                material.map.image?.src?.startsWith('data:'))) {
              screenState.hasCustomTexture = true;
            }
          }
        });
      }
    });
    
    return screenState;
  }
  
  applyScreenState(newStudioMesh, screenState) {
    return new Promise((resolve) => {
      // Find the screen material in new studio
      newStudioMesh.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          
          materials.forEach((material) => {
            if (material.name === "M_WhiteScreen") {
              // Always apply brightness setting
              if (screenState.emissiveIntensity !== null && screenState.emissiveIntensity !== undefined) {
                material.emissiveIntensity = screenState.emissiveIntensity;
              }
              
              // Apply custom texture if one exists
              if (screenState.hasCustomTexture && screenState.currentTexture) {
                material.map = screenState.currentTexture;
                material.emissiveMap = screenState.emissiveTexture;
                console.log('Applied custom texture to new studio');
              }
              
              material.needsUpdate = true;
            }
          });
        }
      });
      
      resolve();
    });
  }
  
  disposeStudioMesh(mesh) {
    mesh.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => {
              // Don't dispose textures that might be reused (screen textures)
              if (material.name !== "M_WhiteScreen") {
                if (material.map) material.map.dispose();
                if (material.normalMap) material.normalMap.dispose();
                if (material.emissiveMap) material.emissiveMap.dispose();
              }
              material.dispose();
            });
          } else {
            // Don't dispose textures that might be reused (screen textures)
            if (child.material.name !== "M_WhiteScreen") {
              if (child.material.map) child.material.map.dispose();
              if (child.material.normalMap) child.material.normalMap.dispose();
              if (child.material.emissiveMap) child.material.emissiveMap.dispose();
            }
            child.material.dispose();
          }
        }
      }
    });
  }
}

// PropsLibrary Class - Manages the props library system
class PropsLibrary {
  constructor() {
    this.propsPath = 'public/props/';
    this.availableProps = [];
    this.isLoaded = false;
  }
  
  async loadPropsLibrary() {
    try {
      // Since we can't directly list directory contents in a browser,
      // we'll define the known props and try to load them
      const knownProps = ['car', 'woman-sport'];
      
      this.availableProps = [];
      
      for (const propName of knownProps) {
        const propData = await this.loadPropData(propName);
        if (propData) {
          this.availableProps.push(propData);
        }
      }
      
      this.isLoaded = true;
      console.log('Props library loaded:', this.availableProps);
      return this.availableProps;
      
    } catch (error) {
      console.error('Error loading props library:', error);
      return [];
    }
  }
  
  async loadPropData(propName) {
    try {
      const basePath = `${this.propsPath}${propName}/`;
      const glbPath = `${basePath}${propName}.glb`;
      const thumbnailPath = `${basePath}${propName}_thumbnail.png`;
      
      // Check if files exist by attempting to load thumbnail
      const thumbnailExists = await this.checkFileExists(thumbnailPath);
      const glbExists = await this.checkFileExists(glbPath);
      
      if (thumbnailExists && glbExists) {
        return {
          name: propName,
          displayName: this.formatDisplayName(propName),
          glbPath: glbPath,
          thumbnailPath: thumbnailPath
        };
      }
      
      return null;
      
    } catch (error) {
      console.warn(`Could not load prop data for ${propName}:`, error);
      return null;
    }
  }
  
  async checkFileExists(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  
  formatDisplayName(propName) {
    return propName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  getProps() {
    return this.availableProps;
  }
  
  getPropByName(name) {
    return this.availableProps.find(prop => prop.name === name);
  }
}

// Main Application Class
class LEDStageApp {
  constructor() {
    // Core Three.js components
    this.scene = new THREE.Scene();
    this.renderer = null;
    this.mainCamera = null;
    this.controls = null;
    this.transformControls = null;
    
    // Systems
    this.ledScreen = null;
    this.studioManager = new LEDStudioManager(this.scene);
    this.propsLibrary = new PropsLibrary();
    this.sceneObjects = new Map(); // id -> SceneObject
    this.cinemaCameras = new Map(); // id -> CinemaCamera
    this.selectedObject = null; // Can be SceneObject or CinemaCamera
    this.cameraCounter = 1;
    
    // Global custom texture state
    this.globalCustomTexture = null;
    this.globalCustomEmissiveTexture = null;
    this.globalBrightness = 1.0;
    
    // Interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.transformSpace = 'world';
    
    // Preview system
    this.cameraPreviewRenderer = null;
    this.isFullscreen = false;
    this.pinnedCamera = null; // Track which camera preview is pinned
    
    // Initialize the application
    this.init();
  }
  
  init() {
    this.setupRenderer();
    this.setupCamera();
    this.setupControls();
    this.setupLighting();
    this.setupEventListeners();
    this.initializeStudioManager();
    this.initializePropsLibrary();
    this.initializeCustomDropdown();
    this.animate();
  }
  
  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    document.body.appendChild(this.renderer.domElement);
  }
  
  setupCamera() {
    this.mainCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
    this.mainCamera.position.set(-10, 7, -15);
  }
  
  setupControls() {
    this.controls = new OrbitControls(this.mainCamera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 30;
    this.controls.minPolarAngle = -0.5;
    this.controls.maxPolarAngle = 1.5;
    this.controls.autoRotate = false;
    this.controls.target = new THREE.Vector3(0, 2, 0);
    this.controls.update();
    
    // Transform controls
    this.transformControls = new TransformControls(this.mainCamera, this.renderer.domElement);
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
    });
    this.scene.add(this.transformControls);
  }
  
  setupLighting() {
    const spotLight = new THREE.SpotLight(0xffffff, 10000, 100, 0.4, 1.2);
    spotLight.position.set(0, 25, 0);
    spotLight.castShadow = true;
    spotLight.shadow.bias = -0.0001;
    this.scene.add(spotLight);
    
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.5);
    this.scene.add(ambientLight);
  }
  
  setupEventListeners() {
    this.renderer.domElement.addEventListener('click', (event) => this.onMouseClick(event), false);
    window.addEventListener('resize', () => this.onWindowResize(), false);
    document.addEventListener('keydown', (event) => this.onKeyDown(event), false);
  }
  
  // Initialize studio manager and load available studios
  async initializeStudioManager() {
    try {
      // Load available studios
      await this.studioManager.loadAvailableStudios();
      
      // Populate studio dropdown
      this.populateStudioDropdown();
      
      // Load default studio (Madrid)
      const defaultStudio = 'MADRID_15X5';
      const result = await this.studioManager.switchStudio(defaultStudio, false);
      
      if (result && result.success) {
        // Create LED screen system with the loaded studio mesh
        this.ledScreen = new LEDScreen(result.mesh, "M_WhiteScreen", this);
        
        // Initialize global brightness from the original studio texture
        this.globalBrightness = this.ledScreen.originalEmissiveIntensity;
        
        // Update dropdown selection
        document.getElementById('studio-dropdown').value = defaultStudio;
        
        console.log('Default studio loaded successfully');
      }
      
      // Hide loading screen
      document.getElementById('progress-container').style.display = 'none';
      
    } catch (error) {
      console.error('Error initializing studio manager:', error);
      document.getElementById('progress-container').style.display = 'none';
    }
  }
  
  // Populate studio dropdown
  populateStudioDropdown() {
    const dropdown = document.getElementById('studio-dropdown');
    const studios = this.studioManager.getStudios();
    
    // Clear existing options
    dropdown.innerHTML = '';
    
    if (studios.length === 0) {
      dropdown.innerHTML = '<option value="">No studios available</option>';
      return;
    }
    
    // Add studio options
    studios.forEach(studio => {
      const option = document.createElement('option');
      option.value = studio.name;
      option.textContent = studio.displayName;
      dropdown.appendChild(option);
    });
    
    console.log('Studio dropdown populated with', studios.length, 'studios');
  }
  
  // Handle studio change
  async onStudioChange(studioName) {
    if (!studioName) return;
    
    console.log('Changing studio to:', studioName);
    
    try {
      // Store current screen state before switching
      let currentBrightness = this.globalBrightness;
      let hasCustomTexture = this.globalCustomTexture !== null;
      
      // Switch studio without preserving screen state (we'll handle it manually)
      const result = await this.studioManager.switchStudio(studioName, false);
      
      if (result && result.success) {
        // Create new LED screen system to use new studio mesh
        this.ledScreen = new LEDScreen(result.mesh, "M_WhiteScreen", this);
        
        // Apply global texture state if we have custom texture
        if (hasCustomTexture && this.globalCustomTexture) {
          this.ledScreen.material.map = this.globalCustomTexture;
          this.ledScreen.material.emissiveMap = this.globalCustomEmissiveTexture;
          this.ledScreen.currentTexture = this.globalCustomTexture;
          this.ledScreen.material.needsUpdate = true;
          console.log('Applied global custom texture to new studio');
        }
        
        // Apply brightness setting
        this.ledScreen.setBrightness(currentBrightness);
        
        // Update UI controls to reflect current brightness
        const emissiveSlider = document.getElementById('emissive-slider');
        const emissiveValue = document.getElementById('emissive-value');
        emissiveSlider.value = currentBrightness;
        emissiveValue.textContent = currentBrightness.toFixed(1);
        
        console.log('Studio changed successfully to:', studioName);
      } else {
        console.error('Failed to change studio');
      }
    } catch (error) {
      console.error('Error changing studio:', error);
    }
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.mainCamera);
    
    // Update camera preview if active (either selected camera or pinned camera)
    if (this.cameraPreviewRenderer && 
        ((this.selectedObject instanceof CinemaCamera) || this.pinnedCamera)) {
      this.renderCameraPreview();
    }
  }
  
  onMouseClick(event) {
    // Calculate mouse position
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Cast ray
    this.raycaster.setFromCamera(this.mouse, this.mainCamera);
    
    // Create array of selectable objects
    const selectableObjects = [];
    
    // Add scene objects
    this.sceneObjects.forEach(obj => selectableObjects.push(obj.mesh));
    
    // Add camera meshes
    this.cinemaCameras.forEach(cam => selectableObjects.push(cam.mesh));
    
    // Check intersections
    const intersects = this.raycaster.intersectObjects(selectableObjects, true);
    
    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      
      // Find which object was clicked
      let targetObject = null;
      
      // Check cameras first
      for (let camera of this.cinemaCameras.values()) {
        if (camera.mesh === clickedObject) {
          targetObject = camera;
          break;
        }
      }
      
      // Check scene objects if no camera was found
      if (!targetObject) {
        for (let sceneObj of this.sceneObjects.values()) {
          if (this.isChildOf(clickedObject, sceneObj.mesh)) {
            targetObject = sceneObj;
            break;
          }
        }
      }
      
      if (targetObject) {
        this.selectObject(targetObject);
        return;
      }
    }
    
    // Clicked on empty space
    this.deselectAll();
  }
  
  isChildOf(child, parent) {
    let current = child;
    while (current.parent) {
      if (current.parent === parent) return true;
      current = current.parent;
    }
    return current === parent;
  }
  
  selectObject(object) {
    if (this.selectedObject === object) return;
    
    // Deselect previous
    if (this.selectedObject) {
      this.selectedObject.deselect();
    }
    
    // Select new object
    this.selectedObject = object;
    object.select();
    
    // Attach transform controls
    if (object instanceof SceneObject) {
      this.transformControls.attach(object.mesh);
      this.transformControls.setMode('translate');
      this.showModelControls();
    } else if (object instanceof CinemaCamera) {
      this.transformControls.attach(object.group);
      this.transformControls.setMode('translate');
      this.showCameraControls();
      this.showCameraPreview();
    }
    
    this.updateTransformSpace();
  }
  
  deselectAll() {
    if (this.selectedObject) {
      this.selectedObject.deselect();
      this.selectedObject = null;
    }
    
    this.transformControls.detach();
    this.hideAllControlPanels();
  }
  
  showModelControls() {
    document.getElementById('model-controls').style.display = 'block';
    document.getElementById('camera-controls-panel').style.display = 'none';
    
    // Only hide camera viewport if no camera is pinned
    if (!this.pinnedCamera) {
      document.getElementById('camera-viewport').style.display = 'none';
    }
  }
  
  showCameraControls() {
    document.getElementById('camera-controls-panel').style.display = 'block';
    document.getElementById('model-controls').style.display = 'none';
    
    // Update pin button state
    this.updatePinButtonState();
  }
  
  hideAllControlPanels() {
    document.getElementById('model-controls').style.display = 'none';
    document.getElementById('camera-controls-panel').style.display = 'none';
    
    // Only hide camera viewport if it's not pinned
    if (!this.pinnedCamera) {
      document.getElementById('camera-viewport').style.display = 'none';
    }
  }
  
  showCameraPreview() {
    if (!this.selectedObject || !(this.selectedObject instanceof CinemaCamera)) return;
    
    document.getElementById('camera-viewport').style.display = 'block';
    
    if (!this.cameraPreviewRenderer) {
      this.cameraPreviewRenderer = new THREE.WebGLRenderer({ antialias: true });
      this.cameraPreviewRenderer.setSize(320, 180);
      this.cameraPreviewRenderer.setClearColor(0x000000);
      this.cameraPreviewRenderer.shadowMap.enabled = true;
      this.cameraPreviewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      document.getElementById('viewport-container').appendChild(this.cameraPreviewRenderer.domElement);
    }
    
    this.renderCameraPreview();
  }
  
  renderCameraPreview() {
    // Render from pinned camera if available, otherwise from selected camera
    const cameraToRender = this.pinnedCamera || this.selectedObject;
    
    if (!cameraToRender || !(cameraToRender instanceof CinemaCamera) || !this.cameraPreviewRenderer) {
      return;
    }
    
    // Hide camera visuals temporarily
    const originalVisibilities = [];
    this.cinemaCameras.forEach(cam => {
      originalVisibilities.push({
        helper: cam.helper.visible,
        mesh: cam.mesh.visible
      });
      cam.helper.visible = false;
      cam.mesh.visible = false;
    });
    
    const transformControlsVisible = this.transformControls.visible;
    this.transformControls.visible = false;
    
    // Render preview
    this.cameraPreviewRenderer.render(this.scene, cameraToRender.camera);
    
    // Restore visibilities
    this.transformControls.visible = transformControlsVisible;
    let index = 0;
    this.cinemaCameras.forEach(cam => {
      if (originalVisibilities[index]) {
        cam.helper.visible = originalVisibilities[index].helper;
        cam.mesh.visible = originalVisibilities[index].mesh;
      }
      index++;
    });
  }
  
  pinCameraPreview() {
    if (this.selectedObject && this.selectedObject instanceof CinemaCamera) {
      this.pinnedCamera = this.selectedObject;
      console.log('Camera preview pinned:', this.pinnedCamera.name);
      this.updatePinButtonState();
    }
  }
  
  unpinCameraPreview() {
    if (this.pinnedCamera) {
      console.log('Camera preview unpinned:', this.pinnedCamera.name);
      this.pinnedCamera = null;
      this.updatePinButtonState();
      
      // If no camera is currently selected, hide the preview
      if (!this.selectedObject || !(this.selectedObject instanceof CinemaCamera)) {
        document.getElementById('camera-viewport').style.display = 'none';
      }
    }
  }
  
  togglePinCameraPreview() {
    if (this.pinnedCamera) {
      this.unpinCameraPreview();
    } else {
      this.pinCameraPreview();
    }
  }
  
  updatePinButtonState() {
    const pinBtn = document.getElementById('pin-preview-btn');
    const isPinned = this.pinnedCamera && this.selectedObject && this.pinnedCamera === this.selectedObject;
    
    if (isPinned) {
      pinBtn.classList.add('pinned');
      pinBtn.title = 'Unpin Preview';
      pinBtn.innerHTML = '<i data-lucide="pin"></i>';
    } else {
      pinBtn.classList.remove('pinned');
      pinBtn.title = 'Pin Preview';
      pinBtn.innerHTML = '<i data-lucide="pin"></i>';
    }
    
    // Update Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
  
  updateTransformSpace() {
    const space = this.transformSpace;
    this.transformControls.setSpace(space);
    
    // Update UI buttons based on selected object type
    if (this.selectedObject instanceof SceneObject) {
      this.updateSpaceButtons('model', space);
    } else if (this.selectedObject instanceof CinemaCamera) {
      this.updateSpaceButtons('camera', space);
    }
  }
  
  updateSpaceButtons(type, space) {
    const worldBtn = document.getElementById(`${type}-world-btn`);
    const localBtn = document.getElementById(`${type}-local-btn`);
    
    if (space === 'world') {
      worldBtn.classList.add('active');
      localBtn.classList.remove('active');
    } else {
      worldBtn.classList.remove('active');
      localBtn.classList.add('active');
    }
  }
  
  onKeyDown(event) {
    if (event.key === 'Escape') {
      if (this.isFullscreen) {
        this.exitFullscreen();
      } else {
        this.deselectAll();
      }
      return;
    }
    
    if (!this.selectedObject) return;
    
    const key = event.key.toLowerCase();
    
    // Common shortcuts for both models and cameras
    switch (key) {
      case 'delete':
      case 'backspace':
        this.deleteSelectedObject();
        break;
      case 'g':
        this.transformControls.setMode('translate');
        this.updateControlButtons('translate');
        break;
      case 'r':
        this.transformControls.setMode('rotate');
        this.updateControlButtons('rotate');
        break;
      case 'x':
        this.toggleTransformSpace();
        break;
    }
    
    // Model-specific shortcuts
    if (this.selectedObject instanceof SceneObject) {
      switch (key) {
        case 's':
          this.transformControls.setMode('scale');
          this.updateControlButtons('scale');
          break;
      }
    }
    
    // Camera-specific shortcuts
    if (this.selectedObject instanceof CinemaCamera) {
      switch (key) {
        case 'f':
          this.enterFullscreen();
          break;
        case 'c':
          this.selectedObject.capture(this);
          break;
      }
    }
  }
  
  updateControlButtons(mode) {
    if (this.selectedObject instanceof SceneObject) {
      this.updateModelControlButtons(mode);
    } else if (this.selectedObject instanceof CinemaCamera) {
      this.updateCameraControlButtons(mode);
    }
  }
  
  updateModelControlButtons(activeMode) {
    const buttons = ['move-mode-btn', 'rotate-mode-btn', 'scale-mode-btn'];
    buttons.forEach(id => document.getElementById(id).classList.remove('active'));
    
    switch(activeMode) {
      case 'translate':
        document.getElementById('move-mode-btn').classList.add('active');
        break;
      case 'rotate':
        document.getElementById('rotate-mode-btn').classList.add('active');
        break;
      case 'scale':
        document.getElementById('scale-mode-btn').classList.add('active');
        break;
    }
  }
  
  updateCameraControlButtons(activeMode) {
    const buttons = ['camera-move-btn', 'camera-rotate-btn'];
    buttons.forEach(id => document.getElementById(id).classList.remove('active'));
    
    switch(activeMode) {
      case 'translate':
        document.getElementById('camera-move-btn').classList.add('active');
        break;
      case 'rotate':
        document.getElementById('camera-rotate-btn').classList.add('active');
        break;
    }
  }
  
  toggleTransformSpace() {
    this.transformSpace = this.transformSpace === 'world' ? 'local' : 'world';
    this.updateTransformSpace();
    console.log('Transform space:', this.transformSpace);
  }
  
  deleteSelectedObject() {
    if (!this.selectedObject) return;
    
    if (this.selectedObject instanceof SceneObject) {
      this.scene.remove(this.selectedObject.mesh);
      this.selectedObject.delete();
      this.sceneObjects.delete(this.selectedObject.id);
    } else if (this.selectedObject instanceof CinemaCamera) {
      // If deleting the pinned camera, unpin it first
      if (this.pinnedCamera === this.selectedObject) {
        this.unpinCameraPreview();
      }
      
      this.selectedObject.delete();
      this.cinemaCameras.delete(this.selectedObject.id);
    }
    
    this.transformControls.detach();
    this.hideAllControlPanels();
    this.selectedObject = null;
  }
  
  // Hide camera visuals for clean capture
  hideCameraVisualsForCapture() {
    const originalVisibilities = [];
    this.cinemaCameras.forEach(cam => {
      originalVisibilities.push({
        helper: cam.helper.visible,
        mesh: cam.mesh.visible
      });
      cam.helper.visible = false;
      cam.mesh.visible = false;
    });
    
    const transformControlsVisible = this.transformControls.visible;
    this.transformControls.visible = false;
    
    return { cameras: originalVisibilities, transformControls: transformControlsVisible };
  }
  
  // Restore camera visuals after capture
  restoreCameraVisualsAfterCapture(visibilities) {
    this.transformControls.visible = visibilities.transformControls;
    
    let index = 0;
    this.cinemaCameras.forEach(cam => {
      if (visibilities.cameras[index]) {
        cam.helper.visible = visibilities.cameras[index].helper;
        cam.mesh.visible = visibilities.cameras[index].mesh;
      }
      index++;
    });
  }
  
  // Enter fullscreen camera view
  enterFullscreen() {
    if (!this.selectedObject || !(this.selectedObject instanceof CinemaCamera)) return;
    
    this.isFullscreen = true;
    
    // Hide main tools panel and model controls, but keep camera controls
    document.getElementById('main-tools-panel').style.display = 'none';
    document.getElementById('heading').style.display = 'none';
    document.getElementById('model-controls').style.display = 'none';
    
    // Hide regular camera viewport but keep controls visible
    if (!this.pinnedCamera) {
      document.getElementById('camera-viewport').style.display = 'none';
    }
    
    // Keep camera controls visible but update fullscreen button
    const selectionControlsArea = document.getElementById('selection-controls-area');
    selectionControlsArea.style.display = 'block';
    selectionControlsArea.style.zIndex = '1001';
    document.getElementById('camera-controls-panel').style.display = 'block';
    document.getElementById('fullscreen-btn').classList.add('active');
    
    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.id = 'fullscreen-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'black';
    overlay.style.zIndex = '999';
    
    // Create fullscreen renderer
    const fullscreenRenderer = new THREE.WebGLRenderer({ antialias: true });
    fullscreenRenderer.setSize(window.innerWidth, window.innerHeight);
    fullscreenRenderer.setClearColor(0x000000);
    fullscreenRenderer.shadowMap.enabled = true;
    fullscreenRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    overlay.appendChild(fullscreenRenderer.domElement);
    document.body.appendChild(overlay);
    
    // Render loop for fullscreen
    const renderFullscreen = () => {
      if (this.isFullscreen && this.selectedObject instanceof CinemaCamera) {
        // Hide camera objects and transform controls
        this.cinemaCameras.forEach(cam => {
          cam.helper.visible = false;
          cam.mesh.visible = false;
        });
        this.transformControls.visible = false;
        
        fullscreenRenderer.render(this.scene, this.selectedObject.camera);
        requestAnimationFrame(renderFullscreen);
      }
    };
    renderFullscreen();
    
    console.log('Entered fullscreen camera view');
  }
  
  // Exit fullscreen camera view
  exitFullscreen() {
    if (!this.isFullscreen) return;
    
    this.isFullscreen = false;
    
    // Remove fullscreen overlay
    const overlay = document.getElementById('fullscreen-overlay');
    if (overlay) {
      document.body.removeChild(overlay);
    }
    
    // Restore UI panels
    document.getElementById('main-tools-panel').style.display = 'block';
    document.getElementById('heading').style.display = 'block';
    
    if (this.selectedObject instanceof CinemaCamera) {
      const selectionControlsArea = document.getElementById('selection-controls-area');
      selectionControlsArea.style.zIndex = '1000';
      document.getElementById('camera-controls-panel').style.display = 'block';
      
      // Show camera viewport if pinned or if camera is selected
      if (this.pinnedCamera || this.selectedObject instanceof CinemaCamera) {
        document.getElementById('camera-viewport').style.display = 'block';
      }
      
      this.selectedObject.helper.visible = true;
      this.selectedObject.mesh.visible = true;
      this.transformControls.visible = true;
      document.getElementById('fullscreen-btn').classList.remove('active');
    }
    
    if (this.selectedObject instanceof SceneObject) {
      document.getElementById('model-controls').style.display = 'block';
    }
    
    console.log('Exited fullscreen camera view');
  }

  onWindowResize() {
    this.mainCamera.aspect = window.innerWidth / window.innerHeight;
    this.mainCamera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  // Public methods for UI interaction
  createCinemaCamera() {
    const camera = new CinemaCamera(`Camera ${this.cameraCounter++}`, this.scene);
    camera.addToScene();
    this.cinemaCameras.set(camera.id, camera);
    console.log('Created cinema camera:', camera.name);
    return camera;
  }
  
  // Initialize props library
  async initializePropsLibrary() {
    try {
      await this.propsLibrary.loadPropsLibrary();
      this.populatePropsDropdown();
    } catch (error) {
      console.error('Error initializing props library:', error);
      this.populatePropsDropdown([]); // Show empty state
    }
  }
  
  // Populate the custom props dropdown with available props
  populatePropsDropdown(props = null) {
    const dropdownOptions = document.getElementById('dropdown-options');
    const propsToShow = props || this.propsLibrary.getProps();
    
    // Clear existing options
    dropdownOptions.innerHTML = '';
    
    if (propsToShow.length === 0) {
      dropdownOptions.innerHTML = '<div class="dropdown-option loading" data-value="">No props available</div>';
      return;
    }
    
    // Add prop options with thumbnails
    propsToShow.forEach(prop => {
      const option = document.createElement('div');
      option.className = 'dropdown-option';
      option.setAttribute('data-value', prop.name);
      
      const thumbnail = document.createElement('div');
      thumbnail.className = 'dropdown-option-thumbnail';
      thumbnail.style.backgroundImage = `url('${prop.thumbnailPath}')`;
      
      const text = document.createElement('span');
      text.className = 'dropdown-option-text';
      text.textContent = prop.displayName;
      
      option.appendChild(thumbnail);
      option.appendChild(text);
      dropdownOptions.appendChild(option);
    });
    
    console.log('Props dropdown populated with', propsToShow.length, 'props');
  }
  
  // Handle custom dropdown selection
  onPropsDropdownChange(selectedPropName) {
    const dropdownSelected = document.getElementById('dropdown-selected');
    const addPropButton = document.getElementById('add-prop-button');
    
    if (!selectedPropName) {
      // No prop selected
      dropdownSelected.querySelector('span').textContent = 'Select a prop...';
      addPropButton.disabled = true;
      return;
    }
    
    const selectedProp = this.propsLibrary.getPropByName(selectedPropName);
    if (selectedProp) {
      // Update selected display
      dropdownSelected.querySelector('span').textContent = selectedProp.displayName;
      addPropButton.disabled = false;
    } else {
      dropdownSelected.querySelector('span').textContent = 'Select a prop...';
      addPropButton.disabled = true;
    }
  }
  
  // Initialize custom dropdown functionality
  initializeCustomDropdown() {
    const dropdown = document.getElementById('props-custom-dropdown');
    const dropdownSelected = document.getElementById('dropdown-selected');
    const dropdownOptions = document.getElementById('dropdown-options');
    let selectedValue = '';
    
    // Toggle dropdown open/close
    dropdownSelected.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdownSelected.classList.contains('open');
      
      if (isOpen) {
        this.closeCustomDropdown();
      } else {
        this.openCustomDropdown();
      }
    });
    
    // Handle option selection
    dropdownOptions.addEventListener('click', (e) => {
      const option = e.target.closest('.dropdown-option');
      if (option && !option.classList.contains('loading')) {
        const value = option.getAttribute('data-value');
        
        // Update selection
        dropdownOptions.querySelectorAll('.dropdown-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        selectedValue = value;
        this.onPropsDropdownChange(value);
        this.closeCustomDropdown();
      }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) {
        this.closeCustomDropdown();
      }
    });
    
    // Store selected value getter
    this.getSelectedPropValue = () => selectedValue;
    this.resetPropsDropdown = () => {
      selectedValue = '';
      this.onPropsDropdownChange('');
      dropdownOptions.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.classList.remove('selected');
      });
    };
  }
  
  openCustomDropdown() {
    const dropdownSelected = document.getElementById('dropdown-selected');
    const dropdownOptions = document.getElementById('dropdown-options');
    
    dropdownSelected.classList.add('open');
    dropdownOptions.classList.add('open');
  }
  
  closeCustomDropdown() {
    const dropdownSelected = document.getElementById('dropdown-selected');
    const dropdownOptions = document.getElementById('dropdown-options');
    
    dropdownSelected.classList.remove('open');
    dropdownOptions.classList.remove('open');
  }
  
  // Load prop from library
  loadPropFromLibrary(propName) {
    const prop = this.propsLibrary.getPropByName(propName);
    if (!prop) {
      console.error('Prop not found:', propName);
      return;
    }
    
    const loader = new GLTFLoader();
    
    loader.load(prop.glbPath, (gltf) => {
      const modelMesh = gltf.scene;
      
      modelMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      modelMesh.position.set(0, 0, 0);
      this.scene.add(modelMesh);
      
      const sceneObject = new SceneObject(modelMesh, prop.displayName);
      this.sceneObjects.set(sceneObject.id, sceneObject);
      
      console.log('Successfully loaded prop:', prop.displayName);
      
    }, (xhr) => {
      if (xhr.lengthComputable) {
        const percentComplete = xhr.loaded / xhr.total * 100;
        console.log(`Loading prop ${prop.displayName}: ${percentComplete.toFixed(1)}%`);
      }
    }, (error) => {
      console.error('Error loading prop:', error);
    });
  }

  loadGLTFModel(file) {
    const fileURL = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    
    loader.load(fileURL, (gltf) => {
      const modelMesh = gltf.scene;
      
      modelMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      modelMesh.position.set(0, 0, 0);
      this.scene.add(modelMesh);
      
      const sceneObject = new SceneObject(modelMesh, file.name.replace(/\.[^/.]+$/, ""));
      this.sceneObjects.set(sceneObject.id, sceneObject);
      
      URL.revokeObjectURL(fileURL);
      console.log('Successfully loaded model:', file.name);
      
    }, (xhr) => {
      if (xhr.lengthComputable) {
        const percentComplete = xhr.loaded / xhr.total * 100;
        console.log(`Loading model: ${percentComplete.toFixed(1)}%`);
      }
    }, (error) => {
      console.error('Error loading model:', error);
      URL.revokeObjectURL(fileURL);
    });
  }
}

// Initialize the application
let app;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
  app = new LEDStageApp();
  
  // Initialize UI event listeners
  initializeUI();
  
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});

// UI Event Handlers
function initializeUI() {
  // Studio selection controls
  const studioDropdown = document.getElementById('studio-dropdown');
  studioDropdown.addEventListener('change', (event) => {
    app.onStudioChange(event.target.value);
  });

  // LED Screen controls
  const fileInput = document.getElementById('file-input');
  const resetButton = document.getElementById('reset-button');
  const emissiveSlider = document.getElementById('emissive-slider');
  const emissiveValue = document.getElementById('emissive-value');
  
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file && app.ledScreen) {
      app.ledScreen.setCustomTexture(file, () => {
        console.log('Texture applied successfully');
        
        // Reset transform controls to default when new texture is loaded
        bgPosX.value = '0';
        bgPosY.value = '0';
        bgScaleX.value = '1';
        bgScaleY.value = '1';
        updateTextureTransforms();
      });
    }
  });
  
  resetButton.addEventListener('click', () => {
    if (app.ledScreen) {
      app.ledScreen.resetToOriginal();
      fileInput.value = '';
      emissiveSlider.value = app.ledScreen.originalEmissiveIntensity;
      emissiveValue.textContent = app.ledScreen.originalEmissiveIntensity.toFixed(1);
      
      // Reset transform controls
      bgPosX.value = '0';
      bgPosY.value = '0';
      bgScaleX.value = '1';
      bgScaleY.value = '1';
    }
  });
  
  emissiveSlider.addEventListener('input', (event) => {
    const intensity = parseFloat(event.target.value);
    emissiveValue.textContent = intensity.toFixed(1);
    if (app.ledScreen) {
      app.ledScreen.setBrightness(intensity);
    }
  });
  
  // Background Transform Controls
  const bgPosX = document.getElementById('bg-pos-x');
  const bgPosY = document.getElementById('bg-pos-y');
  const bgScaleX = document.getElementById('bg-scale-x');
  const bgScaleY = document.getElementById('bg-scale-y');
  
  // Function to update texture transforms
  function updateTextureTransforms() {
    if (app.ledScreen && app.ledScreen.currentTexture) {
      const texture = app.ledScreen.currentTexture;
      
      // Update offset (position)
      texture.offset.set(
        parseFloat(bgPosX.value),
        parseFloat(bgPosY.value)
      );
      
      // Update repeat (scale - inverse relationship)
      texture.repeat.set(
        parseFloat(bgScaleX.value),
        parseFloat(bgScaleY.value)
      );
      
      texture.needsUpdate = true;
    }
  }
  
  // Event listeners for input changes
  [bgPosX, bgPosY, bgScaleX, bgScaleY].forEach(input => {
    input.addEventListener('input', updateTextureTransforms);
  });
  
  // Increment/Decrement button functionality
  document.addEventListener('click', (event) => {
    if (event.target.classList.contains('increment-btn') || event.target.closest('.increment-btn')) {
      const btn = event.target.classList.contains('increment-btn') ? event.target : event.target.closest('.increment-btn');
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        const step = parseFloat(input.step) || 0.01;
        const newValue = parseFloat(input.value) + step;
        const min = parseFloat(input.min);
        if (isNaN(min) || newValue >= min) {
          input.value = newValue.toFixed(2);
          updateTextureTransforms();
        }
      }
    }
    
    if (event.target.classList.contains('decrement-btn') || event.target.closest('.decrement-btn')) {
      const btn = event.target.classList.contains('decrement-btn') ? event.target : event.target.closest('.decrement-btn');
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        const step = parseFloat(input.step) || 0.01;
        const newValue = parseFloat(input.value) - step;
        const min = parseFloat(input.min);
        if (isNaN(min) || newValue >= min) {
          input.value = newValue.toFixed(2);
          updateTextureTransforms();
        }
      }
    }
  });
  
  // Setup collapse functionality for all sections using the working togglePanel function
  document.getElementById('screen-collapse-btn').addEventListener('click', () => {
    togglePanel(document.getElementById('screen-collapse-btn'), document.getElementById('screen-content'));
  });
  
  document.getElementById('props-collapse-btn').addEventListener('click', () => {
    togglePanel(document.getElementById('props-collapse-btn'), document.getElementById('props-content'));
  });
  
  document.getElementById('cameras-collapse-btn').addEventListener('click', () => {
    togglePanel(document.getElementById('cameras-collapse-btn'), document.getElementById('cameras-content'));
  });
  
  // Model upload controls
  const gltfInput = document.getElementById('gltf-input');
  const placeModelButton = document.getElementById('place-model-button');
  
  let selectedFile = null;
  
  gltfInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    selectedFile = file;
    placeModelButton.disabled = !file;
  });
  
  placeModelButton.addEventListener('click', () => {
    if (selectedFile) {
      app.loadGLTFModel(selectedFile);
      gltfInput.value = '';
      selectedFile = null;
      placeModelButton.disabled = true;
    }
  });
  
  // Props library controls
  const addPropButton = document.getElementById('add-prop-button');
  
  addPropButton.addEventListener('click', () => {
    const selectedPropName = app.getSelectedPropValue();
    if (selectedPropName) {
      app.loadPropFromLibrary(selectedPropName);
      // Reset dropdown after adding
      app.resetPropsDropdown();
    }
  });

  // Camera controls
  document.getElementById('add-camera-btn').addEventListener('click', () => {
    app.createCinemaCamera();
  });
  
  // Transform controls
  document.getElementById('move-mode-btn').addEventListener('click', () => {
    if (app.selectedObject instanceof SceneObject) {
      app.transformControls.setMode('translate');
      app.updateModelControlButtons('translate');
    }
  });
  
  document.getElementById('rotate-mode-btn').addEventListener('click', () => {
    if (app.selectedObject instanceof SceneObject) {
      app.transformControls.setMode('rotate');
      app.updateModelControlButtons('rotate');
    }
  });
  
  document.getElementById('scale-mode-btn').addEventListener('click', () => {
    if (app.selectedObject instanceof SceneObject) {
      app.transformControls.setMode('scale');
      app.updateModelControlButtons('scale');
    }
  });
  
  document.getElementById('delete-model-btn').addEventListener('click', () => {
    app.deleteSelectedObject();
  });
  
  // Camera transform controls
  document.getElementById('camera-move-btn').addEventListener('click', () => {
    if (app.selectedObject instanceof CinemaCamera) {
      app.transformControls.setMode('translate');
      app.updateCameraControlButtons('translate');
    }
  });
  
  document.getElementById('camera-rotate-btn').addEventListener('click', () => {
    if (app.selectedObject instanceof CinemaCamera) {
      app.transformControls.setMode('rotate');
      app.updateCameraControlButtons('rotate');
    }
  });
  
  document.getElementById('delete-camera-btn').addEventListener('click', () => {
    app.deleteSelectedObject();
  });
  
  // Camera settings
  const focalLengthSlider = document.getElementById('focal-length');
  const focalLengthValue = document.getElementById('focal-length-value');
  const sensorSizeSlider = document.getElementById('sensor-size');
  const sensorSizeValue = document.getElementById('sensor-size-value');
  
  focalLengthSlider.addEventListener('input', (event) => {
    if (app.selectedObject instanceof CinemaCamera) {
      const length = parseFloat(event.target.value);
      app.selectedObject.setFocalLength(length);
      focalLengthValue.textContent = length + 'mm';
    }
  });
  
  sensorSizeSlider.addEventListener('input', (event) => {
    if (app.selectedObject instanceof CinemaCamera) {
      const size = parseFloat(event.target.value);
      app.selectedObject.setSensorSize(size);
      sensorSizeValue.textContent = size + 'mm';
    }
  });
  
  // Transform space buttons
  document.getElementById('model-world-btn').addEventListener('click', () => {
    app.transformSpace = 'world';
    app.updateTransformSpace();
  });
  
  document.getElementById('model-local-btn').addEventListener('click', () => {
    app.transformSpace = 'local';
    app.updateTransformSpace();
  });
  
  document.getElementById('camera-world-btn').addEventListener('click', () => {
    app.transformSpace = 'world';
    app.updateTransformSpace();
  });
  
  document.getElementById('camera-local-btn').addEventListener('click', () => {
    app.transformSpace = 'local';
    app.updateTransformSpace();
  });
  
  // Camera specific controls
  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    if (app.isFullscreen) {
      app.exitFullscreen();
    } else {
      app.enterFullscreen();
    }
  });
  
  document.getElementById('capture-btn').addEventListener('click', () => {
    if (app.selectedObject instanceof CinemaCamera) {
      app.selectedObject.capture(app);
    }
  });
  
  // Pin/Unpin preview button
  document.getElementById('pin-preview-btn').addEventListener('click', () => {
    app.togglePinCameraPreview();
  });
  
  // Collapse panels
  document.getElementById('model-collapse-btn').addEventListener('click', () => {
    togglePanel(document.getElementById('model-collapse-btn'), document.getElementById('model-content'));
  });
  
  document.getElementById('camera-collapse-btn').addEventListener('click', () => {
    togglePanel(document.getElementById('camera-collapse-btn'), document.getElementById('camera-content'));
  });
}

function togglePanel(button, content) {
  const isCollapsed = content.classList.contains('collapsed');
  
  if (isCollapsed) {
    content.classList.remove('collapsed');
    button.classList.remove('collapsed');
    button.title = 'Collapse Panel';
    button.innerHTML = '<i data-lucide="chevron-up"></i>';
  } else {
    content.classList.add('collapsed');
    button.classList.add('collapsed');
    button.title = 'Expand Panel';
    button.innerHTML = '<i data-lucide="chevron-down"></i>';
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Export for potential external use
export { LEDStageApp, LEDScreen, SceneObject, CinemaCamera };