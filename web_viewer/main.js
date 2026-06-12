import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import URDFLoader from "urdf-loader";

console.log("main.js is running");

let robot = null;

let visualParts = [];

const statusEl = document.getElementById("status");
const jointSliderListEl = document.getElementById("joint-slider-list");
const linkListEl = document.getElementById("link-list");
const partListEl = document.getElementById("part-list");
const showAllBtn = document.getElementById("show-all-btn");

statusEl.innerText = "main.js running, loading URDF...";

// =====================================================
// Choose URDF file here
// =====================================================

// For your 2-DOF arm:
// const urdfPath = "../model/assets/2_dof_arm.urdf";

// For your 6-DOF arm:
const urdfPath = "../model/assets/6_dof_arm.urdf";

// =====================================================
// Scene setup
// =====================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f2f2);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);

camera.position.set(1.8, 1.6, 1.2);
camera.lookAt(0.4, 0, 0.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.4, 0, 0.35);
controls.update();

// =====================================================
// Lights and helpers
// =====================================================

scene.add(new THREE.AmbientLight(0xffffff, 0.8));

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(2, 2, 3);
scene.add(directionalLight);

const grid = new THREE.GridHelper(2.0, 20);
scene.add(grid);

const axes = new THREE.AxesHelper(0.5);
scene.add(axes);

// =====================================================
// Load URDF
// =====================================================

const loader = new URDFLoader();

loader.load(
  urdfPath,

  loadedRobot => {
    robot = loadedRobot;

    console.log("Robot loaded:", robot);
    console.log("Links:", robot.links);
    console.log("Joints:", robot.joints);

    /*
      URDF is usually Z-up.
      Three.js is Y-up.
      Your current view looked correct with this rotation.
      If the robot looks rotated strangely, comment this line out.
    */
    robot.rotation.x = -Math.PI / 2;

    scene.add(robot);

    statusEl.innerText = "URDF loaded";

    setupJointSliders();
    collectVisualParts();
    buildLinkList();
    buildPartList();
    showAllParts();
    setActiveButton(showAllBtn);
  },

  progress => {
    console.log("URDF loading progress:", progress);
  },

  error => {
    console.error("Failed to load URDF:", error);
    statusEl.innerText = "Failed to load URDF. Check Console.";
  }
);

// =====================================================
// Joint sliders
// =====================================================

function setupJointSliders() {
  jointSliderListEl.innerHTML = "";

  const jointNames = Object.keys(robot.joints || {});

  const movableJointNames = jointNames.filter(jointName => {
    const joint = robot.joints[jointName];

    // Different versions of urdf-loader may expose joint type differently.
    // We filter out fixed joints.
    if (joint.jointType === "fixed") return false;
    if (joint.type === "fixed") return false;

    return true;
  });

  if (movableJointNames.length === 0) {
    jointSliderListEl.innerHTML =
      `<div class="hint">No movable joints found.</div>`;
    return;
  }

  for (const jointName of movableJointNames) {
    const joint = robot.joints[jointName];

    const row = document.createElement("div");
    row.className = "slider-row";

    const label = document.createElement("label");
    label.setAttribute("for", jointName);
    label.innerText = `${jointName}: 0.00 rad`;

    const slider = document.createElement("input");
    slider.id = jointName;
    slider.type = "range";
    slider.step = "0.01";
    slider.value = "0";

    const limits = getJointLimits(jointName, joint);
    slider.min = limits.lower;
    slider.max = limits.upper;

    slider.addEventListener("input", () => {
      const value = parseFloat(slider.value);
      setJoint(jointName, value);
      label.innerText = `${jointName}: ${value.toFixed(2)} rad`;
    });

    row.appendChild(label);
    row.appendChild(slider);
    jointSliderListEl.appendChild(row);

    setJoint(jointName, 0.0);
  }
}

function getJointLimits(jointName, joint) {
  const defaultLimits = {
    lower: -3.14,
    upper: 3.14
  };

  // Manual fallback limits for common toy 6-DOF arm names.
  const manualLimits = {
    joint1: { lower: -3.14, upper: 3.14 },
    joint2: { lower: -2.2, upper: 2.2 },
    joint3: { lower: -2.5, upper: 2.5 },
    joint4: { lower: -3.14, upper: 3.14 },
    joint5: { lower: -2.2, upper: 2.2 },
    joint6: { lower: -3.14, upper: 3.14 }
  };

  if (manualLimits[jointName]) {
    return manualLimits[jointName];
  }

  // Try to use limits from URDFLoader if available.
  if (joint.limit) {
    return {
      lower: joint.limit.lower ?? defaultLimits.lower,
      upper: joint.limit.upper ?? defaultLimits.upper
    };
  }

  if (joint.limits) {
    return {
      lower: joint.limits.lower ?? defaultLimits.lower,
      upper: joint.limits.upper ?? defaultLimits.upper
    };
  }

  return defaultLimits;
}

function setJoint(jointName, value) {
  if (!robot) return;

  const joint = robot.joints[jointName];

  if (!joint) {
    console.warn(`Joint ${jointName} not found. Existing joints:`, robot.joints);
    statusEl.innerText = `Joint ${jointName} not found`;
    return;
  }

  joint.setJointValue(value);
  statusEl.innerText = `${jointName} = ${value.toFixed(2)} rad`;
}

// =====================================================
// Collect visual parts
// =====================================================

function collectVisualParts() {
  visualParts = [];

  const linkNames = new Set(Object.keys(robot.links || {}));
  let counter = 0;

  robot.traverse(obj => {
    if (!obj.isMesh) return;

    const ownerLinkName = findOwnerLinkName(obj, linkNames);

    const rawName =
      obj.name && obj.name.trim().length > 0
        ? obj.name
        : `visual_${counter}`;

    const id = `part_${counter}`;

    obj.userData.partId = id;
    obj.userData.ownerLinkName = ownerLinkName;

    visualParts.push({
      id,
      label: rawName,
      linkName: ownerLinkName,
      object: obj
    });

    counter += 1;
  });

  console.log("Collected visual parts:", visualParts);
}

function findOwnerLinkName(obj, linkNames) {
  let cur = obj;

  while (cur) {
    if (cur.name && linkNames.has(cur.name)) {
      return cur.name;
    }

    cur = cur.parent;
  }

  return "unknown_link";
}

// =====================================================
// Build UI lists
// =====================================================

function buildLinkList() {
  linkListEl.innerHTML = "";

  const linkNames = Object.keys(robot.links || {});

  if (linkNames.length === 0) {
    linkListEl.innerHTML = `<div class="hint">No links found.</div>`;
    return;
  }

  for (const linkName of linkNames) {
    const btn = document.createElement("button");
    btn.className = "link-button";
    btn.innerText = linkName;

    btn.addEventListener("click", () => {
      showOnlyLink(linkName);
      setActiveButton(btn);
      statusEl.innerText = `Showing link: ${linkName}`;
    });

    linkListEl.appendChild(btn);
  }
}

function buildPartList() {
  partListEl.innerHTML = "";

  if (visualParts.length === 0) {
    partListEl.innerHTML = `<div class="hint">No visual parts found.</div>`;
    return;
  }

  for (const part of visualParts) {
    const btn = document.createElement("button");
    btn.className = "part-button";
    btn.innerText = `${part.linkName} / ${part.label}`;

    btn.addEventListener("click", () => {
      showOnlyPart(part.id);
      setActiveButton(btn);
      statusEl.innerText = `Showing part: ${part.label}`;
    });

    partListEl.appendChild(btn);
  }
}

// =====================================================
// Visibility controls
// =====================================================

showAllBtn.addEventListener("click", () => {
  showAllParts();
  setActiveButton(showAllBtn);
  statusEl.innerText = "Showing all parts";
});

function showAllParts() {
  for (const part of visualParts) {
    part.object.visible = true;
  }
}

function showOnlyPart(partId) {
  for (const part of visualParts) {
    part.object.visible = part.id === partId;
  }
}

function showOnlyLink(linkName) {
  for (const part of visualParts) {
    part.object.visible = part.linkName === linkName;
  }
}

function setActiveButton(activeBtn) {
  const buttons = document.querySelectorAll("button");
  buttons.forEach(btn => btn.classList.remove("active"));
  activeBtn.classList.add("active");
}

// =====================================================
// Render loop
// =====================================================

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

// =====================================================
// Resize
// =====================================================

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});