// Small, valid synthetic upload inputs. These are files, not rendered application screenshots.
export const projectPicture = {
  name: "synthetic-project-picture.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  ),
};

export const releaseChecklist = {
  name: "synthetic-release-checklist.txt",
  mimeType: "text/plain",
  buffer: Buffer.from(
    "Synthetic mobile review checklist\n\nReview the handoff with Jordan.\nConfirm the launch date.\nNo real customer information.\n",
  ),
};
