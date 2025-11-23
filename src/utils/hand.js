// hand.js - Hand Tracking Module

// เส้นเชื่อมต่อของมือ
const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4], // นิ้วหัวแม่มือ
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8], // นิ้วชี้
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12], // นิ้วกลาง
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16], // นิ้วนาง
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20], // นิ้วก้อย
  [5, 9],
  [9, 13],
  [13, 17], // ฝ่ามือ
];

// ตัวแปรสำหรับตรวจจับการปัดมือ
let previousHandX = null;
let swipeStartX = null;
let swipeStartTime = null;
const SWIPE_THRESHOLD = 0.15; // ระยะทางขั้นต่ำในการปัด (15% ของความกว้างหน้าจอ)
const SWIPE_TIME_THRESHOLD = 500; // เวลาสูงสุดในการปัด (milliseconds)
const SWIPE_COOLDOWN = 1000; // เวลารอระหว่างการตรวจจับปัด (milliseconds)
let lastSwipeTime = 0;

// ตัวแปรสำหรับตรวจจับท่ากำมือ (Fist Gesture)
let isFistDetected = false;
let fistStartTime = null;
const FIST_HOLD_DURATION = 1000; // เวลาที่ต้องกำมือค้าง (1 วินาที)
let swipeMode = false; // โหมดการปัดมือ (เปิด/ปิด)

// ตัวแปรเก็บ callback สำหรับการปัดซ้าย/ขวา
let onSwipeLeft = null;
let onSwipeRight = null;

// ฟังก์ชันวาดเส้นเชื่อมต่อ
const drawConnectors = (ctx, canvas, landmarks, connections, color) => {
  connections.forEach((connection) => {
    const start = landmarks[connection[0]];
    const end = landmarks[connection[1]];

    ctx.beginPath();
    ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
    ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
  });
};

// ฟังก์ชันวาดจุด
const drawLandmarks = (ctx, canvas, landmarks, color) => {
  landmarks.forEach((landmark) => {
    ctx.beginPath();
    ctx.arc(
      landmark.x * canvas.width,
      landmark.y * canvas.height,
      5,
      0,
      2 * Math.PI
    );
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
};

// ฟังก์ชันตรวจจับท่ากำมือ (Fist Detection)
const detectFist = (landmarks) => {
  // ตรวจสอบว่านิ้วทุกนิ้วงอหรือไม่ (ยกเว้นนิ้วหัวแม่มือ)
  // เปรียบเทียบระยะของ tip กับ MCP (ข้อนิ้ว)

  const fingerTips = [8, 12, 16, 20]; // ปลายนิ้วชี้, กลาง, นาง, ก้อย
  const fingerMCPs = [5, 9, 13, 17]; // ข้อนิ้วฐาน

  let closedFingers = 0;

  for (let i = 0; i < fingerTips.length; i++) {
    const tip = landmarks[fingerTips[i]];
    const mcp = landmarks[fingerMCPs[i]];
    const wrist = landmarks[0];

    // คำนวณระยะห่างจากข้อมือ
    const tipDistance = Math.sqrt(
      Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2)
    );
    const mcpDistance = Math.sqrt(
      Math.pow(mcp.x - wrist.x, 2) + Math.pow(mcp.y - wrist.y, 2)
    );

    // ถ้าปลายนิ้วอยู่ใกล้ข้อมือกว่าข้อนิ้ว = นิ้วงอ
    if (tipDistance < mcpDistance * 1.1) {
      closedFingers++;
    }
  }

  // ถ้านิ้วงออย่างน้อย 3 นิ้ว = ถือว่ากำมือ
  return closedFingers >= 3;
};

// ฟังก์ชันจัดการโหมดการปัดมือ (Toggle Swipe Mode)
const handleFistGesture = (landmarks) => {
  const currentTime = Date.now();
  const isFist = detectFist(landmarks);

  if (isFist) {
    if (!isFistDetected) {
      // เริ่มกำมือ
      isFistDetected = true;
      fistStartTime = currentTime;
    } else {
      // กำมือค้างอยู่
      const holdDuration = currentTime - fistStartTime;
      if (holdDuration >= FIST_HOLD_DURATION && fistStartTime !== null) {
        // Toggle โหมดการปัด
        swipeMode = !swipeMode;
        console.log(`Swipe Mode: ${swipeMode ? "ON" : "OFF"}`);
        fistStartTime = null; // ป้องกันการ toggle ซ้ำ
      }
    }
  } else {
    // ปล่อยมือ - รีเซ็ต
    isFistDetected = false;
    fistStartTime = null;
  }
};

// ฟังก์ชันตรวจจับการปัดมือ
const detectSwipe = (landmarks) => {
  // ตรวจสอบว่าเปิดโหมดปัดหรือไม่
  if (!swipeMode) {
    // รีเซ็ตค่าถ้าโหมดปิด
    previousHandX = null;
    swipeStartX = null;
    swipeStartTime = null;
    return;
  }

  const currentTime = Date.now();

  // ใช้ตำแหน่งข้อมือ (landmark 0) เป็นจุดอ้างอิง
  const wrist = landmarks[0];
  const currentX = wrist.x;

  // เริ่มต้นการปัด
  if (previousHandX === null) {
    previousHandX = currentX;
    swipeStartX = currentX;
    swipeStartTime = currentTime;
    return;
  }

  // คำนวณระยะทางที่เคลื่อนไหว
  const deltaX = currentX - swipeStartX;
  const timeDelta = currentTime - swipeStartTime;

  // ตรวจจับการปัดขวา (เคลื่อนจากซ้ายไปขวา)
  if (
    deltaX > SWIPE_THRESHOLD &&
    timeDelta < SWIPE_TIME_THRESHOLD &&
    currentTime - lastSwipeTime > SWIPE_COOLDOWN
  ) {
    console.log("right");
    if (onSwipeRight) onSwipeRight(); // เรียก callback
    lastSwipeTime = currentTime;
    // รีเซ็ตค่า
    swipeStartX = currentX;
    swipeStartTime = currentTime;
  }
  // ตรวจจับการปัดซ้าย (เคลื่อนจากขวาไปซ้าย)
  else if (
    deltaX < -SWIPE_THRESHOLD &&
    timeDelta < SWIPE_TIME_THRESHOLD &&
    currentTime - lastSwipeTime > SWIPE_COOLDOWN
  ) {
    console.log("left");
    if (onSwipeLeft) onSwipeLeft(); // เรียก callback
    lastSwipeTime = currentTime;
    // รีเซ็ตค่า
    swipeStartX = currentX;
    swipeStartTime = currentTime;
  }

  // รีเซ็ตถ้าเวลาเกินกำหนด
  if (timeDelta > SWIPE_TIME_THRESHOLD) {
    swipeStartX = currentX;
    swipeStartTime = currentTime;
  }

  previousHandX = currentX;
};

// ฟังก์ชันหลักสำหรับเริ่ม Hand Tracking
export const initHandTracking = async (videoElement) => {
  if (!videoElement) {
    console.error("Video element not found for hand tracking");
    return null;
  }

  // สร้าง canvas สำหรับวาดมือ
  const handCanvas = document.createElement("canvas");
  handCanvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
    transform: scaleX(-1);
  `;
  document.body.appendChild(handCanvas);

  const canvasCtx = handCanvas.getContext("2d");

  // ตั้งค่า MediaPipe Hands
  const hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    },
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  // กำหนด callback เมื่อตรวจจับมือได้
  hands.onResults((results) => {
    // ตั้งค่าขนาด canvas
    if (handCanvas.width !== videoElement.videoWidth) {
      handCanvas.width = videoElement.videoWidth;
      handCanvas.height = videoElement.videoHeight;
    }

    // ล้าง canvas
    canvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    // วาดมือถ้าตรวจจับได้
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      const handedness = results.multiHandedness[0].label;
      const isLeft = handedness === "Left";

      // ประมวลผลเฉพาะมือซ้าย
      if (isLeft) {
        const mainColor = "#ff00ff";
        const lightColor = "#ff88ff";

        // ตรวจจับท่ากำมือสำหรับ toggle mode
        handleFistGesture(landmarks);

        // ตรวจจับการปัดมือ (ทำงานเฉพาะเมื่อ swipeMode = true)
        detectSwipe(landmarks);

        // วาดเส้นและจุด
        drawConnectors(
          canvasCtx,
          handCanvas,
          landmarks,
          HAND_CONNECTIONS,
          mainColor
        );
        drawLandmarks(canvasCtx, handCanvas, landmarks, lightColor);

        // แสดงข้อความมือซ้าย
        const wrist = landmarks[0];
        canvasCtx.fillStyle = mainColor;
        canvasCtx.font = "bold 20px Arial";
        canvasCtx.fillText(
          "มือซ้าย",
          wrist.x * handCanvas.width,
          wrist.y * handCanvas.height - 20
        );

        // แสดงสถานะโหมดปัด
        canvasCtx.fillStyle = swipeMode ? "#00ff00" : "#ff0000";
        canvasCtx.font = "bold 24px Arial";
        canvasCtx.fillText(
          `Swipe Mode: ${swipeMode ? "ON" : "OFF"}`,
          wrist.x * handCanvas.width,
          wrist.y * handCanvas.height - 50
        );
      }
    }
  });

  // เริ่มประมวลผล hand detection
  const processHands = async () => {
    if (videoElement.readyState >= 2) {
      await hands.send({ image: videoElement });
    }
    requestAnimationFrame(processHands);
  };
  processHands();

  console.log("✅ Hand tracking initialized successfully");

  return {
    hands,
    canvas: handCanvas,
    setSwipeCallbacks: (leftCallback, rightCallback) => {
    //   onSwipeLeft = leftCallback;
      onSwipeRight = rightCallback;
    },
    stop: () => {
      hands.close();
      handCanvas.remove();
      console.log("🛑 Hand tracking stopped");
    },
  };
};

// Export สำหรับใช้งานใน HTML (ถ้าต้องการ)
if (typeof window !== "undefined") {
  window.initHandTracking = initHandTracking;
}
