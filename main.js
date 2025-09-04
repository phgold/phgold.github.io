import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);
renderer.setPixelRatio(window.devicePixelRatio);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.set(-10, 7, -15);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1;
controls.maxDistance = 30;
controls.minPolarAngle = -0.5;
controls.maxPolarAngle = 1.5;
controls.autoRotate = false;
controls.target = new THREE.Vector3(0, 2, 0);
controls.update();

// Transform Controls for moving objects
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.addEventListener('dragging-changed', function (event) {
  controls.enabled = !event.value; // Disable orbit controls when dragging
});
scene.add(transformControls);

// Selection and interaction system
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedModel = null;

// Cinema Camera System
const cinemaCameras = [];
let selectedCamera = null;
let cameraPreviewRenderer = null;
let isFullscreen = false;
let cameraCounter = 1;

// Transform space management
let transformSpace = 'world'; // 'world' or 'local'

//test ground plane
/*
const groundGeometry = new THREE.PlaneGeometry(20, 20, 32, 32);
groundGeometry.rotateX(-Math.PI / 2);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x555555,
  side: THREE.DoubleSide
});
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.castShadow = false;
groundMesh.receiveShadow = true;
scene.add(groundMesh);
*/
const spotLight = new THREE.SpotLight(0xffffff, 10000, 100, 0.4, 1.2);
spotLight.position.set(0, 25, 0);
spotLight.castShadow = true;
spotLight.shadow.bias = -0.0001;
scene.add(spotLight);

const color = 0xFFFFFF;
const intensity = .5;
const light = new THREE.AmbientLight(color, intensity);
scene.add(light);

// Variables for texture management
let targetMaterial = null;
let originalBaseColorTexture = null;
let originalEmissiveTexture = null;
let originalEmissiveIntensity = 1;

// CHANGE THIS TO MATCH YOUR SPECIFIC MATERIAL NAME
const TARGET_MATERIAL_NAME = "M_WhiteScreen"; // Replace with your actual material name

// UI Elements
const fileInput = document.getElementById('file-input');
const resetButton = document.getElementById('reset-button');
const emissiveSlider = document.getElementById('emissive-slider');
const emissiveValue = document.getElementById('emissive-value');

// GLTF Upload Elements
const gltfInput = document.getElementById('gltf-input');
const placeModelButton = document.getElementById('place-model-button');

// Model Control Elements
const modelControlsPanel = document.getElementById('model-controls');
const moveModeBtn = document.getElementById('move-mode-btn');
const rotateModeBtn = document.getElementById('rotate-mode-btn');
const scaleModeBtn = document.getElementById('scale-mode-btn');
const deleteModelBtn = document.getElementById('delete-model-btn');
const modelWorldBtn = document.getElementById('model-world-btn');
const modelLocalBtn = document.getElementById('model-local-btn');

// Camera Control Elements
const addCameraBtn = document.getElementById('add-camera-btn');
const cameraControlsPanel = document.getElementById('camera-controls-panel');
const focalLengthSlider = document.getElementById('focal-length');
const focalLengthValue = document.getElementById('focal-length-value');
const sensorSizeSlider = document.getElementById('sensor-size');
const sensorSizeValue = document.getElementById('sensor-size-value');
const cameraMoveBtn = document.getElementById('camera-move-btn');
const cameraRotateBtn = document.getElementById('camera-rotate-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const captureBtn = document.getElementById('capture-btn');
const deleteCameraBtn = document.getElementById('delete-camera-btn');
const cameraViewport = document.getElementById('camera-viewport');
const viewportContainer = document.getElementById('viewport-container');
const cameraWorldBtn = document.getElementById('camera-world-btn');

// Collapsible panel elements
const modelCollapseBtn = document.getElementById('model-collapse-btn');
const cameraCollapseBtn = document.getElementById('camera-collapse-btn');
const modelContent = document.getElementById('model-content');
const cameraContent = document.getElementById('camera-content');
const cameraLocalBtn = document.getElementById('camera-local-btn');

// Function to crop image to 10:3 aspect ratio
function cropImageTo10x3(file, callback) {
  const img = new Image();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  img.onload = () => {
    const targetAspectRatio = 10 / 3;
    const sourceAspectRatio = img.width / img.height;
    
    let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height;
    
    if (sourceAspectRatio > targetAspectRatio) {
      // Image is wider than target ratio - crop width
      sourceWidth = img.height * targetAspectRatio;
      sourceX = (img.width - sourceWidth) / 2;
    } else {
      // Image is taller than target ratio - crop height
      sourceHeight = img.width / targetAspectRatio;
      sourceY = (img.height - sourceHeight) / 2;
    }
    
    // Set canvas size to maintain quality
    const outputWidth = Math.min(3600, sourceWidth);
    const outputHeight = outputWidth / targetAspectRatio;
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    
    // Draw the cropped image
    ctx.drawImage(
      img,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, outputWidth, outputHeight
    );
    
    // Convert to data URL and call callback
    callback(canvas.toDataURL('image/png'));
  };
  
  const reader = new FileReader();
  reader.onload = (e) => {
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// File upload handler
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file && targetMaterial) {
    cropImageTo10x3(file, (croppedDataUrl) => {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(croppedDataUrl, (texture) => {
        // Configure texture for GLTF
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.flipY = false;
        
        // Apply to both base color and emissive
        targetMaterial.map = texture;
        targetMaterial.emissiveMap = texture;
        targetMaterial.needsUpdate = true;
        
        console.log('Cropped texture applied to', TARGET_MATERIAL_NAME);
      });
    });
  }
});

// Reset button handler
resetButton.addEventListener('click', () => {
  if (targetMaterial) {
    // Restore original textures and intensity
    targetMaterial.map = originalBaseColorTexture;
    targetMaterial.emissiveMap = originalEmissiveTexture;
    targetMaterial.emissiveIntensity = originalEmissiveIntensity;
    targetMaterial.needsUpdate = true;
    
    // Reset UI controls
    fileInput.value = '';
    emissiveSlider.value = originalEmissiveIntensity;
    emissiveValue.textContent = originalEmissiveIntensity.toFixed(1);
    
    console.log('Texture and emissive intensity reset for', TARGET_MATERIAL_NAME);
  }
});

// Emissive intensity slider handler
emissiveSlider.addEventListener('input', (event) => {
  const intensity = parseFloat(event.target.value);
  emissiveValue.textContent = intensity.toFixed(1);
  
  if (targetMaterial) {
    targetMaterial.emissiveIntensity = intensity;
    targetMaterial.needsUpdate = true;
  }
});

const loader = new GLTFLoader().setPath('public/LED_Studio/');
loader.load('LED_Studio_Madrid.gltf', (gltf) => {
  console.log('loading model');
  const mesh = gltf.scene;

  mesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = true;
      
      // Look for the target material
      if (child.material) {
        if (Array.isArray(child.material)) {
          // Handle multiple materials
          child.material.forEach((mat) => {
            if (mat.name === TARGET_MATERIAL_NAME) {
              targetMaterial = mat;
              // Store original textures and emissive intensity
              originalBaseColorTexture = mat.map;
              originalEmissiveTexture = mat.emissiveMap;
              originalEmissiveIntensity = mat.emissiveIntensity || 1;
              
              // Update slider to match current intensity
              emissiveSlider.value = originalEmissiveIntensity;
              emissiveValue.textContent = originalEmissiveIntensity.toFixed(1);
              
              console.log('Found target material:', TARGET_MATERIAL_NAME);
            }
          });
        } else {
          // Handle single material
          if (child.material.name === TARGET_MATERIAL_NAME) {
            targetMaterial = child.material;
            // Store original textures and emissive intensity
            originalBaseColorTexture = child.material.map;
            originalEmissiveTexture = child.material.emissiveMap;
            originalEmissiveIntensity = child.material.emissiveIntensity || 1;
            
            // Update slider to match current intensity
            emissiveSlider.value = originalEmissiveIntensity;
            emissiveValue.textContent = originalEmissiveIntensity.toFixed(1);
            
            console.log('Found target material:', TARGET_MATERIAL_NAME);
          }
        }
      }
    }
  });

  mesh.position.set(0, 0, 0);
  scene.add(mesh);

  document.getElementById('progress-container').style.display = 'none';
  
  if (!targetMaterial) {
    console.warn('Target material not found:', TARGET_MATERIAL_NAME);
    console.log('Available materials:');
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat, index) => {
            console.log(`- ${mat.name || 'Unnamed'} (${child.name || 'Unnamed mesh'}_${index})`);
          });
        } else {
          console.log(`- ${child.material.name || 'Unnamed'} (${child.name || 'Unnamed mesh'})`);
        }
      }
    });
  }
}, (xhr) => {
  console.log(`loading ${xhr.loaded / xhr.total * 100}%`);
}, (error) => {
  console.error(error);
});

// GLTF Upload System
const placedModels = [];
let selectedGltfFile = null;

// Function to handle GLTF file selection
gltfInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    selectedGltfFile = file;
    placeModelButton.disabled = false;
    console.log('File selected:', file.name, 'Type:', file.type, 'Size:', file.size);
  } else {
    selectedGltfFile = null;
    placeModelButton.disabled = true;
  }
});

// Function to load and place a GLTF model from uploaded file
function placeUploadedModel(file) {
  console.log('Starting to load model:', file.name);
  
  // For GLTF files, we need to handle them differently than GLB
  if (file.name.toLowerCase().endsWith('.gltf')) {
    // For GLTF files, we need to read the file as text first to check if it references external files
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const gltfJson = JSON.parse(e.target.result);
        console.log('GLTF JSON parsed successfully:', gltfJson);
        
        // Check if the GLTF references external files (like .bin files)
        if (gltfJson.buffers && gltfJson.buffers.some(buffer => buffer.uri && !buffer.uri.startsWith('data:'))) {
          alert('This GLTF file references external files (.bin, textures, etc.). Please use a GLB file instead, or ensure all referenced files are embedded.');
          resetUploadForm();
          return;
        }
        
        // If no external files, proceed with loading
        loadGltfFromBlob(file);
        
      } catch (error) {
        console.error('Failed to parse GLTF JSON:', error);
        alert('Invalid GLTF file format.');
        resetUploadForm();
      }
    };
    reader.readAsText(file);
  } else {
    // For GLB files, load directly
    loadGltfFromBlob(file);
  }
}

function loadGltfFromBlob(file) {
  // Create a URL for the file
  const fileURL = URL.createObjectURL(file);
  
  // Create a new GLTFLoader
  const modelLoader = new GLTFLoader();
  
  console.log('Loading GLTF from URL:', fileURL);
  
  modelLoader.load(fileURL, (gltf) => {
    console.log('GLTF loaded successfully:', gltf);
    const modelMesh = gltf.scene;
    
    // Configure the model mesh
    modelMesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    // Position the model at the center of the scene
    modelMesh.position.set(0, 0, 0);
    modelMesh.scale.set(1, 1, 1);
    
    // Add to scene
    scene.add(modelMesh);
    placedModels.push(modelMesh);
    
    // Clean up the object URL
    URL.revokeObjectURL(fileURL);
    
    // Reset form
    resetUploadForm();
    
    console.log(`Successfully placed uploaded model: ${file.name}`);
  }, (xhr) => {
    if (xhr.lengthComputable) {
      const percentComplete = xhr.loaded / xhr.total * 100;
      console.log(`Loading model ${file.name}: ${percentComplete.toFixed(1)}%`);
    }
  }, (error) => {
    console.error(`Error loading model ${file.name}:`, error);
    console.error('Error details:', error.message);
    
    let errorMessage = `Failed to load model: ${file.name}\n\n`;
    if (error.message) {
      errorMessage += `Error: ${error.message}\n\n`;
    }
    errorMessage += 'Common issues:\n';
    errorMessage += '- For GLTF files: Make sure all textures and .bin files are embedded or use GLB format\n';
    errorMessage += '- Check that the file is a valid GLTF/GLB file\n';
    errorMessage += '- Try converting to GLB format for better compatibility';
    
    alert(errorMessage);
    
    // Clean up the object URL
    URL.revokeObjectURL(fileURL);
    
    // Reset form
    resetUploadForm();
  });
}

function resetUploadForm() {
  gltfInput.value = '';
  selectedGltfFile = null;
  placeModelButton.disabled = true;
}

// Event handler for placing the model
placeModelButton.addEventListener('click', () => {
  if (selectedGltfFile) {
    placeUploadedModel(selectedGltfFile);
  }
});

// Model selection and manipulation functions
function onMouseClick(event) {
  // Calculate mouse position in normalized device coordinates
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  // Cast ray from camera through mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Create arrays of all selectable objects
  const allSelectableObjects = [...placedModels];
  cinemaCameras.forEach(cam => allSelectableObjects.push(cam.mesh));
  
  // Check for intersections
  const intersects = raycaster.intersectObjects(allSelectableObjects, true);
  
  if (intersects.length > 0) {
    const clickedObject = intersects[0].object;
    
    // Check if clicked object is a camera mesh
    const clickedCamera = cinemaCameras.find(cam => cam.mesh === clickedObject);
    if (clickedCamera) {
      selectCinemaCamera(clickedCamera);
      return;
    }
    
    // Check if clicked object is a model
    let clickedModel = clickedObject;
    while (clickedModel.parent && !placedModels.includes(clickedModel)) {
      clickedModel = clickedModel.parent;
    }
    
    if (placedModels.includes(clickedModel)) {
      selectModel(clickedModel);
      return;
    }
  }
  
  // Clicked on empty space - deselect everything
  deselectModel();
  deselectCinemaCamera();
}

function selectModel(model) {
  if (selectedModel === model) return; // Already selected
  
  // Deselect previous model
  if (selectedModel) {
    deselectModel();
  }
  
  selectedModel = model;
  
  // Attach transform controls to selected model
  transformControls.attach(selectedModel);
  transformControls.setMode('translate'); // Default to translate mode
  
  // Add visual indicator (highlight)
  selectedModel.traverse((child) => {
    if (child.isMesh && child.material) {
      // Store original emissive values
      if (!child.userData.originalEmissive) {
        child.userData.originalEmissive = child.material.emissive ? child.material.emissive.clone() : new THREE.Color(0x000000);
        child.userData.originalEmissiveIntensity = child.material.emissiveIntensity || 0;
      }
      
      // Apply selection highlight
      if (child.material.emissive) {
        child.material.emissive.setHex(0x333333);
        child.material.emissiveIntensity = 0.3;
      }
      child.material.needsUpdate = true;
    }
  });
  
  // Show control panel
  modelControlsPanel.style.display = 'block';
  updateControlButtons('translate');
  updateTransformSpace();
  
  console.log('Model selected:', selectedModel);
}

function deselectModel() {
  if (!selectedModel) return;
  
  // Remove visual highlight
  selectedModel.traverse((child) => {
    if (child.isMesh && child.material && child.userData.originalEmissive) {
      child.material.emissive.copy(child.userData.originalEmissive);
      child.material.emissiveIntensity = child.userData.originalEmissiveIntensity;
      child.material.needsUpdate = true;
    }
  });
  
  // Detach transform controls
  transformControls.detach();
  
  // Hide control panel
  modelControlsPanel.style.display = 'none';
  
  selectedModel = null;
  console.log('Model deselected');
}

function updateControlButtons(activeMode) {
  // Remove active class from all buttons
  [moveModeBtn, rotateModeBtn, scaleModeBtn].forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Add active class to current mode button
  switch(activeMode) {
    case 'translate':
      moveModeBtn.classList.add('active');
      break;
    case 'rotate':
      rotateModeBtn.classList.add('active');
      break;
    case 'scale':
      scaleModeBtn.classList.add('active');
      break;
  }
}

function updateTransformSpace() {
  if (transformSpace === 'world') {
    transformControls.setSpace('world');
    // Update UI buttons for models
    if (selectedModel) {
      modelWorldBtn.classList.add('active');
      modelLocalBtn.classList.remove('active');
    }
    // Update UI buttons for cameras
    if (selectedCamera) {
      cameraWorldBtn.classList.add('active');
      cameraLocalBtn.classList.remove('active');
    }
  } else {
    transformControls.setSpace('local');
    // Update UI buttons for models
    if (selectedModel) {
      modelWorldBtn.classList.remove('active');
      modelLocalBtn.classList.add('active');
    }
    // Update UI buttons for cameras
    if (selectedCamera) {
      cameraWorldBtn.classList.remove('active');
      cameraLocalBtn.classList.add('active');
    }
  }
}

function toggleTransformSpace() {
  transformSpace = transformSpace === 'world' ? 'local' : 'world';
  updateTransformSpace();
  console.log('Transform space:', transformSpace);
}

function deleteSelectedModel() {
  if (!selectedModel) return;
  
  // Remove from scene
  scene.remove(selectedModel);
  
  // Remove from placedModels array
  const index = placedModels.indexOf(selectedModel);
  if (index > -1) {
    placedModels.splice(index, 1);
  }
  
  // Dispose of geometry and materials to free memory
  selectedModel.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(material => {
            if (material.map) material.map.dispose();
            if (material.normalMap) material.normalMap.dispose();
            if (material.emissiveMap) material.emissiveMap.dispose();
            material.dispose();
          });
        } else {
          if (child.material.map) child.material.map.dispose();
          if (child.material.normalMap) child.material.normalMap.dispose();
          if (child.material.emissiveMap) child.material.emissiveMap.dispose();
          child.material.dispose();
        }
      }
    }
  });
  
  // Detach transform controls
  transformControls.detach();
  
  // Hide control panel
  modelControlsPanel.style.display = 'none';
  
  console.log('Model deleted and memory freed');
  selectedModel = null;
}

// Event listeners
renderer.domElement.addEventListener('click', onMouseClick, false);

// UI button event listeners
moveModeBtn.addEventListener('click', () => {
  if (selectedModel) {
    transformControls.setMode('translate');
    updateControlButtons('translate');
  }
});

rotateModeBtn.addEventListener('click', () => {
  if (selectedModel) {
    transformControls.setMode('rotate');
    updateControlButtons('rotate');
  }
});

scaleModeBtn.addEventListener('click', () => {
  if (selectedModel) {
    transformControls.setMode('scale');
    updateControlButtons('scale');
  }
});

deleteModelBtn.addEventListener('click', () => {
  deleteSelectedModel();
});

// Transform space toggle buttons for models
modelWorldBtn.addEventListener('click', () => {
  transformSpace = 'world';
  updateTransformSpace();
});

modelLocalBtn.addEventListener('click', () => {
  transformSpace = 'local';
  updateTransformSpace();
});

// Cinema Camera Event Listeners
addCameraBtn.addEventListener('click', () => {
  createCinemaCamera();
});

// Camera control buttons
cameraMoveBtn.addEventListener('click', () => {
  if (selectedCamera) {
    transformControls.setMode('translate');
    updateCameraControlButtons('translate');
  }
});

cameraRotateBtn.addEventListener('click', () => {
  if (selectedCamera) {
    transformControls.setMode('rotate');
    updateCameraControlButtons('rotate');
  }
});

fullscreenBtn.addEventListener('click', () => {
  if (isFullscreen) {
    exitFullscreen();
  } else {
    enterFullscreen();
  }
});

captureBtn.addEventListener('click', () => {
  captureCameraView();
});

deleteCameraBtn.addEventListener('click', () => {
  deleteSelectedCamera();
});

// Camera settings sliders
focalLengthSlider.addEventListener('input', (event) => {
  if (selectedCamera) {
    selectedCamera.focalLength = parseFloat(event.target.value);
    focalLengthValue.textContent = selectedCamera.focalLength + 'mm';
    updateCameraSettings();
  }
});

sensorSizeSlider.addEventListener('input', (event) => {
  if (selectedCamera) {
    selectedCamera.sensorSize = parseFloat(event.target.value);
    sensorSizeValue.textContent = selectedCamera.sensorSize + 'mm';
    updateCameraSettings();
  }
});

// Transform space toggle buttons for cameras
cameraWorldBtn.addEventListener('click', () => {
  transformSpace = 'world';
  updateTransformSpace();
});

cameraLocalBtn.addEventListener('click', () => {
  transformSpace = 'local';
  updateTransformSpace();
});

// Panel collapse functionality
function togglePanel(button, content) {
  const isCollapsed = content.classList.contains('collapsed');
  
  if (isCollapsed) {
    // Expand
    content.classList.remove('collapsed');
    button.classList.remove('collapsed');
    button.title = 'Collapse Panel';
    button.innerHTML = '<i data-lucide="chevron-up"></i>';
  } else {
    // Collapse
    content.classList.add('collapsed');
    button.classList.add('collapsed');
    button.title = 'Expand Panel';
    button.innerHTML = '<i data-lucide="chevron-down"></i>';
  }
  
  // Reinitialize Lucide icons to update the changed icon
  lucide.createIcons();
}

// Collapse button event listeners
modelCollapseBtn.addEventListener('click', () => {
  togglePanel(modelCollapseBtn, modelContent);
});

cameraCollapseBtn.addEventListener('click', () => {
  togglePanel(cameraCollapseBtn, cameraContent);
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  // Handle fullscreen exit
  if (event.key === 'Escape' && isFullscreen) {
    exitFullscreen();
    return;
  }
  
  if (selectedModel) {
    switch (event.key.toLowerCase()) {
      case 'delete':
      case 'backspace':
        deleteSelectedModel();
        break;
      case 'g': // Move mode (like Blender)
        transformControls.setMode('translate');
        updateControlButtons('translate');
        break;
      case 'r': // Rotate mode
        transformControls.setMode('rotate');
        updateControlButtons('rotate');
        break;
      case 's': // Scale mode
        transformControls.setMode('scale');
        updateControlButtons('scale');
        break;
      case 'x': // Toggle transform space
        toggleTransformSpace();
        break;
      case 'escape':
        deselectModel();
        break;
    }
  }
  
  if (selectedCamera) {
    switch (event.key.toLowerCase()) {
      case 'delete':
      case 'backspace':
        deleteSelectedCamera();
        break;
      case 'g': // Move mode
        transformControls.setMode('translate');
        updateCameraControlButtons('translate');
        break;
      case 'r': // Rotate mode
        transformControls.setMode('rotate');
        updateCameraControlButtons('rotate');
        break;
      case 'x': // Toggle transform space
        toggleTransformSpace();
        break;
      case 'f': // Fullscreen
        enterFullscreen();
        break;
      case 'c': // Capture
        captureCameraView();
        break;
      case 'escape':
        deselectCinemaCamera();
        break;
    }
  }
});

// Cinema Camera Functions
function createCinemaCamera() {
  // Create the camera
  const cameraObject = new THREE.PerspectiveCamera(75, 16/9, 0.1, 1000);
  
  // Create a visual representation of the camera
  const cameraGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.4);
  const cameraMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff8800,
    emissive: 0x442200,
    emissiveIntensity: 0.3
  });
  const cameraMesh = new THREE.Mesh(cameraGeometry, cameraMaterial);
  
  // Create a group to hold everything - this will be the transform target
  const cameraGroup = new THREE.Group();
  
  // Position the camera object at the front of the mesh (so it looks forward)
  cameraObject.position.set(0, 0, 0.2);
  // Rotate the camera 180 degrees around Y axis so it looks in the correct direction
  cameraObject.rotation.y = Math.PI;
  
  // Add camera and mesh to the group
  cameraGroup.add(cameraObject);
  cameraGroup.add(cameraMesh);
  
  // Set initial position and orientation for the entire group
  cameraGroup.position.set(0, 1.7, -5);
  cameraGroup.lookAt(0, 0, 0);
  
  // Create camera helper AFTER positioning everything
  // The helper will automatically track the camera's world position
  const cameraHelper = new THREE.CameraHelper(cameraObject);
  cameraHelper.visible = false;
  
  // Add helper directly to scene (not to the group) so it tracks correctly
  scene.add(cameraHelper);
  
  // Store camera data
  const cameraData = {
    group: cameraGroup,
    camera: cameraObject,
    mesh: cameraMesh,
    helper: cameraHelper,
    name: `Camera ${cameraCounter++}`,
    focalLength: 50,
    sensorSize: 24
  };
  
  // Add group to scene and tracking array
  scene.add(cameraGroup);
  cinemaCameras.push(cameraData);
  
  console.log('Created cinema camera:', cameraData.name);
  return cameraData;
}

function selectCinemaCamera(cameraData) {
  if (selectedCamera === cameraData) return;
  
  // Deselect any selected model first
  if (selectedModel) {
    deselectModel();
  }
  
  // Deselect previous camera
  if (selectedCamera) {
    deselectCinemaCamera();
  }
  
  selectedCamera = cameraData;
  
  // Show camera helper
  selectedCamera.helper.visible = true;
  
  // Attach transform controls (translation and rotation only)
  transformControls.attach(selectedCamera.group);
  transformControls.setMode('translate');
  
  // Highlight the camera mesh
  selectedCamera.mesh.material.emissive.setHex(0x884400);
  selectedCamera.mesh.material.emissiveIntensity = 0.6;
  
  // Show camera controls panel
  cameraControlsPanel.style.display = 'block';
  updateCameraControlButtons('translate');
  updateTransformSpace();
  
  // Update sliders with current values
  focalLengthSlider.value = selectedCamera.focalLength;
  focalLengthValue.textContent = selectedCamera.focalLength + 'mm';
  sensorSizeSlider.value = selectedCamera.sensorSize;
  sensorSizeValue.textContent = selectedCamera.sensorSize + 'mm';
  
  // Show camera preview
  showCameraPreview();
  
  console.log('Selected camera:', selectedCamera.name);
}

function deselectCinemaCamera() {
  if (!selectedCamera) return;
  
  // Hide camera helper
  selectedCamera.helper.visible = false;
  
  // Remove highlight
  selectedCamera.mesh.material.emissive.setHex(0x442200);
  selectedCamera.mesh.material.emissiveIntensity = 0.3;
  
  // Detach transform controls
  transformControls.detach();
  
  // Hide camera controls panel and preview
  cameraControlsPanel.style.display = 'none';
  cameraViewport.style.display = 'none';
  
  selectedCamera = null;
  console.log('Camera deselected');
}

function updateCameraControlButtons(activeMode) {
  [cameraMoveBtn, cameraRotateBtn].forEach(btn => {
    btn.classList.remove('active');
  });
  
  switch(activeMode) {
    case 'translate':
      cameraMoveBtn.classList.add('active');
      break;
    case 'rotate':
      cameraRotateBtn.classList.add('active');
      break;
  }
}

function updateCameraSettings() {
  if (!selectedCamera) return;
  
  const fov = 2 * Math.atan(selectedCamera.sensorSize / (2 * selectedCamera.focalLength)) * 180 / Math.PI;
  selectedCamera.camera.fov = fov;
  selectedCamera.camera.updateProjectionMatrix();
  
  // Update helper - need to update both the helper and its matrix
  selectedCamera.helper.update();
  selectedCamera.helper.updateMatrixWorld(true);
  
  // Update preview if active
  if (cameraPreviewRenderer) {
    renderCameraPreview();
  }
}

function showCameraPreview() {
  if (!selectedCamera) return;
  
  cameraViewport.style.display = 'block';
  
  // Create preview renderer if it doesn't exist
  if (!cameraPreviewRenderer) {
    cameraPreviewRenderer = new THREE.WebGLRenderer({ antialias: true });
    cameraPreviewRenderer.setSize(320, 180);
    cameraPreviewRenderer.setClearColor(0x000000);
    cameraPreviewRenderer.shadowMap.enabled = true;
    cameraPreviewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    viewportContainer.appendChild(cameraPreviewRenderer.domElement);
  }
  
  renderCameraPreview();
}

function renderCameraPreview() {
  if (!selectedCamera || !cameraPreviewRenderer) return;
  
  // Store original visibility states
  const originalVisibilities = [];
  
  // Temporarily hide camera helpers, meshes, and transform controls
  cinemaCameras.forEach(cam => {
    originalVisibilities.push({
      helper: cam.helper.visible,
      mesh: cam.mesh.visible
    });
    cam.helper.visible = false;
    cam.mesh.visible = false;
  });
  
  // Hide transform controls
  const transformControlsVisible = transformControls.visible;
  transformControls.visible = false;
  
  // Render from selected camera's perspective
  cameraPreviewRenderer.render(scene, selectedCamera.camera);
  
  // Restore transform controls visibility
  transformControls.visible = transformControlsVisible;
  
  // Restore camera visibilities
  cinemaCameras.forEach((cam, index) => {
    if (originalVisibilities[index]) {
      cam.helper.visible = originalVisibilities[index].helper;
      cam.mesh.visible = originalVisibilities[index].mesh;
    }
  });
}

function deleteSelectedCamera() {
  if (!selectedCamera) return;
  
  // Remove from scene
  scene.remove(selectedCamera.group);
  scene.remove(selectedCamera.helper); // Remove helper separately since it's added to scene directly
  
  // Remove from array
  const index = cinemaCameras.indexOf(selectedCamera);
  if (index > -1) {
    cinemaCameras.splice(index, 1);
  }
  
  // Dispose of geometries and materials
  selectedCamera.mesh.geometry.dispose();
  selectedCamera.mesh.material.dispose();
  selectedCamera.helper.dispose();
  
  // Hide panels
  cameraControlsPanel.style.display = 'none';
  cameraViewport.style.display = 'none';
  
  // Detach transform controls
  transformControls.detach();
  
  console.log('Camera deleted:', selectedCamera.name);
  selectedCamera = null;
}

function enterFullscreen() {
  if (!selectedCamera) return;
  
  isFullscreen = true;
  
  // Hide main tools panel and model controls, but keep camera controls
  document.getElementById('main-tools-panel').style.display = 'none';
  document.getElementById('heading').style.display = 'none';
  modelControlsPanel.style.display = 'none';
  cameraViewport.style.display = 'none';
  
  // Keep camera controls visible but update fullscreen button text
  const selectionControlsArea = document.getElementById('selection-controls-area');
  selectionControlsArea.style.display = 'block';
  selectionControlsArea.style.zIndex = '1001'; // Ensure it's above fullscreen overlay
  cameraControlsPanel.style.display = 'block';
  fullscreenBtn.classList.add('active');
  
  // Create fullscreen overlay
  const overlay = document.createElement('div');
  overlay.id = 'fullscreen-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'black';
  overlay.style.zIndex = '999'; // Lower than camera controls
  
  // Create fullscreen renderer
  const fullscreenRenderer = new THREE.WebGLRenderer({ antialias: true });
  fullscreenRenderer.setSize(window.innerWidth, window.innerHeight);
  fullscreenRenderer.setClearColor(0x000000);
  fullscreenRenderer.shadowMap.enabled = true;
  fullscreenRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  overlay.appendChild(fullscreenRenderer.domElement);
  document.body.appendChild(overlay);
  
  // Render loop for fullscreen
  function renderFullscreen() {
    if (isFullscreen && selectedCamera) {
      // Hide camera objects and transform controls
      cinemaCameras.forEach(cam => {
        cam.helper.visible = false;
        cam.mesh.visible = false;
      });
      transformControls.visible = false;
      
      fullscreenRenderer.render(scene, selectedCamera.camera);
      requestAnimationFrame(renderFullscreen);
    }
  }
  renderFullscreen();
  
  console.log('Entered fullscreen camera view');
}

function exitFullscreen() {
  if (!isFullscreen) return;
  
  isFullscreen = false;
  
  // Remove fullscreen overlay
  const overlay = document.getElementById('fullscreen-overlay');
  if (overlay) {
    document.body.removeChild(overlay);
  }
  
  // Restore UI panels
  document.getElementById('main-tools-panel').style.display = 'block';
  document.getElementById('heading').style.display = 'block';
  
  if (selectedCamera) {
    const selectionControlsArea = document.getElementById('selection-controls-area');
    selectionControlsArea.style.zIndex = '1000'; // Reset to normal z-index
    cameraControlsPanel.style.display = 'block';
    cameraViewport.style.display = 'block';
    selectedCamera.helper.visible = true;
    selectedCamera.mesh.visible = true;
    transformControls.visible = true;
    // Restore fullscreen button state
    fullscreenBtn.classList.remove('active');
  }
  
  if (selectedModel) {
    modelControlsPanel.style.display = 'block';
  }
  
  console.log('Exited fullscreen camera view');
}

function captureCameraView() {
  if (!selectedCamera) return;
  
  // Create a temporary renderer for high-quality capture
  const captureRenderer = new THREE.WebGLRenderer({ 
    antialias: true,
    preserveDrawingBuffer: true 
  });
  captureRenderer.setSize(1920, 1080); // High resolution
  captureRenderer.setClearColor(0x000000);
  captureRenderer.shadowMap.enabled = true;
  captureRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Store original visibilities
  const originalVisibilities = [];
  cinemaCameras.forEach(cam => {
    originalVisibilities.push({
      helper: cam.helper.visible,
      mesh: cam.mesh.visible
    });
    cam.helper.visible = false;
    cam.mesh.visible = false;
  });
  
  // Hide transform controls
  const transformControlsVisible = transformControls.visible;
  transformControls.visible = false;
  
  // Render the scene
  captureRenderer.render(scene, selectedCamera.camera);
  
  // Get image data and create download link
  const canvas = captureRenderer.domElement;
  const link = document.createElement('a');
  link.download = `${selectedCamera.name}_capture.png`;
  link.href = canvas.toDataURL();
  link.click();
  
  // Restore transform controls visibility
  transformControls.visible = transformControlsVisible;
  
  // Restore camera visibilities
  cinemaCameras.forEach((cam, index) => {
    if (originalVisibilities[index]) {
      cam.helper.visible = originalVisibilities[index].helper;
      cam.mesh.visible = originalVisibilities[index].mesh;
    }
  });
  
  // Dispose of temporary renderer
  captureRenderer.dispose();
  
  console.log('Camera view captured:', selectedCamera.name);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  
  // Update camera preview if a camera is selected
  if (selectedCamera && cameraPreviewRenderer && cameraViewport.style.display !== 'none') {
    renderCameraPreview();
  }
}

animate();