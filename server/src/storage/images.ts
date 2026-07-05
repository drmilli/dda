import { cloudinaryUpload, evidenceFolder } from './cloudinary.js';

/**
 * Image evidence — screenshots and captured images (primarily Module 5).
 * Uploaded to Cloudinary as resource_type 'image', write-once. See
 * docs/data-model.md.
 */
export interface ImageRef {
  url: string;
}

export interface ImagePath {
  projectId: string;
  reportVersion: number;
  module: string;
  checkId: string;
}

export async function putImage(data: Buffer | string, path: ImagePath): Promise<ImageRef> {
  const file =
    typeof data === 'string' ? data : `data:image/png;base64,${data.toString('base64')}`;
  const url = await cloudinaryUpload({
    resourceType: 'image',
    folder: evidenceFolder(path.projectId, path.reportVersion, path.module),
    publicId: path.checkId,
    file,
  });
  return { url };
}
