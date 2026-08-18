import Image from "next/image";

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/icone.png"
      alt="Farmácia Preço Bom"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
      priority
    />
  );
}
