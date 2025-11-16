// sim.js
export class VehicleSim {
  constructor(params){
    this.m = params.m;
    this.Iz = params.Iz;
    this.lf = params.lf;
    this.lr = params.lr;
    this.speed = params.u; // m/s

    this.P0 = params.P0;
    this.Calpha0 = params.Calpha0;
    this.sigma0 = params.sigma0;

    // single/global pressure (fallback) and per-wheel pressures
    this.pressure = this.P0;
    this.pressureFL = this.P0; this.pressureFR = this.P0; this.pressureRL = this.P0; this.pressureRR = this.P0;

    // dynamic state
    this.r = 0; // yaw rate (rad/s)
    this.vy = 0; // lateral velocity (m/s)
    this.time = 0;

    // inputs
    this.steerInput = 0; // degrees

    // visual nodes (set by bindVisual)
    this.visual = null;

    // buffers for plotting
    this.buf = {time:[], delta:[], yaw:[], slipFL:[], FyFL:[], MzFL:[], ay:[]};

    // visual steering angle used for smoothing visuals
    this.frontSteerAngle = 0;
  }

  bindVisual(nodes){
    this.visual = nodes;
    // set references on wheel meshes so scene can detect
    if(this.visual.frontLeftWheel) this.visual.frontLeftWheel.userData.isWheel = true;
    if(this.visual.frontRightWheel) this.visual.frontRightWheel.userData.isWheel = true;
    if(this.visual.rearLeftWheel) this.visual.rearLeftWheel.userData.isWheel = true;
    if(this.visual.rearRightWheel) this.visual.rearRightWheel.userData.isWheel = true;
  }

  // cornering stiffness from pressure (per wheel)
  CalphaFromP(P){
    return this.Calpha0 * Math.pow((P/this.P0), 0.8);
  }

  // step integrator
  step(dt){
    if(dt <= 0) return;
    this.time += dt;

    // inputs
    const delta_deg = this.steerInput;
    const delta = delta_deg * Math.PI/180;
    const u = this.speed;

    // pressures per axle: use average of left/right for front/rear calculations
    const Pf = 0.5 * (this.pressureFL + this.pressureFR);
    const Pr = 0.5 * (this.pressureRL + this.pressureRR);

    const Caf = this.CalphaFromP(Pf);
    const Car = this.CalphaFromP(Pr);

    // compute slip angles (small-angle linearization)
    const alpha_f = delta - (this.vy + this.lf * this.r) / (u + 1e-9);
    const alpha_r = - (this.vy - this.lr * this.r) / (u + 1e-9);

    const Fy_f = - Caf * alpha_f;
    const Fy_r = - Car * alpha_r;

    // dynamics (forward Euler)
    const vy_dot = (Fy_f + Fy_r) / this.m - u * this.r;
    const r_dot = (this.lf * Fy_f - this.lr * Fy_r) / this.Iz;

    this.vy += vy_dot * dt;
    this.r += r_dot * dt;

    const ay = this.vy + u * this.r;

    const Mz_f = 0.12 * Fy_f; // simple aligning torque

    // store in buffers
    this.buf.time.push(this.time);
    this.buf.delta.push(delta_deg);
    this.buf.yaw.push(this.r * 180/Math.PI);
    this.buf.slipFL.push(alpha_f * 180/Math.PI);
    this.buf.FyFL.push(Fy_f);
    this.buf.MzFL.push(Mz_f);
    this.buf.ay.push(ay);

    // cap buffers length
    const maxLen = 1200;
    for(const k in this.buf){
      if(this.buf[k].length > maxLen) this.buf[k].shift();
    }

    // update visuals
    this.updateVisual(delta, alpha_f, Fy_f);
  }

  updateVisual(steerRad, slipFL, FyFL){
    if(!this.visual) return;

    // smooth front steer visual
    this.frontSteerAngle += (steerRad - this.frontSteerAngle) * 0.25;

    const sp = this.visual.steerPivot;
    if(sp){
      // if model uses full vehicle pivot, rotate it
      sp.rotation.y = this.frontSteerAngle;
    }

    // wheels: roll and steer
    const wheelRadius = 0.33; // approx
    const rotSpeed = this.time * (this.speed / wheelRadius);

    const wheels = [this.visual.frontLeftWheel, this.visual.frontRightWheel, this.visual.rearLeftWheel, this.visual.rearRightWheel];

    // rotate about local X for roll
    wheels.forEach((w, idx) => {
      if(!w) return;
      w.rotation.x = rotSpeed;
      // apply steering for front wheels (rotate their parent if available)
      if(idx === 0 || idx === 1){
        // if wheel has a parent pivot, rotate parent for steer; otherwise rotate wheel around world Y (approx)
        if(w.parent) w.parent.rotation.y = this.frontSteerAngle;
        else w.rotation.y = this.frontSteerAngle;
      }
      // deformation based on this wheel's pressure (if set)
      let p = this.pressure;
      if(idx === 0) p = this.pressureFL;
      if(idx === 1) p = this.pressureFR;
      if(idx === 2) p = this.pressureRL;
      if(idx === 3) p = this.pressureRR;

      // scale for visual bulge (clamped)
      const deform = Math.max(0.8, Math.min(1.05, 1 - (32 - p) * 0.004));
      w.scale.set(deform, deform, deform);
    });
  }

  resetBuffers(){
    this.buf = {time:[], delta:[], yaw:[], slipFL:[], FyFL:[], MzFL:[], ay:[]};
    this.time = 0; this.r = 0; this.vy = 0;
  }
}
