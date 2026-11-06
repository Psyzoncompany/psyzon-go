export async function prepareOrderPhoto(file: File, { dimension, limit, fallbackQuality }: { dimension: number; limit: number; fallbackQuality: number }) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Use uma foto JPG, PNG ou WebP de até 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, dimension / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL("image/jpeg", .8);
    if (result.length > limit) result = canvas.toDataURL("image/jpeg", fallbackQuality);
    if (result.length > limit) throw new Error("A foto ainda ficou muito grande. Escolha uma imagem menor.");
    return result;
  } finally { bitmap.close(); }
}
