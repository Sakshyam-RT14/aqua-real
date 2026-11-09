const sharp = require("sharp");
const fs = require("fs");

const src = "ezgif-6b3d64072876ebe2-jpg";
const out = "frames";
fs.mkdirSync(out, { recursive: true });

(async () => {
  for (let i = 1; i <= 240; i++) {
  const n = String(i).padStart(3, "0");
  await sharp(`${src}/ezgif-frame-${n}.png`)
    .resize({ width: 1280, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(`${out}/f-${n}.webp`);
}
  console.log("Done");
})();