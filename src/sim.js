// src/sim.js (STABLE & FIXED VERSION)

export class VehicleSim {
  constructor(params) {
    this.m = params.m;
    this.Iz = params.Iz;
    this.lf = params.lf;
    this.lr = params.lr;

    this.speed = params.u; // m/s, forward speed

    this.P0 = params.P0;
    this.Calpha0 = params.Calpha0;
    this.sigma0 = params.sigma0;

    // pressure (global + per-wheel)
    this.pressure = this.P0;
    this.pressureFL = this.P0;
    this.pressureFR = this.P0;
    this.pressureRL = this.P0;
    this.pressureRR = this.P0;

    // dynamic state
    this.r = 0; // yaw rate (rad/s)
    this.vy = 0; // lateral velocity
    this.time = 0;

    // wheel animation state
    this._wheelSpin = 0;

    // input
    this.steerInput = 0; // degrees

    this.visual = null;
    this.frontSteerAngle = 0;

    // buffers
    this.resetBuffers();
  }

  resetBuffers() {
    this.buf = {
      time: [],
      delta: [],
      yaw: [],
      slipFL: [],
      FyFL: [],
      MzFL: [],
      ay: [],
    };
    this.time = 0;
    this.vy = 0;
    this.r = 0;
  }

  bindVisual(nodes) {
    this.visual = nodes;
    if (nodes.frontLeftWheel) nodes.frontLeftWheel.userData.isWheel = true;
    if (nodes.frontRightWheel) nodes.frontRightWheel.userData.isWheel = true;
    if (nodes.rearLeftWheel) nodes.rearLeftWheel.userData.isWheel = true;
    if (nodes.rearRightWheel) nodes.rearRightWheel.userData.isWheel = true;
  }

  // Cornering stiffness from pressure
  CalphaFromP(P) {
    return this.Calpha0 * Math.pow(P / this.P0, 0.8);
  }

  step(dt) {
    if (dt <= 0) return;

    this.time += dt;

    // Input angle
    const delta_deg = this.steerInput;
    const delta = (delta_deg * Math.PI) / 180;

    // Safe forward speed
    const u = Math.max(0.01, this.speed);

    // Use front/rear average pressures
    const Pf = 0.5 * (this.pressureFL + this.pressureFR);
    const Pr = 0.5 * (this.pressureRL + this.pressureRR);

    const Caf = this.CalphaFromP(Pf);
    const Car = this.CalphaFromP(Pr);

    // Slip angles (safe)
    let alpha_f = delta - (this.vy + this.lf * this.r) / u;
    let alpha_r = -(this.vy - this.lr * this.r) / u;

    // Clamp slip angles
    const maxSlip = (20 * Math.PI) / 180;
    alpha_f = Math.max(-maxSlip, Math.min(maxSlip, alpha_f));
    alpha_r = Math.max(-maxSlip, Math.min(maxSlip, alpha_r));

    // Lateral forces
    const Fy_f_raw = -Caf * alpha_f;
    const Fy_r_raw = -Car * alpha_r;

    const FyMax = 1e5;
    const Fy_f = Math.max(-FyMax, Math.min(FyMax, Fy_f_raw));
    const Fy_r = Math.max(-FyMax, Math.min(FyMax, Fy_r_raw));

    // ---- DAMPING TERMS ----
    const Cv = 3000; // lateral velocity damping (N*s/m)
    const Cr = 2500; // yaw damping (N*m*s/rad)

    // Lateral and yaw dynamics with damping
    const vy_dot = (Fy_f + Fy_r - Cv * this.vy) / this.m - u * this.r;

    const r_dot = (this.lf * Fy_f - this.lr * Fy_r - Cr * this.r) / this.Iz;

    this.vy += vy_dot * dt;
    this.r += r_dot * dt;

    // Clamp state
    const vyMax = 50;
    const rMax = 50;
    this.vy = Math.max(-vyMax, Math.min(vyMax, this.vy));
    this.r = Math.max(-rMax, Math.min(rMax, this.r));

    // Reset if NaN or Inf
    if (!isFinite(this.vy) || !isFinite(this.r)) {
      console.warn("Numerical instability detected, resetting state.");
      this.vy = 0;
      this.r = 0;
    }

    const ay = this.vy + u * this.r;
    const Mz_f = 0.12 * Fy_f;

    // store
    this.buf.time.push(this.time);
    this.buf.delta.push(delta_deg);
    this.buf.yaw.push((this.r * 180) / Math.PI);
    this.buf.slipFL.push((alpha_f * 180) / Math.PI);
    this.buf.FyFL.push(Fy_f);
    this.buf.MzFL.push(Mz_f);
    this.buf.ay.push(ay);

    // keep last 2000 values
    const maxN = 2000;
    for (const k in this.buf) {
      if (this.buf[k].length > maxN) this.buf[k].shift();
    }

    this.updateVisual(delta, alpha_f, Fy_f, dt);
  }

  updateVisual(steerRad, slipFL, FyFL, dt) {
    if (!this.visual) return;

    // smooth steering
    this.frontSteerAngle += (steerRad - this.frontSteerAngle) * 0.2;

    // Steering pivot
    if (this.visual.steerPivot) {
      this.visual.steerPivot.rotation.y = this.frontSteerAngle;
    }

    // Wheel roll
    const wheelR = 0.33;
    const omega = this.speed / wheelR;
    this._wheelSpin += omega * dt;

    const wheels = [
      this.visual.frontLeftWheel,
      this.visual.frontRightWheel,
      this.visual.rearLeftWheel,
      this.visual.rearRightWheel,
    ];

    wheels.forEach((w, i) => {
      if (!w) return;

      // roll
      w.rotation.x = this._wheelSpin;

      // steering on front wheels
      if (i === 0 || i === 1) {
        if (w.parent) w.parent.rotation.y = this.frontSteerAngle;
      }

      // deformation
      let p = this.pressure;
      if (i === 0) p = this.pressureFL;
      if (i === 1) p = this.pressureFR;
      if (i === 2) p = this.pressureRL;
      if (i === 3) p = this.pressureRR;

      const deform = Math.max(0.8, Math.min(1.05, 1 - (32 - p) * 0.004));
      w.scale.set(deform, deform, deform);
    });
  }
}
