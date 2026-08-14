// Decodes a YOLOv8-style ONNX export: output shape [1, 4 + numClasses, numBoxes]
// (box coords are cx, cy, w, h in model-input pixel space, transposed layout).
// Swap CLASS_NAMES for your trained PPE classes once you export your own model.

export const CLASS_NAMES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
  'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
  'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
  'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
  'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
  'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
  'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
  'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
  'hair drier', 'toothbrush'
];

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const inter = interW * interH;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter + 1e-6);
}

function nms(boxes, iouThreshold) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep = [];
  while (sorted.length) {
    const current = sorted.shift();
    keep.push(current);
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (sorted[i].classId === current.classId && iou(current, sorted[i]) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }
  return keep;
}

/**
 * @param {Float32Array} output - raw model output data
 * @param {number[]} dims - output tensor dims, e.g. [1, 84, 8400]
 * @param {number} inputSize - square model input size (e.g. 640)
 * @param {number} confThreshold
 * @param {number} iouThreshold
 */
export function decodeYolo(output, dims, inputSize, confThreshold = 0.35, iouThreshold = 0.45) {
  const [, numAttrs, numBoxes] = dims;
  const numClasses = numAttrs - 4;
  const boxes = [];

  for (let i = 0; i < numBoxes; i += 1) {
    let bestScore = 0;
    let bestClass = -1;
    for (let c = 0; c < numClasses; c += 1) {
      const score = output[(4 + c) * numBoxes + i];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    if (bestScore < confThreshold) continue;

    const cx = output[0 * numBoxes + i];
    const cy = output[1 * numBoxes + i];
    const w = output[2 * numBoxes + i];
    const h = output[3 * numBoxes + i];

    boxes.push({
      x1: (cx - w / 2) / inputSize,
      y1: (cy - h / 2) / inputSize,
      x2: (cx + w / 2) / inputSize,
      y2: (cy + h / 2) / inputSize,
      score: bestScore,
      classId: bestClass,
      label: CLASS_NAMES[bestClass] || `class_${bestClass}`
    });
  }

  return nms(boxes, iouThreshold);
}
