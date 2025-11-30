/**
 * Hand Tracking Utility
 * ใช้ Mediapipe Holistic สำหรับ track มือ
 */

export class HandTracker {
  constructor(videoElement, canvasElement, options = {}) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext("2d");

    this.options = {
      // Lower default resolution and complexity for better responsiveness
      cameraWidth: options.cameraWidth || 640,
      cameraHeight: options.cameraHeight || 480,
      modelComplexity: options.modelComplexity || 0,
      // Disable smoothing by default to reduce latency (can enable if jitter is a problem)
      smoothLandmarks: options.smoothLandmarks ?? false,
      minDetectionConfidence: options.minDetectionConfidence || 0.7,
      minTrackingConfidence: options.minTrackingConfidence || 0.7,
      refineFaceLandmarks: options.refineFaceLandmarks ?? true,
      // Use hands-only (lighter) by default; set to false to use Holistic
      handsOnly: options.handsOnly ?? true,
      // Max number of hands to detect (lower can improve perf)
      maxNumHands: options.maxNumHands || 2,
      leftHandColor: options.leftHandColor || "yellow",
      leftHandPointColor: options.leftHandPointColor || "red",
      rightHandColor: options.rightHandColor || "lime",
      rightHandPointColor: options.rightHandPointColor || "aqua",
      lineWidth: options.lineWidth || 4,
      pointSize: options.pointSize || 5,
      onResults: options.onResults || null,
    };

    this.holistic = null;
    this.hands = null;
    this.camera = null;
    this.processor = null; // either Hands or Holistic instance

    this._init();
  }

  _init() {
    this._setupResize();
    this._setupHolistic();
    this._setupCamera();
  }

  _setupResize() {
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
  }

  /**
   * แปลง Mediapipe x,y (0–1) → Pixel บนจอจริง
   */
  mapPoint(x, y) {
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    const videoRatio = videoWidth / videoHeight;
    const canvasRatio = canvasWidth / canvasHeight;

    let drawWidth, drawHeight;

    // COVER SCALE
    if (canvasRatio > videoRatio) {
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / videoRatio;
    } else {
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * videoRatio;
    }

    const scale = drawWidth / videoWidth;

    const offsetX = (canvasWidth - drawWidth) / 2;
    const offsetY = (canvasHeight - drawHeight) / 2;

    // Map real pixel on scaled video
    const px = x * videoWidth * scale + offsetX;
    const py = y * videoHeight * scale + offsetY;

    return { x: px, y: py };
  }

  /**
   * วาด landmarks
   */
  drawLandmarks(landmarks, color = "red", size = 3) {
    this.ctx.fillStyle = color;
    for (let lm of landmarks) {
      const p = this.mapPoint(lm.x, lm.y);
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, size, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }

  /**
   * วาดเส้นเชื่อม
   */
  drawConnections(landmarks, connections, color = "cyan", width = 2) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;

    for (let [a, b] of connections) {
      const A = this.mapPoint(landmarks[a].x, landmarks[a].y);
      const B = this.mapPoint(landmarks[b].x, landmarks[b].y);

      this.ctx.beginPath();
      this.ctx.moveTo(A.x, A.y);
      this.ctx.lineTo(B.x, B.y);
      this.ctx.stroke();
    }
  }

  /**
   * วาดมือ
   */
  drawHand(landmarks, lineColor, pointColor) {
    if (!landmarks) return;
    this.drawConnections(
      landmarks,
      HAND_CONNECTIONS,
      lineColor,
      this.options.lineWidth
    );
    this.drawLandmarks(landmarks, pointColor, this.options.pointSize);
  }

  _setupHolistic() {
    // Create a processor: use Hands (lighter) when handsOnly=true, else Holistic
    if (this.options.handsOnly && typeof Hands !== "undefined") {
      this.hands = new Hands({
        locateFile: (f) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.5.1635989137/${f}`,
      });

      this.hands.setOptions({
        maxNumHands: this.options.maxNumHands,
        modelComplexity: this.options.modelComplexity,
        minDetectionConfidence: this.options.minDetectionConfidence,
        minTrackingConfidence: this.options.minTrackingConfidence,
      });

      this.hands.onResults((results) => this._onResults(results));
      this.processor = this.hands;
    } else {
      this.holistic = new Holistic({
        locateFile: (f) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${f}`,
      });

      this.holistic.setOptions({
        modelComplexity: this.options.modelComplexity,
        smoothLandmarks: this.options.smoothLandmarks,
        minDetectionConfidence: this.options.minDetectionConfidence,
        minTrackingConfidence: this.options.minTrackingConfidence,
        refineFaceLandmarks: this.options.refineFaceLandmarks,
      });

      this.holistic.onResults((results) => this._onResults(results));
      this.processor = this.holistic;
    }
  }

  _onResults(results) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.video.videoWidth) return;

    // Left Hand
    // Results format is slightly different between Holistic and Hands.
    // Both expose `leftHandLandmarks` and `rightHandLandmarks` for Holistic,
    // while Hands returns `multiHandLandmarks` + `multiHandedness`.
    if (this.options.handsOnly && results.multiHandLandmarks) {
      // multiHandLandmarks is an array of landmarks for each detected hand.
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const lm = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness && results.multiHandedness[i];
        const isLeft = handedness && handedness.label && handedness.label.toLowerCase().includes("left");
        const lineColor = isLeft ? this.options.leftHandColor : this.options.rightHandColor;
        const pointColor = isLeft ? this.options.leftHandPointColor : this.options.rightHandPointColor;
        this.drawHand(lm, lineColor, pointColor);
      }
    } else {
      // fallback for Holistic
      this.drawHand(
        results.leftHandLandmarks,
        this.options.leftHandColor,
        this.options.leftHandPointColor
      );

      this.drawHand(
        results.rightHandLandmarks,
        this.options.rightHandColor,
        this.options.rightHandPointColor
      );
    }

    // Custom callback
    if (this.options.onResults) {
      this.options.onResults(results);
    }
  }

  _setupCamera() {
    this.camera = new Camera(this.video, {
      onFrame: async () => {
        // Send frame to whichever processor we created (Hands or Holistic)
        if (this.processor && typeof this.processor.send === "function") {
          await this.processor.send({ image: this.video });
        }
      },
      width: this.options.cameraWidth,
      height: this.options.cameraHeight,
    });
  }

  /**
   * เริ่ม tracking
   */
  start() {
    this.camera.start();
  }

  /**
   * หยุด tracking
   */
  stop() {
    this.camera.stop();
  }
}

// Default export
export default HandTracker;
