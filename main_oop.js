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
  constructor(mesh, materialName = "M_WhiteScreen") {
    this.mesh = mesh;
    this.materialName = materialName;
    this.material = null;
    this.originalBaseColorTexture = null;
    this.originalEmissiveTexture = null;
    this.originalEmissiveIntensity = 1;
    this.currentTexture = null;
    this.brightness = 1.0;
    this.aspectRatio = 10 / 3;
    
    this.findTargetMaterial();
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
            
            console.log('Found LED screen material:', this.materialName);
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
        
        this.material.map = texture;
        this.material.emissiveMap = texture;
        this.material.needsUpdate = true;
        this.currentTexture = texture;
        
        console.log('Custom texture applied to LED screen');
        if (callback) callback();
      });
    });
  }
  
  setBrightness(intensity) {
    if (!this.material) return;
    
    this.brightness = intensity;
    this.material.emissiveIntensity = intensity;
    this.material.needsUpdate = true;
  }
  
  resetToOriginal() {
    if (!this.material) return;
    
    this.material.map = this.originalBaseColorTexture;
    this.material.emissiveMap = this.originalEmissiveTexture;
    this.material.emissiveIntensity = this.originalEmissiveIntensity;
    this.material.needsUpdate = true;
    
    this.brightness = this.originalEmissiveIntensity;
    this.currentTexture = null;
    
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
  
  capture() {
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
    const originalVisibilities = this.hideCameraVisuals();
    
    // Render and download
    captureRenderer.render(this.scene, this.camera);
    
    const canvas = captureRenderer.domElement;
    const link = document.createElement('a');
    link.download = `${this.name}_capture.png`;
    link.href = canvas.toDataURL();
    link.click();
    
    // Restore visibilities and cleanup
    this.restoreCameraVisuals(originalVisibilities);
    captureRenderer.dispose();
    
    console.log('Camera view captured:', this.name);
  }
  
  hideCameraVisuals() {
    // This method would be called by the app to hide all camera visuals
    // Implementation depends on the app's camera management
    return [];
  }
  
  restoreCameraVisuals(visibilities) {
    // Restore camera visibilities
    // Implementation depends on the app's camera management
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
    this.sceneObjects = new Map(); // id -> SceneObject
    this.cinemaCameras = new Map(); // id -> CinemaCamera
    this.selectedObject = null; // Can be SceneObject or CinemaCamera
    this.cameraCounter = 1;
    
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
    this.loadLEDStage();
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
  
  loadLEDStage() {
    const loader = new GLTFLoader().setPath('public/LED_Studio/');
    loader.load('LED_Studio_Madrid.gltf', (gltf) => {
      console.log('Loading LED stage model');
      const mesh = gltf.scene;
      
      mesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = true;
        }
      });
      
      mesh.position.set(0, 0, 0);
      this.scene.add(mesh);
      
      // Create LED screen system
      this.ledScreen = new LEDScreen(mesh);
      
      // Hide loading screen
      document.getElementById('progress-container').style.display = 'none';
      
      console.log('LED stage loaded successfully');
    }, (xhr) => {
      console.log(`Loading ${xhr.loaded / xhr.total * 100}%`);
    }, (error) => {
      console.error('Error loading LED stage:', error);
    });
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
    document.getElementById('camera-viewport').style.display = 'none';
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
      case 's':
        if (this.selectedObject instanceof SceneObject) {
          this.transformControls.setMode('scale');
          this.updateControlButtons('scale');
        }
        break;
      case 'x':
        this.toggleTransformSpace();
        break;
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
      });
    }
  });
  
  resetButton.addEventListener('click', () => {
    if (app.ledScreen) {
      app.ledScreen.resetToOriginal();
      fileInput.value = '';
      emissiveSlider.value = app.ledScreen.originalEmissiveIntensity;
      emissiveValue.textContent = app.ledScreen.originalEmissiveIntensity.toFixed(1);
    }
  });
  
  emissiveSlider.addEventListener('input', (event) => {
    const intensity = parseFloat(event.target.value);
    emissiveValue.textContent = intensity.toFixed(1);
    if (app.ledScreen) {
      app.ledScreen.setBrightness(intensity);
    }
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
  document.getElementById('capture-btn').addEventListener('click', () => {
    if (app.selectedObject instanceof CinemaCamera) {
      app.selectedObject.capture();
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