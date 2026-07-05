/**
 * Evidence storage — all backed by Cloudinary (signed REST), split only by
 * media type. See docs/data-model.md.
 */
export { putSnapshot, type BlobPath } from './blob.js';
export { putImage, type ImageRef, type ImagePath } from './images.js';
export { cloudinaryConfigured, cloudinaryUpload, evidenceFolder } from './cloudinary.js';
