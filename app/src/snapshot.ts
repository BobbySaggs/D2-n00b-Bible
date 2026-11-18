// Saves the snapshot as a gzipped JSON file (falls back to plain JSON on old browsers).
export async function downloadSnapshot(data: unknown, name: string) {
  const json = JSON.stringify(data);
  let blob: Blob, file = `${name}.json`;
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
    blob = await new Response(stream).blob();
    file += ".gz";
  } else {
    blob = new Blob([json], { type: "application/json" });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { file, bytes: blob.size };
}
