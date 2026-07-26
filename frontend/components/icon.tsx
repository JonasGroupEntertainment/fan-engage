import Image from "next/image";

const ICONS = {
  trophy: "/images/icons/trophy.png",
  ticket: "/images/icons/ticket.png",
  handshake: "/images/icons/handshake.png",
  mic: "/images/icons/mic.png",
  medal: "/images/icons/medal.png",
  hourglass: "/images/icons/hourglass.png",
  headphones: "/images/icons/headphones.png",
  lightning: "/images/icons/lightning.png",
  gift: "/images/icons/gift.png",
  chat: "/images/icons/chat.png",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 24,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={ICONS[name]}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
