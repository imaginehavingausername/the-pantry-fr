"use client";

import Link from "next/link";
import { usePathname } from 'next/navigation';
import type { LinkProps } from "next/link"; // Import LinkProps for type safety

// Define the props by extending Next.js's LinkProps
interface PersistScrollLinkProps extends LinkProps {
  children: React.ReactNode; // Explicitly define children as a required prop
}

const PersistScrollLink = ({ href, children, ...props }: PersistScrollLinkProps) => {
  const pathname = usePathname();

  const handleNavigation = () => {
    // Save the scroll position for the current pathname
    sessionStorage.setItem(`scrollPosition_${pathname}`, window.scrollY.toString());
  };

  return (
    <Link href={href} onClick={handleNavigation} scroll={false} {...props}>
      {children}
    </Link>
  );
};

export default PersistScrollLink;