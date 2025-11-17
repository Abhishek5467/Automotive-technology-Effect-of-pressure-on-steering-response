// src/scene.js (STABLE & FIXED VERSION)

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { gsap } from "gsap";

export async function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0b);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(devicePixelRatio);
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    500
  );
  camera.position.set(6, 2.5, 8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(5, 10, 5);
  scene.add(dir);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const loader = new GLTFLoader();

  // Model references
  let modelNodes = null;
  let onReady = null;

  loader.load(
    "/models/porsche.glb",
    (gltf) => {
      const car = gltf.scene;
      car.scale.set(1.2, 1.2, 1.2);
      scene.add(car);

      const find = (name) =>
        car.getObjectByName(name) ||
        car.getObjectByProperty("name", name) ||
        null;

      const fl = find("wheel_fl");
      const fr = find("wheel_fr");
      const rl = find("wheel_rl");
      const rr = find("wheel_rr");

      const steerPivot =
        find("steerPivot") ||
        find("steering") ||
        find("steering_pivot") ||
        null;

      modelNodes = {
        car,
        frontLeftWheel: fl,
        frontRightWheel: fr,
        rearLeftWheel: rl,
        rearRightWheel: rr,
        steerPivot
      };

      if (onReady) onReady(modelNodes);
    },
    undefined,
    (err) => console.error(err)
  );

  // ---------- CLICK → FOCUS ----------
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const wheelLabel = document.getElementById("wheel-label");
  let focusedWheel = null;
  let interval = null;

  function setLabelVisible(v) {
    wheelLabel.style.display = v ? "block" : "none";
  }

  function updateLabel() {
    if (!focusedWheel) return;
    const pos = new THREE.Vector3();
    focusedWheel.getWorldPosition(pos);

    const p = pos.clone().project(camera);
    const x = (p.x * 0.5 + 0.5) * container.clientWidth;
    const y = (-p.y * 0.5 + 0.5) * container.clientHeight;

    wheelLabel.style.left = `${x + 10}px`;
    wheelLabel.style.top = `${y - 20}px`;

    // update pressure text
    if (window.sim && window.sim.visual) {
      let text = "Pressure: ";
      const sim = window.sim;

      if (focusedWheel === sim.visual.frontLeftWheel)
        text += `${sim.pressureFL.toFixed(1)} psi (FL)`;
      else if (focusedWheel === sim.visual.frontRightWheel)
        text += `${sim.pressureFR.toFixed(1)} psi (FR)`;
      else if (focusedWheel === sim.visual.rearLeftWheel)
        text += `${sim.pressureRL.toFixed(1)} psi (RL)`;
      else if (focusedWheel === sim.visual.rearRightWheel)
        text += `${sim.pressureRR.toFixed(1)} psi (RR)`;
      else text += `${sim.pressure.toFixed(1)} psi`;

      wheelLabel.innerText = text;
    }
  }

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    if (!modelNodes) return;

    const wheels = [
      modelNodes.frontLeftWheel,
      modelNodes.frontRightWheel,
      modelNodes.rearLeftWheel,
      modelNodes.rearRightWheel
    ].filter(Boolean);

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(wheels, true);

    if (hit.length > 0) focusWheel(hit[0].object);
    else clearFocus();
  });

  function focusWheel(wheel) {
    focusedWheel = wheel;

    const pos = new THREE.Vector3();
    wheel.getWorldPosition(pos);
    const camPos = pos.clone().add(new THREE.Vector3(1.2, 0.7, 1.3));

    gsap.to(camera.position, {
      x: camPos.x,
      y: camPos.y,
      z: camPos.z,
      duration: 0.7,
      ease: "power2.out"
    });

    gsap.to(controls.target, {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      duration: 0.7,
      onUpdate: () => controls.update()
    });

    setLabelVisible(true);
    updateLabel();

    if (interval) clearInterval(interval);
    interval = setInterval(updateLabel, 100);
  }

  function clearFocus() {
    if (interval) clearInterval(interval);
    interval = null;
    focusedWheel = null;
    setLabelVisible(false);
  }

  // ---------- UPDATE LOOP ----------
  function update() {
    renderer.render(scene, camera);
    if (focusedWheel) updateLabel();
  }

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return {
    update,
    onModelReady(cb) {
      onReady = cb;
      if (modelNodes) cb(modelNodes);
    }
  };
}
