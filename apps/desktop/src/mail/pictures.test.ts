import { pictureURL, referencedPicture } from "./pictures.ts";
import { expect, test } from "bun:test";

test("mail pictures are complete referenced web images, not click destinations or private addresses", () => {
  const html = `<a href="https://tickets.example/shows"><img src="https://pictures.example/logo.png?day=2&amp;v=3"></a>
    <td background="https://pictures.example/poster.jpg"></td>
    <style>.hero{background-image:url('https://pictures.example/hero.webp')}</style>`;
  for (const url of [
    "https://pictures.example/logo.png?day=2&v=3",
    "https://pictures.example/poster.jpg",
    "https://pictures.example/hero.webp",
  ])
    expect(referencedPicture(html, url)?.href).toBe(url);
  for (const url of [
    "https://tickets.example/shows",
    "https://pictures.example/logo.png",
    "https://unlisted.example/file",
  ])
    expect(referencedPicture(html, url)).toBeNull();
  for (const url of [
    "https://localhost/logo",
    "https://127.0.0.1/logo",
    "file:///logo",
    "https://name:password@pictures.example/logo",
  ])
    expect(pictureURL(url)).toBeNull();
});
