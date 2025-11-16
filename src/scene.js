// scene.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from 'gsap';

export async function createScene(container){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0b);

  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 0.1, 500);
  camera.position.set(6,2.5,8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0,0.6,0);
  controls.update();

  const dir = new THREE.DirectionalLight(0xffffff,1.0);
  dir.position.set(5,10,5);
  scene.add(dir);
  scene.add(new THREE.AmbientLight(0x404040, 1.0));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshStandardMaterial({color:0x222222}));
  ground.rotation.x = -Math.PI/2; ground.position.y = 0;
  scene.add(ground);

  // helpers
  const loader = new GLTFLoader();

  // container for model nodes we will pass to sim
  let modelNodes = null;
  let onReadyCb = null;

  loader.load('/models/porsche.glb', (gltf) => {
    const car = gltf.scene;
    car.scale.set(1.2,1.2,1.2);
    car.position.set(0,0,0);
    scene.add(car);

    // collect nodes by common names (lowercase)
    const names = {};
    car.traverse((n)=>{
      if(n.name) names[n.name.toLowerCase()] = n;
    });

    // heuristics -- adjust if your model uses different naming
    const steerPivot = names['steerpivot'] || names['steer'] || names['steering'] || names['steering_pivot'] || names['steering_wheel'] || null;

    const fl = names['wheel_fl'] || names['front_left_wheel'] || names['wheel.front_left'] || names['wheel_fl_1'] || names['wheel1'] || null;
    const fr = names['wheel_fr'] || names['front_right_wheel'] || names['wheel.front_right'] || names['wheel_fr_1'] || names['wheel2'] || null;
    const rl = names['wheel_rl'] || names['rear_left_wheel'] || names['wheel.rl'] || names['wheel_rl_1'] || names['wheel3'] || null;
    const rr = names['wheel_rr'] || names['rear_right_wheel'] || names['wheel.rr'] || names['wheel_rr_1'] || names['wheel4'] || null;

    // fallback: search circular-ish meshes by bounding box and give them to wheels if not found
    const wheelsFound = [fl,fr,rl,rr].filter(x=>x);
    if(wheelsFound.length < 4){
      // try to find candidate wheel meshes by aspect ratio (rough)
      const candidates = [];
      car.traverse((n)=>{
        if(n.isMesh){
          const box = new THREE.Box3().setFromObject(n);
          const size = new THREE.Vector3();
          box.getSize(size);
          const ratio = Math.max(size.x,size.y,size.z)/Math.min(size.x,size.y,size.z);
          if(ratio < 1.5 && size.length() > 0.05) candidates.push(n);
        }
      });
      // sort by size descending
      candidates.sort((a,b)=> (new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).length()) - (new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3()).length()));
      // assign first 4 if any missing
      const slotNames = ['frontLeftWheel','frontRightWheel','rearLeftWheel','rearRightWheel'];
      let idx=0;
      const nodes = {frontLeftWheel:fl, frontRightWheel:fr, rearLeftWheel:rl, rearRightWheel:rr};
      for(const key of Object.keys(nodes)){
        if(!nodes[key] && candidates[idx]){
          nodes[key] = candidates[idx++];
        }
      }
      modelNodes = {steerPivot, car, ...nodes};
    } else {
      modelNodes = {steerPivot, car, frontLeftWheel:fl, frontRightWheel:fr, rearLeftWheel:rl, rearRightWheel:rr};
    }

    // clickable wheels array
    const clickableWheels = [];
    if(modelNodes.frontLeftWheel) clickableWheels.push(modelNodes.frontLeftWheel);
    if(modelNodes.frontRightWheel) clickableWheels.push(modelNodes.frontRightWheel);
    if(modelNodes.rearLeftWheel) clickableWheels.push(modelNodes.rearLeftWheel);
    if(modelNodes.rearRightWheel) clickableWheels.push(modelNodes.rearRightWheel);

    // make small highlight material helper (optional)
    clickableWheels.forEach(w => {
      // ensure the wheel is castShadow friendly
      w.userData.isWheel = true;
    });

    if(onReadyCb) onReadyCb(modelNodes, {camera, controls, renderer, clickableWheels, scene});
  }, undefined, (err)=>{ console.error('GLTF load error', err); });

  // raycaster for clicks
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const wheelLabel = document.getElementById('wheel-label');
  let focusedWheel = null;
  let focusInterval = null;
  let lastMouseDown = 0;

  function onClick(ev){
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = (ev.clientX - rect.left)/rect.width * 2 - 1;
    mouse.y = -((ev.clientY - rect.top)/rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    // intersect clickable wheels
    const intersects = raycaster.intersectObjects(scene.children, true);
    if(!intersects || intersects.length===0) return;
    // find first wheel in intersects
    const wheelHit = intersects.find(i => i.object && i.object.userData && i.object.userData.isWheel);
    if(wheelHit){
      focusOnWheel(wheelHit.object);
    }
  }

  function focusOnWheel(wheel){
    if(!wheel) return;
    focusedWheel = wheel;

    const target = new THREE.Vector3();
    wheel.getWorldPosition(target);
    const camOffset = new THREE.Vector3(1.0,0.6,1.2);

    // position camera relative to wheel in world space
    const camPos = target.clone().add(camOffset);

    gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 0.9, ease:'power2.out' });
    gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration: 0.9, ease:'power2.out', onUpdate: ()=>controls.update() });

    // show label and update continuously while focused
    wheelLabel.style.display = 'block';
    updateLabelPosition(); // immediate
    if(focusInterval) clearInterval(focusInterval);
    focusInterval = setInterval(()=> {
      updateLabelPosition();
      // if sim exists, pick pressure for specific wheel (if present)
      const sim = window.sim;
      if(sim && focusedWheel){
        // attempt to detect which wheel: compare by reference
        let labelText = 'Pressure: ';
        if(sim.visual && sim.visual.frontLeftWheel && focusedWheel === sim.visual.frontLeftWheel) labelText += `${sim.pressureFL.toFixed(1)} psi (FL)`;
        else if(sim.visual && sim.visual.frontRightWheel && focusedWheel === sim.visual.frontRightWheel) labelText += `${sim.pressureFR.toFixed(1)} psi (FR)`;
        else if(sim.visual && sim.visual.rearLeftWheel && focusedWheel === sim.visual.rearLeftWheel) labelText += `${sim.pressureRL.toFixed(1)} psi (RL)`;
        else if(sim.visual && sim.visual.rearRightWheel && focusedWheel === sim.visual.rearRightWheel) labelText += `${sim.pressureRR.toFixed(1)} psi (RR)`;
        else labelText += `${sim.pressure.toFixed(1)} psi`;
        wheelLabel.innerText = labelText;
      }
    }, 80);
  }

  function updateLabelPosition(){
    if(!focusedWheel) return;
    const worldPos = new THREE.Vector3();
    focusedWheel.getWorldPosition(worldPos);
    const proj = worldPos.clone().project(camera);
    const x = (proj.x * 0.5 + 0.5) * container.clientWidth;
    const y = (-proj.y * 0.5 + 0.5) * container.clientHeight;
    wheelLabel.style.left = `${x + 12}px`;
    wheelLabel.style.top = `${y - 18}px`;
  }

  // deselect when clicking empty space
  function onDocClick(ev){
    // if click was outside renderer, ignore
    const rect = renderer.domElement.getBoundingClientRect();
    if(ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom){
      return;
    }
    // if no wheel intersected clear focus
    const rectR = renderer.domElement.getBoundingClientRect();
    mouse.x = (ev.clientX - rectR.left)/rectR.width * 2 - 1;
    mouse.y = -((ev.clientY - rectR.top)/rectR.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const ints = raycaster.intersectObjects(scene.children, true);
    const wheelHit = ints.find(i => i.object && i.object.userData && i.object.userData.isWheel);
    if(!wheelHit){
      if(focusInterval) { clearInterval(focusInterval); focusInterval = null; }
      focusedWheel = null;
      wheelLabel.style.display = 'none';
    }
  }

  window.addEventListener('click', onClick);
  window.addEventListener('click', onDocClick);

  // update loop
  function update(delta){
    // if focused, update label screen pos every frame (keeps it synced while camera moves)
    if(focusedWheel) updateLabelPosition();
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', ()=> {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return {
    update,
    onModelReady: (cb) => { onReadyCb = cb; if(modelNodes) cb(modelNodes); },
  };
}
