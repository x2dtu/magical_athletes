export function playSound(name: "dice_roll" | "ability" | "trip" | "move_space" | "point") {
  const audio = new Audio(`/sounds/${name}.mp3`);
  audio.play().catch(() => {}); // ignore autoplay restrictions
}
