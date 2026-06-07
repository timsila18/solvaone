import Link from "next/link";
import Image from "next/image";

export function Logo() {
  return (
    <Link href="/" className="flex items-center" aria-label="SolvaOne home">
      <Image
        src="/solvaone-logo.png"
        alt="SolvaOne - Create. Apply. Grow."
        width={180}
        height={180}
        priority
        className="h-14 w-auto rounded-lg object-contain"
      />
    </Link>
  );
}
