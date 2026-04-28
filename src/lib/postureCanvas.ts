import { getCanvasFitSize, loadImageForCanvas } from './canvasImage';
import { drawPoseOverlay, type PoseKeypoint, type RegionScore } from './postureUtils';

const ALIGN_RATIO = 3 / 4;

type CropBox = { x: number; y: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getRatioCrop = (imgW: number, imgH: number, ratio: number): CropBox => {
  const imageRatio = imgW / imgH;
  if (imageRatio > ratio) {
    const width = imgH * ratio;
    return { x: (imgW - width) / 2, y: 0, width, height: imgH };
  }
  const height = imgW / ratio;
  return { x: 0, y: (imgH - height) / 2, width: imgW, height };
};

const normalizeCropFromKeypoints = (keypoints: PoseKeypoint[] | null, imgW: number, imgH: number): CropBox => {
  if (!Array.isArray(keypoints) || keypoints.length < 10) return getRatioCrop(imgW, imgH, ALIGN_RATIO);

  const valid = keypoints.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.confidence) && p.confidence > 0.2
  );
  if (valid.length < 8) return getRatioCrop(imgW, imgH, ALIGN_RATIO);

  const pointsPx = valid.map((p) => ({ x: p.x * imgW, y: p.y * imgH }));
  const minX = Math.min(...pointsPx.map((p) => p.x));
  const maxX = Math.max(...pointsPx.map((p) => p.x));
  const minY = Math.min(...pointsPx.map((p) => p.y));
  const maxY = Math.max(...pointsPx.map((p) => p.y));

  const bodyW = Math.max(40, maxX - minX);
  const bodyH = Math.max(80, maxY - minY);
  const shoulderL = keypoints[11];
  const shoulderR = keypoints[12];
  const shoulderMidX = shoulderL && shoulderR ? ((shoulderL.x + shoulderR.x) / 2) * imgW : (minX + maxX) / 2;
  const topCandidates = [keypoints[0], keypoints[7], keypoints[8], keypoints[11], keypoints[12]]
    .filter((p): p is PoseKeypoint => !!p && p.confidence > 0.2)
    .map((p) => p.y * imgH);
  const topAnchorY = topCandidates.length ? Math.min(...topCandidates) : minY;

  let cropWidth = Math.max(bodyW * 1.8, (bodyH * 1.45) * ALIGN_RATIO);
  let cropHeight = cropWidth / ALIGN_RATIO;
  if (cropHeight > imgH) {
    cropHeight = imgH;
    cropWidth = cropHeight * ALIGN_RATIO;
  }
  if (cropWidth > imgW) {
    cropWidth = imgW;
    cropHeight = cropWidth / ALIGN_RATIO;
  }

  return {
    x: clamp(shoulderMidX - cropWidth / 2, 0, imgW - cropWidth),
    y: clamp(topAnchorY - cropHeight * 0.16, 0, imgH - cropHeight),
    width: cropWidth,
    height: cropHeight,
  };
};

export const remapKeypointsToCrop = (keypoints: PoseKeypoint[], crop: CropBox, imgW: number, imgH: number): PoseKeypoint[] => (
  keypoints.map((p) => ({ ...p, x: ((p.x * imgW) - crop.x) / crop.width, y: ((p.y * imgH) - crop.y) / crop.height }))
);

export const drawPostureGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const cols = 24;
  const rows = 32;
  ctx.save();
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.24)';
  ctx.lineWidth = Math.max(1, Math.round(width / 420));
  for (let i = 1; i < cols; i++) {
    ctx.beginPath();
    ctx.moveTo((width / cols) * i, 0);
    ctx.lineTo((width / cols) * i, height);
    ctx.stroke();
  }
  for (let i = 1; i < rows; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (height / rows) * i);
    ctx.lineTo(width, (height / rows) * i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.65)';
  ctx.lineWidth = Math.max(2, Math.round(width / 220));
  ctx.setLineDash([Math.max(8, width / 80), Math.max(5, width / 120)]);
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.restore();
};

export const renderPostureAnalysisCanvas = async ({
  photoUrl,
  keypoints,
  scores = [],
  maxWidth = 720,
  drawGrid = true,
  drawPose = true,
  onAfterImage,
}: {
  photoUrl: string;
  keypoints: PoseKeypoint[] | null;
  scores?: RegionScore[];
  maxWidth?: number;
  drawGrid?: boolean;
  drawPose?: boolean;
  onAfterImage?: (canvas: HTMLCanvasElement, remappedKeypoints: PoseKeypoint[] | null) => void;
}): Promise<HTMLCanvasElement> => {
  const { image, cleanup } = await loadImageForCanvas(photoUrl);
  try {
    const imageW = image.naturalWidth || image.width;
    const imageH = image.naturalHeight || image.height;
    const size = getCanvasFitSize(maxWidth, Math.round(maxWidth / ALIGN_RATIO), maxWidth);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const crop = normalizeCropFromKeypoints(keypoints, imageW, imageH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

    const remapped = Array.isArray(keypoints) && keypoints.length ? remapKeypointsToCrop(keypoints, crop, imageW, imageH) : null;
    onAfterImage?.(canvas, remapped);
    if (drawGrid) drawPostureGrid(ctx, canvas.width, canvas.height);
    if (drawPose && remapped && remapped.length >= 29) drawPoseOverlay(ctx, remapped, canvas.width, canvas.height, Array.isArray(scores) ? scores : []);
    return canvas;
  } finally {
    cleanup();
  }
};

export const canvasToSafeDataUrl = (canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.9) => {
  try {
    const dataUrl = canvas.toDataURL(type, quality);
    if (dataUrl && dataUrl !== 'data:,') return dataUrl;
  } catch {
    // fallback below
  }
  return canvas.toDataURL('image/png');
};

export const renderPostureAnalysisDataUrl = async (args: Parameters<typeof renderPostureAnalysisCanvas>[0]) => (
  canvasToSafeDataUrl(await renderPostureAnalysisCanvas(args), 'image/jpeg', 0.88)
);